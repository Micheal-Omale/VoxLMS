# 0007. Section heads as dated records: rationale

## Context

Spec 0005 stores a section's head (title, name and signature) as three fields on the section. Our team can retype the name or upload a new signature at any time, and the new image replaces the old one. Nothing records who the head was in a given term.

Report cards are printed per term and are checked by parents and other schools long after they are issued; schools also reprint old terms (a lost card, a transfer, a scholarship application). With fields that are simply overwritten, a reprint of a 2026 term after a 2027 change of principal would carry the new principal's name and signature on a term they never signed. That is a correctness problem, not a cosmetic one: a report card is a signed record.

Two kinds of edit look the same today but mean different things. A change of principal is a new person taking office from some point. A correction (a blurry photo, a misspelled name) is the same person, and should change every card that person signs. Treating both as "overwrite the field" loses the difference; forbidding all edits instead leaves a bad upload stuck.

Nothing prints a signature yet (the report card PDF, #12, is not designed), so the shape can still change cheaply. Spec 0003's rule that migrations are add only, and spec 0004's rule that sensitive team actions need a recently typed password, both apply.

## Options considered

### Option 1: Dated head records, each starting from a term

A `section_head` table: each row is one head's time in office, starting from a term (the first head has no start term). "Change principal" adds a row; "Fix" edits a row; "Undo" removes the latest row. A term's signer is the latest head that started on or before it.

**Pros**:
- Old terms keep their signer by construction; reprints are right without any snapshot.
- Fix and change are different actions, matching what really happened.
- Ties to terms, the unit report cards are printed in, so there is no date arithmetic near term boundaries.

**Cons**:
- A new table, a data copy, and changes to the Sections page and image route.
- A late recorded change alters reprints of past terms (truthful, but surprising to someone holding an old printout).

### Option 2: Keep the section fields, snapshot the head into each term

Leave the head on the section, and when a term closes, copy the current head into that term's record. Reprints read the snapshot.

**Pros**:
- Smallest change to today's setup screen.
- Each term's signer is literally stored with the term.

**Cons**:
- Depends on a "term closed" moment that doesn't exist: our team switches the current term by hand (spec 0005), and report cards are printed before and after that switch.
- A correction (blurry signature) would have to be repeated in every snapshot, or past cards keep the bad image.
- Two sources of truth (the section and the snapshots) to keep in step.

### Option 3: Keep the section fields, only lock them

Leave the model as it is and hide the edit, allowing a change only through a "Change principal" button that overwrites the fields.

**Pros**:
- Almost no code.
- Matches the request's wording most literally.

**Cons**:
- Still overwrites: every old term reprints with the new principal, which is the problem this spec exists to fix.
- No history of who was head when.

## Rationale

Option 1 is the only one where reprinting an old term is right without depending on a moment in the school year that our process doesn't have. Starting heads from a term, not a date, follows the engineer's choice and fits the domain: report cards are signed per term, and a date close to a term's end is exactly where a date rule goes wrong. Option 2's snapshot needs a term close event that spec 0005 deliberately avoided (the current term is switched by hand when the school resumes), and it duplicates every correction. Option 3 answers "make it hard to change" but not "keep the old head", which is the actual failure.

The engineer's other answers shape the rules: fixes apply to the person across all their terms (it's the same person), only the latest change can be undone so history can't be rewritten in the middle, a change and an undo need a recently typed password like the other sensitive team actions, and a late change is allowed because recording the truth matters more than keeping old printouts identical. The title moves onto the head record because it belongs to the person (a "Head teacher" replaced by a "Head mistress"). A shared head across Junior and Senior Secondary is handled by offering the same change for the other sections, keeping one history per section rather than a school wide principal that wouldn't fit schools with a separate primary head.

Two calls made without asking: "Fix" needs only a confirm (it doesn't move who signs which term), while "Change" and "Undo" need the password; and sections that had no head name get no head record and show "No head yet". The runner up for the first was password checking on Fix too, rejected because fixes are the common, low risk case and an extra prompt there trains people to click through prompts.
