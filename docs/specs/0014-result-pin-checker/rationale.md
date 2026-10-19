# 0014. Result PIN checker: decision record

## Context

Release 3 puts results online from Second Term 2026/2027 (around April 2027). Parents get results first through a PIN slip on one public result page (scope #21); sending results on WhatsApp comes much later (#19). Parents have no accounts, and some schools have no admission numbers (spec 0003). The school decides who gets a slip, often only once fees are paid, so the paper slip itself is the gate.

The forces:
- **A public page holding children's data.** Names, scores, positions and comments are personal data under the Nigeria Data Protection Act (spec 0003). The page has no login, so the PIN is the only thing between a stranger and a child's result. It must be hard to guess, never readable from the database, and dead once a slip is reported lost.
- **Parents on cheap phones and shared networks.** Most parents use Android phones on mobile networks where many people share one IP address. They type the PIN by hand from paper, so typos are common, and a careless guess limit would block honest parents on results day.
- **What parents see must stay true.** Parents check line by line and compare with other parents. A result that changes after release starts disputes the school must answer. Today the current term still takes scores and class changes (spec 0009, spec 0008).
- **One developer, one pilot school, a small budget.** No new paid service. Our team onboards and runs the school (spec 0004: only form masters and our team have logins), so whatever the school needs done goes through us for now.
- **The report card already exists.** Spec 0012 built one card model and document for the class PDF, the reprint and this page.

The consequence of not deciding: Release 3 has no way to show results online, and the paper only process continues.

## Options considered

### Option 1: Random PIN looked up by a keyed hash, whole school release that locks the term (chosen)

Make an 11 digit random PIN plus a check digit, store only its HMAC under a server secret behind a unique index, print slips at the moment they are made, replace lost ones, and release each school's term with one switch that also refuses writes to that term.

**Pros**:
- One indexed read finds a typed PIN; no second thing for the parent to type.
- A database copy alone reveals no PIN; the key lives only in the deploy environment.
- The check digit catches honest typos without spending a guess.
- One release switch matches a school's one results day, and the lock keeps released results fixed.

**Cons**:
- Slips can't be reprinted; a lost file means remaking a run.
- The key can't be rotated without reprinting every live slip, and losing it kills them all.
- The lock means withdrawing a whole school's results to fix one score.

### Option 2: Reversible encryption, so slips can be reprinted

Store each PIN encrypted with a server key, decrypt to reprint any slip, and look up by a separate keyed hash.

**Pros**:
- Our team can reprint any slip or class at any time; a lost file costs nothing.
- Same lookup speed as Option 1.

**Cons**:
- Anyone with the key and a database copy reads every PIN; the scope says PINs are never stored readable.
- Reprints mean two copies of a working slip can exist, so "lost" no longer means "dead" unless every reprint is also a replace.

### Option 3: Slow password hash plus a serial number

Hash each PIN with a slow password hash (bcrypt or argon2) and have the parent type the slip's serial too, so the server knows which single row to check.

**Pros**:
- Strongest against a leaked database: each PIN costs real time to guess offline, even with the key.

**Cons**:
- Two things to type from paper, doubling typos.
- A slow hash per check costs server time on results day, and the serial lets a guesser target one known slip.
- The scope asks for a 12 digit PIN with nothing else to type.

### Option 4: Release per class by the form master, no lock

Each form master releases their class once it is final; scores stay editable.

**Pros**:
- Classes go out as they finish; no one waits for a late class.
- No changes to existing writers.

**Cons**:
- Teachers decide when parents see results, which schools usually keep for the principal or the office.
- Parents may see a result change after they first looked.
- Every class needs its own release step and state.

## Rationale

The PIN is the only lock on a public page holding children's results, so its storage follows the scope's rule that PINs are never readable: Option 2 breaks that rule outright, and Option 3 buys protection against an attacker who already has both the database and the key, at the cost of a second field every parent must type from paper on a cheap phone. A keyed hash keeps the parent's job to 12 digits, finds the slip in one indexed read, and makes a stolen database copy useless on its own. The price is real and accepted on purpose: slips are made and printed in one step, a lost file is recovered by remaking its run (which is why print runs exist), and the key must be backed up on day one.

Guessing is held back mostly by the size of the PIN space (100 billion PINs against a few hundred live slips) and only partly by the throttle, because Nigerian mobile networks put many phones behind one IP. That is why the throttle is per IP and looser than login's (10 in 15 minutes, 100 a day), why the check digit exists (honest typos never count), and why a correct PIN doesn't reset the count (one real slip must not buy unlimited guesses).

The engineer chose one whole school release by our team, matching a school's single results day and the fact that only our team administers schools today (spec 0004). A class that isn't ready simply shows "not ready yet", so one late form master doesn't hold back the school. The lock follows from the forces: parents compare results, so once released, a result must not move. It covers scores, comments, class lists and the session's grading setup, which are everything that changes a figure or a position; labels (names, the signer, school details, remark band wording) stay editable and are named in the consequences. The grading setup is per session, so the engineer chose to lock it while any term of the session is released, accepting that a mid year change needs a withdraw and a release again.

A cross check on a second model before acceptance found that most session writers never lock the term row, that switching the current term could copy students into a released term, that removing a student deleted enrolments in every term, that the read then bump throttle let parallel guesses through, and that reserving serials inside the print transaction would block adding students during a render. Each is fixed in the build spec (AC-4, AC-15, AC-19 and the slip route steps). Withdrawing the release is the one way to fix a mistake, and it is immediate everywhere because every view checks again.

Smaller calls made in writing:
- The result cookie holds a signed slip id for 30 minutes, not the PIN, so a refresh and the download work with no PIN in any URL (runner up: type the PIN again to download).
- The slip PDF renders inside the transaction that makes the PINs, so a failed render leaves no unprinted PIN. Serials are reserved first in their own short transaction and prints of one class are serialised by an advisory lock, so the render holds no shared row (runner up: render after commit, as spec 0012 does, then rely on remake).
- Throttle counts are taken before the lookup and given back on a match, because the login throttle's read then bump pattern lets a burst of parallel guesses all pass, which spec 0004 could tolerate for passwords but not for a public PIN search. The IP comes only from `x-real-ip`, which Vercel sets, because `x-forwarded-for` can be chosen by the client. A sitewide cap backs up the per IP limits against an attack spread over many IPs (runner up: a CAPTCHA, which adds a provider and fails on cheap phones).
- A view counts once per typed PIN, not per refresh, so "times checked" means real checks (runner up: count every page load).
- Remake is allowed even when some slips of the run were already checked, with the count shown in the confirm, because the school may have lost the whole sheet after handing some out (runner up: refuse remake once any slip is viewed).
- The signature image is left off the on screen view, which is easy to screenshot and copy; it stays in the PDF, as on paper (runner up: show it).
- Mutating slip downloads are `POST` route handlers with a same origin check, because a server action can't return a file and a `GET` that makes PINs could be prefetched or repeated (runner up: a server action that returns the PDF as base64).
- One secret with labelled HMACs covers both the PIN hash and the cookie, so there is one key to back up (runner up: two secrets).
- The existing `sign_in_throttle` table holds the PIN keys, reusing its atomic bump instead of adding a table.
