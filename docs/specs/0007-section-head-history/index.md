# 0007. Section heads as dated records

**Date**: 2026-10-17
**Status**: Proposed

## Summary

Each section's head (principal or head teacher: title, name and signature) becomes a dated record instead of fields that anyone on our team can overwrite. A new head is recorded only through "Change principal", which says from which term they sign, and the earlier head is kept, so a reprinted report card from an old term still shows the head who was in office then. Honest mistakes are fixed on the same person's record, and the latest change can be undone. This changes part of spec 0005 (the head fields on a section) before report cards (#12) first print a signature.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As our team, I want to record a new principal from the term they start signing, so that every report card shows the head who was in office that term, even when an old term is reprinted.
- As our team, I want to fix a blurry signature or a misspelled name without pretending the principal changed, so that the history stays truthful.
- As our team, I want to undo a principal change I recorded by mistake, so that one slip doesn't leave a false head in the history.

**Acceptance criteria** (the contract):
- **AC-1**: Each section keeps a history of heads, each with a title, a name and a signature. The Sections page shows, on each section's card, the head in office now ("In office: Mr Samuel Adeleke, Principal, since First Term 2026/2027", or "from the start" for a first head) with the signature preview, and an "Earlier heads" list giving each earlier head's title, name and the terms they signed ("First Term 2025/2026 to Third Term 2025/2026").
- **AC-2**: Adding a section creates its first head from the head's title and name typed in the section form; the signature is uploaded after. A first head has no start term and covers every term before the next change. A section with no heads at all (possible only for sections that had no head name before this change) shows "No head yet" with an "Add head" action that creates its first head; "Add head" is offered and accepted only while the section has no heads.
- **AC-3**: A head's title, name and signature can no longer be changed by editing the section. "Fix name or signature" edits that head's own record (the same person); before saving, a confirm says the fix shows on every report card that head signs, past terms included. Fix works on the current head and on earlier heads. The name is 3 to 80 characters and the title 2 to 40.
- **AC-4**: "Change principal" records a new head with a title, a name and a start term picked from the school's existing terms; the signature can be uploaded right after. The start term must start after the start term of the section's latest head (any term, past or future, when the latest head is a first head; if it is the school's earliest term, the first head then signs no term and its history line says so). Before saving, a confirm names the outgoing and incoming head, the start term, and how many terms that have already started will now show the new head. Refused, with a plain message: a start term not after the latest head's; the same name as the latest head (case and spacing ignored), pointing to "Fix name or signature"; and no later term existing, with a link to Session and terms.
- **AC-5**: When other sections have the same latest head (same name, case and spacing ignored), "Change principal" offers a tick for each ("Also change Senior Secondary"). Each ticked section gets its own new head record with the same title, name and start term, and the signature uploaded next is saved on each of them (if an upload fails, each head without a signature shows "No signature yet" with its own upload button on its section card, and the checklist stays unfinished); any ticked section whose latest head starts on or after the chosen term is refused by name and nothing is saved.
- **AC-6**: The latest head change in a section can be undone: the record and its signature are deleted, and the previous head, as it is now (including any fixes made since), signs those terms again. Only the latest change can be undone, and a first head can't be undone (it can only be fixed).
- **AC-7**: "Change principal" and "Undo" need the team member's password typed in the last 15 minutes (spec 0004, AC-9); when it isn't, they ask for it while keeping everything typed in the dialog, and after the password the action checks every input again before saving. "Fix name or signature" needs only its confirm, even on an earlier head (it never changes who signs which term).
- **AC-8**: One data function, `getHeadForTerm`, answers who signs a term for a section: the head whose start term is the latest one starting on or before that term (by term start date), else the section's first head, else none. Report cards (#12) read the head only through it. Recording a change never alters the answer for a term that starts before the new head's start term.
- **AC-9**: A replaced head's signature is never deleted while its record exists. A fix that uploads a new signature replaces that head's image only. Signatures stay private: never served on the web, previewed only to our team (spec 0005, AC-4).
- **AC-10**: The migration gives every existing section that has a head name a first head with its title, name and signature. After it, nothing reads the section's own head fields, and the section no longer links to the signature (the head record does). The setup checklist marks Sections done when every section's head for the current term (or its latest head when there is no current term) has a name and a signature.
- **AC-11**: Every page and action here is for our team only (anyone else gets not found), and every id from a form is checked within the school. Each head record keeps who recorded it and when, and who last fixed it and when.
- **AC-12**: Editing a session's term dates (spec 0005) is refused, with a message naming the section and head, when the new dates would make any section's heads stop running in strictly increasing start term order, or make two of a section's head start terms start on the same day.

## Decision

**Chosen option**: Option 1: dated head records, each starting from a term.

A new `section_head` table holds each head's time in office from a start term; a section's own head fields are copied in once and then retired, and every reader asks `getHeadForTerm`.

**Implementation skills**: `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

## Feature design

**Data model sketch** (one add only migration, plus a one time data copy):
- New table `section_head`:
  - `id` uuid, primary key.
  - `school_id` uuid, required; composite links include it (spec 0003).
  - `section_id` uuid, required; `(school_id, section_id)` → `section (school_id, id)`.
  - `starts_term_id` uuid, null; `(school_id, starts_term_id)` → `term (school_id, id)`. Null means a first head.
  - `title` text, required. `name` text, required.
  - `signature_asset_id` uuid, null; `(school_id, signature_asset_id)` → `asset (school_id, id)`.
  - `created_by` text, required (the user id); `created_at` timestamp. `updated_by` text, null; `updated_at` timestamp.
  - Unique `(section_id, starts_term_id)`; partial unique index on `section_id` where `starts_term_id is null` (one first head per section); unique `(school_id, id)`.
- `section`: `head_title`, `head_name`, `head_signature_asset_id` stay (migrations are add only) but are no longer read. The migration copies them into a first head where `head_name` is set, then sets `head_signature_asset_id` to null so the image belongs to the head record alone (otherwise a later fix couldn't delete the old image). `teacher_title` stays on the section and is still read.

**Which head signs a term**: order a section's heads by their start term's `starts_on`, with the first head (null start) before all. For a term T, the signer is the last head whose start term's `starts_on` is on or before T's `starts_on`, else the first head.

**State transitions** (per section):
- none → first head (add section, or "Add head").
- head N → head N+1 ("Change principal", with a start term later than head N's).
- head N+1 → head N ("Undo", latest only, never the first head).
- any head → the same head with a fixed title, name or signature ("Fix").

**API surface** (pages call `requireTeamSchoolContext`; data functions in `src/server/data/heads.ts` call `assertTeam` and return the `FormResult` shape):

| Surface | Kind | Key inputs | Result | Who | Key errors |
|---|---|---|---|---|---|
| `/admin/schools/[id]/sections` | page | none | per section: current head, earlier heads with their term spans, terms available as start terms, other sections with the same latest head | our team | not found |
| `saveSection` (changed) | action | stage, teacher title; for a new section also head title and name | section saved; a new section gets its first head | our team | stage already used |
| `addFirstHead` | action | section id, title, name | first head created | our team | section already has a head |
| `fixHead` | action | head id, title, name | head record updated, `updated_by/at` set | our team | name or title length |
| `changeHead` | action | section id, start term id, title, name, also section ids | one new head per section, ids returned for the signature upload | our team, fresh password | needs password; start term not after latest; same person; ticked section refused |
| `undoLatestHead` | action | section id | latest non first head and its signature deleted | our team, fresh password | needs password; nothing to undo |
| `POST /admin/schools/[id]/images` (changed) | route handler | `kind` logo or signature, `headId` for a signature, one image | asset saved on that head; the head's previous image deleted | our team | not an image; over 300 KB; head not in this school |
| `getSectionHeads` | data function | none | every section's heads in order with term labels | our team | none |
| `getHeadForTerm` | data function | section id, term id | `{ title, name, signatureAssetId }`, or null when the section has no heads | our team, system (PDF) | section or term not in this school: not found |
| `saveSession` (changed, spec 0005) | action | session name, three terms' dates | saved | our team | new dates would break a section's head order (AC-12) |

**Key invariants**:
- A section has at most one first head, and at most one head per start term.
- A section's heads have strictly increasing start terms (by `starts_on`, never two on the same day). It holds after every head change and every term date edit (AC-12).
- Every head write (`addFirstHead`, `fixHead`, `changeHead`, `undoLatestHead`, a signature upload) locks the section row (`for no key update`) first and then reads the head again, so a fix can't land on a head an undo just removed (it gets not found). `changeHead` with also sections locks all their rows in order of section id, so two changes can't deadlock.
- `getHeadForTerm` is the only reader of heads for printing; nothing reads `section.head_*` after the migration. A first head (null start) covers every term before the next head, so a section with any head always has a signer for every term.
- A head's signature asset is deleted only by a fix that replaces it, by undoing that head, or by removing the section (which spec 0005 allows only while it has no classes). Removing a section deletes its head rows first, then their assets, then the section, in one transaction; the foreign keys stay the default (refuse a delete that would leave a dangling link). Images are stored in Postgres (spec 0001), so a rolled back transaction leaves nothing behind.
- Signatures are never served publicly (spec 0005).

**Security model**:
- Team only; teachers and anyone viewing as someone get not found (`assertTeam`, spec 0004).
- "Change principal" and "Undo" need a password typed in the last 15 minutes, using the existing `isFresh` check and the `needPassword` answer the staff actions already use.
- Every id from a form (section, head, term, asset) is looked up within the school.
- No children's data is touched. Head names and signatures are staff data, kept private as before.

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: on the demo school, change Junior Secondary's principal from Second Term 2026/2027 with "also change Senior Secondary" ticked; First Term returns Mr Samuel Adeleke and Second Term returns the new head for both sections; verifies **AC-4**, **AC-5**, **AC-8**.
- Failure case: a start term equal to or before the latest head's is refused; the same name as the latest head is refused and points to Fix; a ticked section whose latest head starts later fails the whole change; verifies **AC-4**, **AC-5**.
- Undo: undoing restores the previous head for those terms and deletes the undone signature; a second undo can't touch the first head; verifies **AC-6**, **AC-9**.
- Fix: fixing an earlier head's name changes what `getHeadForTerm` returns for its old terms only; verifies **AC-3**, **AC-8**.
- Migration: every seeded section gets a first head with its signature, and `section.head_signature_asset_id` is null; verifies **AC-10**.
- Edge: changing from the school's earliest term leaves the first head signing no term; undo after fixing the previous head restores the fixed head; a fix on a head just undone is not found; verifies **AC-3**, **AC-4**, **AC-6**.
- Term dates: moving Second Term 2026/2027 to start before First Term's head change, or onto the same day as another head's start term, is refused; verifies **AC-12**.
- Auth/permission: a teacher gets not found for every action; a stale password gets `needPassword` and the same change succeeds after the password; a head id from another school is not found; verifies **AC-7**, **AC-11**.

## Build plan

Skateboard: the record and its rules first, so the very next report card work (#12) can rely on `getHeadForTerm`, then the screen our team uses.

1. [ ] Migration: create `section_head` with its keys and indexes; copy each section's head into a first head (`created_by` = "migration"); set `section.head_signature_asset_id` to null. Update the demo seed to create first heads; satisfies **AC-10**.
2. [ ] Data functions in `src/server/data/heads.ts`: `getSectionHeads`, `getHeadForTerm`, `addFirstHead`, `fixHead`, `changeHead` (with the also sections), `undoLatestHead`; change `saveSection` to create the first head and stop writing head fields; `removeSection` deletes the section's heads and their images; `saveImage` puts a signature on a head; the checklist uses the head for the current term; `saveSession` refuses term date edits that break a section's head order; satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-12**.
3. [ ] Actions in `setup-actions.ts` for add, fix, change and undo, with the fresh password check on change and undo; the image route takes `headId`; satisfies **AC-7**, **AC-11**.
4. [ ] Sections page: the head panel on each section card (in office, signature, earlier heads), the Fix dialog with its warning, the Change principal dialog (start term picker, also section ticks, confirm with the count of started terms, then the signature upload), Undo, and the password prompt reused from the staff actions; satisfies **AC-1** to **AC-7**.
5. [ ] Tests for the term rule, change, undo, fix, term date edits, migration, password and access; update the spec 0005 tests that wrote head fields on the section; satisfies **AC-1** to **AC-12**.

## Migration plan

**Strategy**: one deployment. Add the table, copy the data, clear one link, ship the code that reads the new table.
**Phases**:
1. Migration creates `section_head`, inserts a first head for every section with a `head_name`, then nulls `section.head_signature_asset_id`.
2. The same release switches every reader and writer to `section_head`.
**Rollback**: safe only before anyone uses Fix, Change principal or Undo after release (those can delete or add images the old code doesn't know about). In that window: revert the code and copy each section's first head's signature id back to `section.head_signature_asset_id` (the title and name were never removed), dropping nothing. After that window, roll forward with a fix instead of rolling back.
**Risks**: a section with a signature but no head name would get no head record, leaving its image unused. The migration checks for such sections first and stops with their names if any exist, so our team adds the name and runs it again. The seed and the pilot data have none.

## Consequences

**Positive**:
- Reprinting an old term's report cards shows the head who signed that term.
- A principal change is a deliberate, password checked action with a record of who did it.
- Report cards get one clear rule (`getHeadForTerm`) instead of reading section fields.

**Negative / tradeoffs**:
- Recording a late change (start term in the past) changes reprints of those past terms. That is the truthful record, but anyone holding an older printout will see a different signer on a reprint.
- Undo deletes the undone record, so the "who recorded it" trail of a mistaken change is lost with it.
- `section.head_title`, `head_name` and `head_signature_asset_id` become unused columns (add only rule).
- The Sections page gets busier: each card now carries a head panel and its dialogs.

**Neutral**:
- Spec 0005's AC-5 (head title, name and signature on the section) and the signature row of its image route are now governed by this spec; its other criteria are unchanged.
- The school's stamp stays out of scope (spec 0005 decision); a stamp could later sit on the head record beside the signature.

## Follow-up

- [ ] Report card PDF (#12): read the signer only through `getHeadForTerm`, and print the head's title from the record, not from the section.
- [ ] Enrol teachers and students (#8): decide whether report cards also carry the form master's signature (uploaded per teacher, or a line to sign by hand).
- [ ] `/sync` should note in spec 0005 that its section head fields are governed by spec 0007.
