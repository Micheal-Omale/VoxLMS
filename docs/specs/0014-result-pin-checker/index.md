# 0014. Result PIN checker

**Date**: 2026-10-19
**Status**: In Progress

## Summary

Each student gets one 12 digit PIN per term, printed on a paper slip our team makes for a whole class (10 slips to an A4 page). A parent types the PIN on one public page, `/result`, and sees that child's result for that term on their phone, then downloads the same report card PDF the school prints. PINs are kept only as a keyed hash (a fingerprint that can't be turned back into the PIN without a secret key), wrong guesses are slowed down per network, and nothing shows until our team releases the school's term. Releasing a term also freezes its scores, comments and class lists, so what parents see can't change underneath them.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a parent, I want to type the PIN from my child's slip and see their result on my phone, with no account and no admission number, so that I know how my child did without going to the school.
- As a parent, I want to download the report card the school prints, so that I have a copy to keep or print.
- As our team, I want to print a whole class's slips at once, and replace a lost one, so that the school can hand slips out (for example, once fees are paid).
- As our team, I want to release a school's term results on its results day, and withdraw them if a mistake is found, so that parents never see results before the school is ready.
- As our team, I want to see which slips were made and which parents have checked, so that we can answer the school's questions.
- As a school, I want a released result's figures, comments and class list to stay exactly as parents first saw them, so that no parent can say the result changed.

**Acceptance criteria** (the contract):

*Release (our team)*
- **AC-1**: A new admin page, `/admin/schools/[schoolId]/results` ("Results online" in the school's admin menu), has a term picker listing the current term and every earlier term of the school, newest first, defaulting to the current term. Later terms are never listed. For the chosen term it shows the release state: "Not released. Parents with slips see 'results are not out yet'." or "Released to parents on 5 December 2026 at 14:02 by {name}." (Lagos time).
- **AC-2**: "Release First Term results" (worded with `termLabel`) opens a confirm step. When some classes are not ready (spec 0012 `reportCardReadiness` is not ready), the confirm lists each such class with its reason in plain words ("JSS 1 Gold: 4 students missing scores", "Primary 3: no principal's name") and says "Parents in these classes will see 'not ready yet' until every score is in." Confirming sets the release; a class that later becomes ready shows to parents with no further step.
- **AC-3**: "Withdraw release" opens a confirm ("Parents will see 'results are not out yet' at once. Slips keep working for when you release again.") and clears the release. From the next request, every open result view and download for that term answers as unreleased (AC-12), and the lock in AC-4 lifts. Slips are not touched.
- **AC-4**: While a term is released, every write that changes its figures, comments or class list is refused with "First Term, 2026/2027 results are released to parents. Ask the VoxLMS team to withdraw the release before changing them." (a new `TermReleased` error). Every such writer calls one function, `assertTermsOpen(tx, schoolId, termIds)`, inside its own transaction. It share locks the given term rows in id order and throws `TermReleased` when any is released. Release and withdraw take the term row `FOR UPDATE`, so a save and a release never cross. The writers, and the terms each passes:
  - The term written: `saveScores`, `saveRemarks`, `addStudent`, `moveStudent`, `setStudentLeft`, `saveClassElectives`, and a student import's commit and undo.
  - Every term the student has an enrolment in: `removeStudent`. A slip also counts as a record in `studentsWithRecords`, so a student with a slip can only be marked as left (spec 0008), never removed.
  - Every term of the session: `saveScoreSplit`, `saveGradeScale`, `saveLevelOffer`, `saveClassOffer` and `copySessionSetup` (into that session). These stay locked while any term of the session is released, including an earlier one.
  - The target term: `setCurrentTerm` still switches to a released term, but carries no class lists into it. It first locks the school's term rows in id order, so its lock order never deadlocks with the writers.

  Labels are not locked: student names, numbers and photos, the names of subjects, classes, sections, sessions and terms, term dates, the school's details and logo, the signer, the form master and the remark band wording (spec 0011) can still change, and a changed label shows on a released card.

*Slips (our team)*
- **AC-5**: The Results online page lists every class with open enrolments in the chosen term, in the school's class order: class name, students, slips live, checked (live slips viewed at least once), and without a slip. Each class has "Print slips for N students", where N is the open enrolments with no live slip this term; with N = 0 the button is off with "Every student has a slip." Printing works whether or not the term is released, for the current and earlier terms. Withdrawn students never get a slip.
- **AC-6**: Printing makes one PIN per student in N, in register order (surname, other names, student number, as Results compares them), saves them as one print run (kind `class`), and downloads one PDF named `{school code} {class name} {term name} {session with / as -} PIN slips.pdf`, for example `GHS JSS 2 Gold First Term 2026-2027 PIN slips.pdf`. The page refreshes its counts after the download and says "If the file didn't download, use Remake on the class page. Slips can't be printed again." If two of our team print the same class at once, the second waits, then gets only the students the first didn't cover (or "Every student has a slip"). A student withdrawn while a print runs may still get a slip; it answers "no result" (AC-12, step 5).
- **AC-7**: A PIN is 12 digits: 11 random digits from a cryptographically secure source, then one Luhn check digit (the standard check digit used on bank cards, which catches any single mistyped digit and most swapped pairs). It is shown and printed in three groups of four, `4821 0937 5512`. The database keeps only `HMAC SHA256(RESULT_PIN_SECRET, "pin:" + the 12 digits)`. The PIN itself is never stored, logged, put in a URL or cookie, or sent anywhere except inside that one slip PDF. A new PIN whose hash already exists is thrown away and made again.
- **AC-8**: The slip PDF is A4 portrait with 10 slips per page in 2 columns by 5 rows, each slip 105 by 59.4 mm, divided by dashed 0.5 point cut lines, with every slip's text kept at least 7 mm inside its edges (so printers that can't print to the paper's edge cut nothing off). Black and white only (black text and lines, no fills, no grey), Atkinson Hyperlegible Next Regular and Bold (spec 0012), nothing smaller than 7.5 point. Each slip shows, in order: the school name in bold; "Result PIN · First Term, 2026/2027"; the student's name, surname first, and class; the PIN in bold 18 point tabular figures in its three groups; "Serial GHS 000123"; "Check the result at {host}/result" (host from `BETTER_AUTH_URL`, without `https://`); "Keep this slip safe. Anyone with this PIN can see this result." A school or student name too long for its line wraps to two lines at most, then is cut with an ellipsis. After rendering, the server counts pages and sends no file when the count is not `ceil(slips / 10)` (as spec 0012, AC-10).
- **AC-9**: Each slip has a serial: the school code and a 6 digit number from a per school counter that only goes up (`GHS 000123`). Serials are unique in the school and never reused, including by replacements. Gaps are allowed (a print that fails after reserving its serials leaves them unused).
- **AC-10**: A class slip page, `/admin/schools/[schoolId]/results/[classId]?term=`, lists every open enrolment in register order with: name, serial, made on, first checked, last checked, times checked, and status ("No slip", "Live", or "Replaced" shown with the live one). It also lists the class's print runs for the term, newest first: "3 November 2026, 10:14, by {name}: 32 slips, 5 checked", each with "Remake these slips".
- **AC-11**: Lost slips.
  - "Replace slip" on a student with a live slip opens a confirm ("The old slip stops working at once. A new slip downloads now.") and, in one transaction, marks the old slip replaced (`replaced_at`, `replaced_by`), makes a new PIN and serial in a new run of kind `replace`, and downloads a one slip PDF (the slip at the top left of the page). A student with no live slip shows "Print slip", which makes a run of one (kind `class`).
  - "Remake these slips" on a run opens a confirm ("{N} slips from this print stop working at once." plus, when some were already viewed, "{K} of them have already been checked by parents.") and replaces every still live slip of that run in a new run of kind `remake`, downloading one PDF in register order. Slips of that run already replaced one by one are skipped; with none live, the button is off with "Every slip from this print has been replaced."
  - If the slip changed after the page loaded (already replaced), nothing is made and the page says "This slip was already replaced. The list has been refreshed."

*The public result page (parents)*
- **AC-12**: `/result` shows the VoxLMS mark, the heading "Check a school result", one field "Result PIN" (`type="text"`, `inputmode="numeric"`, `autocomplete="off"`, a hint "12 digits from the slip the school gave you") and a "Check result" button. Spaces and dashes in the typed PIN are ignored. The answers, checked in this order, each shown under the field in words with `role="alert"`. Only after step 1 does the field keep what was typed (so a typo can be fixed); after every other answer it is empty, and the action never returns the PIN.
  1. Not 12 digits, or the check digit fails: "That PIN doesn't look right. Check the 12 digits on the slip." Not counted as a wrong guess.
  2. This network is being slowed down (AC-15): "Too many wrong PINs from this network. Try again in 12 minutes." (worded by `formatWait`, which reads in hours past 60 minutes: "Try again in 3 hours"). No lookup runs, even for a correct PIN.
  3. No slip has that hash: "We couldn't find that PIN. Check it against the slip." Counted as a wrong guess.
  4. The slip was replaced: "This slip has been replaced. Please use the newest slip from the school." Not counted.
  5. The student's enrolment that term is withdrawn: "There is no result for this PIN. Please ask the school." Not counted.
  6. The term is not released: "{School name} has not released First Term, 2026/2027 results yet. Please check again when the school says they are out." Not counted.
  7. The student's class is not ready: "This class's results are not ready yet. Please check again later." Not counted.
  8. Otherwise the result shows (AC-13).
- **AC-13**: A PIN that reaches step 8 records one view on its slip (`first_viewed_at` when empty, `last_viewed_at`, `view_count` plus 1) with one update after the checks, outside the result read, sets the result cookie (AC-14), and redirects to `/result`, which shows the result. Steps 4 to 7 record no view. Top to bottom: the school name (and the logo on the school logo plan); "Report card · First Term, 2026/2027"; the student's name (surname first), class, and admission number or VoxLMS student number; the headline figures, position ("5th of 32"), average, total and class average; a "Download report card" button; the subjects, one row each with subject, total, grade and position, where tapping a row opens its parts with maximums ("CA 1 (20): 15"), class average, highest, lowest and remark (a native disclosure, keyboard and screen reader friendly); the grade key line; the teacher's and the head's comments under their headings; the signer's name and title (no signature image on screen); "Download report card" again; and "Check another PIN". On the basic plan the footer reads "Powered by VoxLMS". Every string comes from the spec 0012 card model (`buildReportCards`), so the screen and the PDF never differ. It reads well at 390 px and 1280 px.
- **AC-14**: The result cookie `vox_result` holds the slip id and an expiry 30 minutes after the PIN was typed, signed with HMAC (never the PIN); it is `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/result`. A refresh or a download within the 30 minutes needs no typing and does not count as a view. Every page view and download checks again, in AC-12's order from step 4: the signature and expiry, the slip still live, the enrolment open, the term released, the class ready. Any failure clears the cookie and shows the matching message on the empty form. "Check another PIN" clears the cookie and shows the empty form.
- **AC-15**: Wrong guesses are slowed per IP address, taken from `x-real-ip` only (Vercel sets it and a client can't override it; with no header, as in development, the key is `local`). An IPv6 address counts by its first 64 bits (one home or phone network). Counts live in `sign_in_throttle` under `pin_ip:<ip>` (15 minute window), `pin_ip_day:<ip>` (one day window) and the sitewide `pin_all` (one hour window); each window is fixed from its first count, like logins.
  - Count first, then look up: every attempt past step 1 adds 1 to all three keys in one atomic statement that returns the new counts, so a burst of parallel guesses can't all pass. Over 10 in the 15 minutes, or over 100 in the day, that IP gets step 2 until its window ends, and no lookup runs.
  - When the PIN then matches a slip (steps 4 to 8), the 1 is taken back from all three keys, so only wrong PINs count. A correct PIN never resets earlier wrong ones.
  - Over 20,000 on `pin_all` in an hour (an attack spread over many IPs), every IP is held to 3 per 15 minutes until that hour ends, and an error is logged.
  - Each count also deletes up to 50 `pin_` rows whose windows ended over a day ago, so the table doesn't grow forever.
- **AC-16**: A PIN shows exactly one child's result for one term and nothing else: no other term, student or class, no link into the school's pages, and no parent names, phones or photos. Pages showing a result send `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`. The empty form is indexable, with the title "Check a school result · VoxLMS" and a one line description.
- **AC-17**: "Download report card" (`GET /result/card`) sends the same one page A4 PDF the school prints (spec 0012's `ReportCardDocument` with this student's one card), named `{school code} {surname} {other names} {term name} {session with / as -} report card.pdf`, as an attachment with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. With no valid cookie, or when any AC-14 check fails, it sends the person to `/result` (303), where the message shows.

*Access, integrity and failure*
- **AC-18**: Only our team reaches Results online, the class slip pages and the slip download route. Teachers get not found, and no session goes to sign in. Viewing as someone (read only) sees the lists but can't release, withdraw, print, replace or remake (`ReadOnlySession`). Every id is looked up within the school.
- **AC-19**: The database holds one live slip per enrolment at most (a partial unique index), every slip's enrolment belongs to the same school (a composite foreign key), `pin_hash` is unique, and a slip is never deleted (its foreign key refuses deleting the enrolment, and AC-4 makes a student with a slip a student with records).
- **AC-20**: If `RESULT_PIN_SECRET` is missing or decodes to fewer than 32 bytes, printing, replacing and remaking refuse with "PIN slips can't be made: the server's PIN key is missing. Tell the developer." and `/result` shows "Result checking isn't available right now. Please try again later." Both log an error. Nothing falls back to a default key.
- **AC-21**: On the deployed app a PIN check answers in under 2 seconds for a 45 student class, and a 45 slip PDF downloads in under 10 seconds at under 500 KB (the font embedded once).
- **AC-22**: Previews on made up data, `/design/pin-slips` (a 45 slip sheet with the longest real names, shown inline) and `/design/result` (the result view for a 20 subject, 5 part card, with `?plan=basic` and `?plan=school_logo`, plus each AC-12 message state), return 404 in production unless `SHOW_DESIGN_PREVIEWS=1`.

## Decision

**Chosen option**: Option 1: random PINs looked up by a keyed hash, with a whole school term release that also locks the term.

The PIN is never stored; only its HMAC under a server secret is, behind a unique index, so a typed PIN finds its slip in one indexed read and a stolen database copy reveals no PIN. Slips are made and printed in one step per class, lost ones are replaced (never reprinted), and our team releases each school's term with one switch that also freezes everything the result shows.

**Implementation skills**: `react-pdf` (`.claude/skills/react-pdf/`) · `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `better-auth-security-best-practices` (`.claude/skills/better-auth-security-best-practices/`, for the cookie and throttle patterns only)

## Feature design

**Data model sketch** (one migration, `drizzle/0011_result_pins.sql`; the number is the next free one at build time):

| Table | Change | Fields | Keys and rules |
|---|---|---|---|
| `pin_run_kind` (new enum) | new | `class`, `replace`, `remake` | |
| `result_pin_run` (new) | one row per slip PDF made | `id` uuid PK · `school_id` uuid not null · `term_id` uuid not null · `class_id` uuid not null · `kind` `pin_run_kind` not null · `slip_count` int not null · `created_by` text not null (user) · `created_at` | FK (`school_id`, `term_id`) → term · FK (`school_id`, `class_id`) → class · unique (`school_id`, `id`) · check `slip_count > 0` · never deleted · index (`term_id`, `class_id`) |
| `result_pin` (new) | one row per slip ever made | `id` uuid PK · `school_id` uuid not null · `enrolment_id` uuid not null · `run_id` uuid not null · `serial` int not null · `pin_hash` bytea not null (32 bytes) · `key_version` smallint not null default 1 (which secret made the hash, so a later key change can run old and new side by side) · `created_by` text not null · `created_at` · `replaced_at` timestamptz null · `replaced_by` text null · `first_viewed_at` timestamptz null · `last_viewed_at` timestamptz null · `view_count` int not null default 0 | FK (`school_id`, `enrolment_id`) → enrolment (no cascade) · FK (`school_id`, `run_id`) → run · `pin_hash` unique · unique (`school_id`, `serial`) · partial unique on `enrolment_id` where `replaced_at is null` (one live slip) · check `(replaced_at is null) = (replaced_by is null)` · check `octet_length(pin_hash) = 32` · check `view_count >= 0` |
| `school` | new column | `pin_serial_counter` int not null default 0 | only ever increases, allocated with one `update … returning` like `student_no_counter` |
| `term` | new columns | `results_released_at` timestamptz null · `results_released_by` text null (user) | check both null or both set |
| `sign_in_throttle` | reused, no change | keys `pin_ip:<ip>`, `pin_ip_day:<ip>` and `pin_all` | |

The run's class and term must match each slip's enrolment; the data functions guarantee it (they make both in one transaction from the same enrolment rows). The migration only adds tables and columns (spec 0001's rule for live deploys).

**State transitions**:
- Term release: not released → released (our team, Release) → not released (our team, Withdraw) → released again, any number of times. The term row keeps only the latest release; each change is logged (Observability).
- Slip: live → replaced (Replace, or Remake of its run). Replaced is final. A live slip is viewed any number of times.
- What a parent sees is worked out on every request from the slip, the enrolment, the term and the class's readiness (AC-12 order). Nothing about it is stored.

**PIN and cookie mechanics** (`src/lib/result-pin.ts` pure; `src/server/result-pin/` server only):
- `makePin(randomBytes)`: draws 11 digits by rejection sampling from `crypto.randomBytes` (no modulo bias), appends the Luhn digit. `isPinShaped(text)`, `normalizePin(text)` (drops spaces and dashes), `groupPin(pin)`, `formatSerial(code, n)` (`GHS 000123`).
- Keys: `RESULT_PIN_SECRET` (32 or more random bytes, base64). PIN hash = `HMAC SHA256(key, "pin:" + digits)`. Cookie signature = `HMAC SHA256(key, "cookie:" + pinId + "." + expiresAtSeconds)`, compared in constant time (`timingSafeEqual`). The labels keep the two uses apart with one secret to back up.
- Cookie value: `{pinId}.{expiresAtSeconds}.{signature base64url}`.

**API surface** (admin pages call `requireTeamSchoolContext`; public code uses a system actor scoped to the slip's school):

| Surface | Kind | Key inputs | Key outputs | Who | Key errors |
|---|---|---|---|---|---|
| `makePin`, `isPinShaped`, `normalizePin`, `groupPin`, `formatSerial`, `slipFileName`, `pinCardFileName` (new, `src/lib/result-pin.ts`) | pure | digits, school code, counter | PIN, groups, serial, file names | any | none |
| `pinHash`, `signResultCookie`, `readResultCookie`, `pinKey` (new, `src/server/result-pin/crypto.ts`) | server only | digits; pin id and expiry; cookie value | hash bytes; cookie value; `{ pinId }` or null | server | `PinKeyMissing` (AC-20) |
| `assertTermsOpen(tx, schoolId, termIds)` and `sessionTermIds(tx, schoolId, sessionId)` (new, `src/server/data/release.ts`) | data, inside the caller's transaction; share locks the terms in id order | term ids | nothing | every writer in AC-4 | `TermReleased` |
| `getResultsOnline` (new, `src/server/data/result-pins.ts`) | data, one `readSnapshot` | `termId` (optional, default current) | terms for the picker, release state with the releaser's name, per class counts (AC-5) and readiness reasons (AC-2) | our team | `NotFound`, `NoCurrentTerm` |
| `releaseTerm`, `withdrawRelease` (new, same file) | data, transaction, term row `FOR UPDATE` | `termId` | `FormResult` | our team, not read only | `NotFound` (later term or other school), `ReadOnlySession`; releasing a released term or withdrawing an unreleased one is a no op success |
| `getClassSlips` (new, same file) | data, one `readSnapshot` | `classId`, `termId` | students with slip status and views, runs with counts (AC-10) | our team | `NotFound` |
| `printClassSlips`, `printOneSlip`, `replaceSlip`, `remakeRun` (new, same file) | data, run inside the slip route's transaction (see the steps below) | `classId` + `termId`; `enrolmentId`; `pinId`; `runId` (class and term are read from the slip or run row, never taken from the form) | the run and its slips with the plain PINs, in register order, returned once to the caller | our team, not read only | `NotFound`, `ReadOnlySession`, `NothingToPrint`, `SlipAlreadyReplaced`, `PinKeyMissing` |
| `reserveSerials(db, schoolId, count)` (new, same file) | data, its own short transaction | count | the first serial of a reserved range | our team | none |
| `checkPin` (new, `src/server/data/pin-results.ts`) | data | typed text, IP from `x-real-ip` | `{ ok: true, pinId }` or `{ ok: false, reason, waitSeconds? }` (AC-12 steps 1 to 7); counts the attempt first and takes it back on a match (AC-15); records the view at step 8 | public | `PinKeyMissing` |
| `countPinAttempt`, `takeBackPinAttempt` (new, `src/server/auth/throttle.ts`) | data, one atomic `insert … on conflict … returning` per call over the three keys | IP | the new counts, or nothing | `checkPin` | none |
| `loadPinResult` (new, same file) | data, one `readSnapshot` with a system actor for the slip's school | `pinId` | `{ ok: true, card: ReportCardModel, school, cardInput }` or `{ ok: false, reason }` (AC-14 checks) | public, via the cookie | none |
| `/admin/schools/[schoolId]/results` (new page) + `releaseTermAction`, `withdrawReleaseAction` | page, server actions | `?term` | AC-1, AC-2, AC-3, AC-5 | our team | not found |
| `/admin/schools/[schoolId]/results/[classId]` (new page) | page | `?term` | AC-10, AC-11 buttons | our team | not found |
| `POST /admin/schools/[schoolId]/results/slips` (new route handler, Node, `maxDuration = 60`) | route | form fields `do` = `class`, `one`, `replace` or `remake`, with `termId` + `classId`, `enrolmentId`, `pinId` or `runId` | `200 application/pdf`, `Content-Disposition: attachment`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`; only `POST` is exported | our team | `403` when `Origin` is not the app's own, or when both `Origin` and `Sec-Fetch-Site` are missing; `404`; `401` without a session; `409` with a JSON `{ message }` for `NothingToPrint`, `SlipAlreadyReplaced`, `ReadOnlySession`; `503` with the AC-20 message; `500` on a wrong page count (nothing committed, see invariants) |
| `SlipButton` (new client component) | client | the form fields | posts with `fetch`, saves the PDF blob as a download, shows a 409 or 503 message under the button, then `router.refresh()` | | |
| `/result` (new page) + `checkPinAction`, `clearResultAction` | page, server actions | the PIN field | AC-12, AC-13, AC-14 | public | messages, never an error page |
| `GET /result/card` (new route handler, Node) | route | the cookie | AC-17 | public, via the cookie | `303` to `/result` |
| `GET /design/pin-slips`, `/design/result` (new) | route, page | `plan` | AC-22 | development | 404 in production |

Slip route steps:
1. Same origin check: `Origin` must equal the app's own origin; with no `Origin`, `Sec-Fetch-Site` must be `same-origin`; with neither, `403`.
2. Session and `requireTeamSchoolContext`, as other admin routes; not read only.
3. `reserveSerials` in its own short transaction (one `update school set pin_serial_counter = pin_serial_counter + n returning`), sized by a plain count of the students to print. The `school` row is locked only for that statement, so adding students (which uses the same row's `student_no_counter`) never waits on a render.
4. One transaction: `pg_advisory_xact_lock` on the class and term (so two prints of one class run one after the other, and no enrolment or school row is held), then the data function reads the live slips again, uses the reserved serials (any left over become gaps), and inserts the run and slips. Then render the slip PDF from its result and count the pages. A render error or a wrong count throws, so the transaction rolls back and no PIN exists that wasn't in a rendered file.
5. Commit, then send. If the response is lost or the function times out after the commit, the slips exist but nobody has them; the class shows them as made, and "Remake these slips" recovers them (AC-6, AC-11).

The slip render is text only and small (about a second), so it runs inside the transaction, holding only the advisory lock and the new rows (unlike spec 0012, where the class card render runs outside).

`/result` page steps: read `vox_result` → none: the form → `loadPinResult` → not ok: clear the cookie, the form with the message → ok: the result view. `checkPinAction` runs `checkPin`; on ok it sets the cookie and redirects to `/result` (so a refresh never posts the PIN again); on not ok it returns the message. `src/proxy.ts` already lets `/result` and `/result/card` through.

**Key invariants**:
- No PIN is ever stored, logged, cached or put in a URL. Only its HMAC is stored. Slip PDFs exist only in the one response.
- No slip exists that was never in a sent file's render: a failed render rolls back its PINs.
- One live slip per enrolment; serials never reused in a school.
- A result is shown only when its slip is live, its enrolment open, its term released, and its class ready, checked on every request.
- What a parent sees comes only from `loadReportCards` → `buildReportCards` (spec 0012), the same as the printed card.
- While a term is released, nothing in AC-4 changes its figures, comments or class lists, and nothing in its session changes the grading or subject offers.
- Every attempt is counted before any lookup, atomically, and a throttled IP gets no lookup.

**Security model**:
- Children's personal data under the Nigeria Data Protection Act (spec 0003): names, scores, positions and comments reach a public page only behind a live PIN for a released term, one child and one term per PIN. No parent data, photo or signature image is shown on screen (the signature appears only inside the downloaded PDF, as on paper). Pages showing results are `noindex`, `private, no-store`, `no-referrer`.
- Guessing: 100 billion possible PINs (11 random digits) against about 200 live slips at the pilot school, plus the per IP throttle. Typo answers (check digit) give an attacker nothing, because they can compute check digits themselves.
- A leaked database copy reveals no PIN without `RESULT_PIN_SECRET`, which lives only in Vercel's environment and the team's password manager.
- The cookie carries only a signed slip id; tampering fails the constant time check. It is scoped to `/result`, `HttpOnly`, and expires 30 minutes after the PIN was typed.
- Admin slip routes accept only same origin posts from our team's session; viewing as is read only.
- The public code reads with a system actor but only through `loadPinResult`, which reads the one slip's school, enrolment, class and term. No id from the request other than the signed slip id is used.

**Observability**: one log line per release, withdraw, print, replace and remake (school, term, class, run kind, count, who); one per throttle hit (IP and which window, never the PIN); a log error for a wrong slip page count and for a missing key. No IP addresses are stored on slips.

**Configuration required**:
- `RESULT_PIN_SECRET`: 32 or more random bytes, base64 (`openssl rand -base64 32`), the same value in every environment that reads that database. Losing or changing it kills every slip ever printed against that database, so it is backed up in the team's password manager on the day it is made. The dev Neon branch uses its own value.
- `next.config.ts`: `outputFileTracingIncludes` for the slip route and `/result/card` (the font files, as spec 0012).

**Critical test scenarios**:
- Happy path (database, `inRollback`): print the demo class's slips, release the term, check one PIN: the view count goes to 1, the card model equals `getReportCards` for that student, and the cookie reads back to the slip; verifies **AC-6**, **AC-13**, **AC-14**.
- PIN core (pure): 10,000 made PINs are all 12 digits with a valid check digit; one changed digit and one swapped pair fail `isPinShaped`; spaces and dashes are ignored; serial `GHS 000123`; verifies **AC-7**, **AC-9**.
- Answers (database): each AC-12 case in order (bad shape, throttled with a correct PIN, unknown, replaced, withdrawn, unreleased, not ready, ok), and only "unknown" leaves a count behind (a match takes its count back); verifies **AC-12**, **AC-15**.
- Throttle (database): the 11th wrong PIN in 15 minutes waits; after the window it works; the 101st in a day waits; a correct PIN in between doesn't reset; 50 wrong guesses sent in parallel from one IP get at most 10 lookups; the sitewide cap holds every IP to 3; an IPv6 address and its neighbour in the same /64 share a count; waits over an hour read in hours; verifies **AC-15**, **AC-12**.
- Release lock (database): with the term released, each writer in AC-4 throws `TermReleased`; with only First Term released, the session's grade scale, split and offers are refused; switching back and then forward to a released term carries no students into it; removing a student with a slip is refused; after withdraw each works; a save racing a release either lands before it or is refused; verifies **AC-4**, **AC-3**, **AC-19**.
- Lost slips (database): replace kills the old PIN and makes a new serial; remake skips slips already replaced; replacing a replaced slip gives `SlipAlreadyReplaced`; two prints of one class at once give every student exactly one live slip; verifies **AC-11**, **AC-6**, **AC-19**.
- Withdraw (database and route): an open cookie after withdraw shows "not released" and `/result/card` redirects; verifies **AC-3**, **AC-14**, **AC-17**.
- Cookie (pure): a changed id, a changed expiry, an expired cookie and a wrong signature are each rejected; verifies **AC-14**.
- Auth/permission (route and data): a teacher gets 404 on Results online and the slip route; no session gets 401 on the route; viewing as gets 409 with the read only message; a post with a foreign `Origin` gets 403; a slip id from another school's cookie can't be forged; verifies **AC-18**, **AC-14**.
- Missing key (data): no `RESULT_PIN_SECRET` refuses printing and `/result` shows the unavailable message; verifies **AC-20**.
- Slip PDF (render): 45 slips give 5 pages, 1 slip gives 1 page, the longest names stay in their slips, and a forced overflow sends no file and leaves no PIN; verifies **AC-8**, **AC-6**.
- Never leaked (route): the PIN appears in no log line, URL, cookie or HTML after the check; verifies **AC-7**, **AC-16**.
- Visual (by hand, `verify.md` at build): `/result` form, each message and the result view at 390 px and 1280 px; print one slip sheet in black and white, cut it, and read every PIN; verifies **AC-8**, **AC-12**, **AC-13**, **AC-22**.

## Build plan

Skateboard: the thinnest whole first, so our team can print a real class's slips, release the term, and a parent can check a PIN and download the card. Then lost slips, then the release lock, then the results day guards and the checks.

1. [x] Migration `0011_result_pins`: `pin_run_kind`, `result_pin_run`, `result_pin`, `school.pin_serial_counter`, `term.results_released_at` and `results_released_by`, with every key and check in the data model; migrate the dev branch; satisfies **AC-19**.
2. [x] PIN core: `src/lib/result-pin.ts` and `src/server/result-pin/crypto.ts` with unit tests; `countPinAttempt` and `takeBackPinAttempt`, and `formatWait` in hours past 60 minutes; `RESULT_PIN_SECRET` in `.env.local` and the deploy notes; satisfies **AC-7**, **AC-9**, **AC-14**, **AC-15**, **AC-20**.
3. [x] Thinnest whole, our team: `getResultsOnline`, `releaseTerm`, `withdrawRelease`, `printClassSlips`; the slip PDF document in `src/components/pin-slips/`; the slip route and `SlipButton`; the Results online page with release, withdraw and print; database and render tests; satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-8**, **AC-18**.
4. [x] Thinnest whole, parents: `checkPin` (with the throttle rules), `loadPinResult`, the `/result` page with its form, messages and result view, the cookie, and `/result/card`; database and component tests; satisfies **AC-12**, **AC-13**, **AC-14**, **AC-15**, **AC-16**, **AC-17**.
5. [x] Lost slips: `getClassSlips`, `printOneSlip`, `replaceSlip`, `remakeRun`; the class slip page; tests for replace, remake, races and the stale page message; satisfies **AC-10**, **AC-11**, **AC-19**.
6. [x] Release lock: `assertTermsOpen` and `sessionTermIds`, wired into every writer in AC-4 with the terms it names, `setCurrentTerm`'s id ordered lock and no carry into a released term, slips counted in `studentsWithRecords`, and each screen's message; a test per writer; satisfies **AC-4**, **AC-19**.
7. [x] Results day guards: the never leaked test, the missing key paths, the page count rollback, the timing and size checks on the deployed app, and the log lines; satisfies **AC-7**, **AC-8**, **AC-20**, **AC-21**.
8. [x] Previews and checks: `/design/pin-slips` and `/design/result`; screenshots at 390 px and 1280 px; a printed slip sheet; `verify.md`; satisfies **AC-22**, and **AC-1** to **AC-22** overall.

## Consequences

**Positive**:
- Parents see results from a phone with nothing but a slip; no accounts, no admission numbers, no new provider.
- A stolen database copy alone reveals no PIN, and a lost slip is dead the moment it is replaced.
- The screen, the download and the paper card always agree, because all three come from one card model.
- Released results can't drift, so a parent's screenshot stays true.

**Negative / tradeoffs**:
- Slips can never be reprinted, only replaced or remade. A lost PDF before printing means remaking the whole run.
- `RESULT_PIN_SECRET` is a single point of failure: lose or change it and every slip in parents' hands stops working. It can't be rotated without reprinting every live slip.
- While a term is released, a new student can't join a class and no score can be fixed until our team withdraws the release, and withdrawing hides every class's results, not just the one being fixed.
- Releasing First Term locks the session's grade scale, score split and subject offers for the rest of the session, because they also shape First Term's results. A mid year change means withdrawing every released term of the session, changing, and releasing again.
- A student who has a slip can never be removed, only marked as left, even if added by mistake.
- Throttling is per IP. Many phones on one Nigerian mobile network share an IP, so one guesser can slow a whole network for up to a day (rare, because real parents' typos are caught by the check digit). An attack spread over many IPs is held back by the size of the PIN space and the sitewide cap, which then slows every parent too.
- Only our team can print, release and replace, so every lost slip is a message to us. Fine for one pilot school; it won't scale to many schools without a school admin role.
- Labels are not locked (AC-4): renaming a student, subject or class, changing remark band wording (spec 0011), the signer, the school's details or the form master changes what a released card says, though never its figures.
- The term row keeps only the latest release; the history of releases and withdrawals lives in the logs, not the database.

**Neutral**:
- `sign_in_throttle` now also holds PIN keys; its name is kept to avoid a rename migration. Its `pin_all` row is updated on every PIN attempt, a busy single row on results day, which Postgres handles at this volume.
- Serial numbers can have gaps.
- A PIN check loads the whole class's results (positions need every student), about one class computation per check; AC-21 bounds it.
- The admin school menu gains "Results online".
- The slip address uses whatever host `BETTER_AUTH_URL` holds, so slips printed on a `vercel.app` address keep that address on paper.

## Follow-up

- [ ] Choose a short public domain before Release 3 (slips carry the address on paper for months, so it should not change after the first print).
- [ ] Add a sitewide alert when wrong PIN guesses pass about 2,000 in an hour (once there is alerting; spec 0001's monitoring follow up).
- [ ] Spec 0012 follow up "Result PIN checker (#21)": settled here; `/sync` should tick it.
- [ ] `/sync`: add the conventions that a PIN is stored only as `pinHash` and never logged; that public result reads go only through `loadPinResult`; and that every writer of scores, comments, enrolments, electives or session grading and offers calls `assertTermsOpen` with the terms it affects (spec 0014, AC-4).
- [ ] A school admin or bursar role that prints and replaces slips itself (scope Deferred, when more schools join).
- [ ] Document `RESULT_PIN_SECRET` in the deploy notes, and store it in the team's password manager on the day it is made.
