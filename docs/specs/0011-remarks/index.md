# 0011. Remarks

**Date**: 2026-10-18
**Status**: In Progress

## Summary

The form master writes each student's comment for the term on one Remarks sheet for the class, helped by a short list of ready comments to tap in and edit. The principal's comment fills itself in from the student's average, using wording our team sets per school, and the form master or our team can type over it for one student. Saving works exactly like the score sheet, so nothing typed is lost and two people can't overwrite each other unseen. Attendance is left out for now (deferred in the scope). The only database change is one small table for the comment bands.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a form master, I want to write every student's comment on one screen, with ready comments to start from, so that I finish a class of 40 on my phone between lessons.
- As a form master, I want the principal's comment to fill itself in from each student's result, so that I don't write in the principal's voice for every student.
- As a form master, I want to change the principal's comment for one student when it doesn't fit, so that the card says the right thing.
- As our team, I want to set each school's principal's comment wording, so that the cards sound like that school.
- As the report card (#12), I need each student's two comments from the same read as their results, so that the card never disagrees with itself.

**Acceptance criteria** (the contract):
- **AC-1**: The class page `/{school}/classes/[classId]` gains a Remarks section after Results. It follows the same term picker (`?term`). It shows "N of M have a teacher's comment" (M is the open enrolments that term) and, when any student's result is incomplete, "K principal's comments wait for all scores" (worded with the signer's title, AC-2). A button opens the Remarks sheet for that term. A class with no students shows a plain empty state. Without a current term, the class page shows its existing "no current term" state.
- **AC-2**: The Remarks sheet `/{school}/classes/[classId]/remarks?term=<termId>` shows the class and term, then one row per open enrolment, surname first, with admission number, the student's average and position from results (spec 0010), or "Incomplete", then the teacher's comment and the head's comment. The head's column is headed with the title of whoever signs the class's section (`getSignerForSection`, spec 0007): "Principal's comment", or for example "Head teacher's comment". At 390px wide each student is a stacked block (name and figures, then the two comments), nothing scrolls the page sideways, and every field and button is at least 44px tall.
- **AC-3**: The teacher's comment is a text box. Under it, a "Quick picks" list offers the fixed starter comments; tapping one fills an empty box, or adds the pick to the end of existing text after one space. Nothing typed is ever replaced by a pick. On leaving the box and on save, the text is tidied: ends trimmed, line breaks and runs of spaces folded into one space. A comment may be at most 200 characters after tidying. A counter shows from 160 characters ("185 of 200"); over 200 the box is circled in red with "Comments fit in 200 characters" and Save is blocked until fixed. Text is never cut off silently (no hard typing limit). Emptying a saved comment counts as a change and clears it on save.
- **AC-4**: The head's comment is automatic by default: the remark of the school's highest band whose lowest average is at or below the student's overall average (spec 0010, in hundredths). It shows the text with an "Automatic" label. A student whose result is incomplete shows "Waits for all scores" instead, and gains the automatic comment by itself once the last score is saved. "Type over" opens a text box seeded with the automatic text (empty when it waits), following the AC-3 tidy and length rules, without quick picks. A typed comment shows a "Typed" label and "Use automatic", which clears it on save. An automatic comment follows score and band changes on the next read; a typed one never changes by itself.
- **AC-5**: Saving follows spec 0009, AC-5 exactly. A sticky Save sends only changed comments, each with the saved text it replaced, under one save id. A retry resends the same set under the same id, and a request with no reply after 20 seconds counts as failed. Typed comments are kept on the device, keyed by user, term and class, until the save is confirmed, and come back after a refresh or crash, checked against the fresh sheet. Offline, failed, app updated and signed out cases show the spec 0009 messages with "comments" for "scores". A landed save says "Saved at 3:14 pm" (Lagos time) and progress updates.
- **AC-6**: When someone else saved a comment for the same student and column first (`Conflict`), nothing is written. Those rows load the newer saved text and show the teacher's typed text beside it, marked in amber, with "Keep mine" and "Use saved" per row, as in spec 0009, AC-7. Typed text equal to the newer saved text drops out. Save stays off until every such row is decided.
- **AC-7**: Only the current term can be changed. `saveRemarks` refuses any other term with `TermClosed`, reading `term.is_current` under a share lock inside its transaction (the spec 0009, AC-6 rule). An earlier term's sheet opens read only with "First Term is closed. Remarks can only be changed in the current term." A read only sheet that finds comments on this device that were never saved lists them and offers Discard, as in spec 0009, AC-9.
- **AC-8**: When a save names a student who is no longer an open enrolment of the class that term (`NotInClass`, after a withdraw or move), nothing is written. The sheet reloads, names who changed ("OKON Emem is no longer in this class, so their comments were not saved"), drops their rows, and keeps every other typed comment as unsaved.
- **AC-9**: Under each student's comments, a small line says who last saved that row and when: "Last changed by Mrs Okafor, 3:14 pm" (date added when not today, Lagos time). A school staff member shows as title and name; our team shows as "VoxLMS team (name)". A row never saved shows no line. There is no change history.
- **AC-10**: Our team edits a school's "Principal's comment bands" on the Grading page `/admin/schools/[schoolId]/grading`, below the grade scales. Bands are listed from the highest lowest average down, each with its lowest average and its wording. Our team can change, add and remove bands and saves the whole set at once. Rules: 2 to 10 bands; exactly one band starts at 0; lowest averages are distinct, from 0 to 100, with up to 2 decimal places; wording is 1 to 200 characters after tidying. A broken rule names the band and saves nothing. Every school created gets the 5 default bands, and the migration gives them to every existing school. A change shows on the next read of every sheet, for automatic comments only, in every term.
- **AC-11**: `loadClassRemarks` runs inside the caller's own snapshot, takes that snapshot's `loadClassResults` output, and returns, per open enrolment, the teacher's comment, the head's comment with whether it is automatic or typed (or waiting), the signer's title, and the last change. `getClassRemarks` runs both loaders in one `readSnapshot`. The report card (#12) reads comments only through `loadClassRemarks`, inside its own `readSnapshot`, so a card's comments always match its figures.
- **AC-12**: Who may do what. A teacher reaches the Remarks section, sheet and save only for their form classes this session; anything else is not found. Our team reaches every class, and their saves are recorded under their own login. While viewing as someone, the sheet is read only with "You are viewing as this person. Nothing can be saved", and the server refuses the save too (spec 0004). The bands editor and its save are for our team only. Every id from the address or a save (class, term, student) is checked within the school.

## Decision

**Chosen option**: Option 1: one Remarks sheet per class with typed teacher's comments, automatic principal's comments from school wide bands that can be typed over, saved with the score sheet's Save pattern.

The existing `term_report` row holds both comments (`head_remark` null means automatic). One new table, `head_remark_band`, holds each school's wording. The automatic comment is worked out when read, never stored, from the same results read the card uses.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`)

## Feature design

**Data model sketch** (confirmed with the engineer):

| Table | Fields | Rules and links |
|---|---|---|
| `term_report` (exists, spec 0003) | `enrolment_id`, `teacher_remark` text (null), `head_remark` text (null means automatic), `days_present` (left unused, attendance is deferred), `updated_by` text (user id), `updated_at` | `unique (enrolment_id)`, composite link to `enrolment` (exist). **New checks**: `char_length(teacher_remark) <= 200`, `char_length(head_remark) <= 200`. One row per student per term (enrolment is per term) |
| `head_remark_band` (**new**) | `id`, `school_id`, `min_average` numeric(5,2) not null, `remark` text not null, `created_at`, `updated_at` | `school_id` links to `school`; `unique (school_id, min_average)`; `check (min_average between 0 and 100)`; `check (char_length(remark) between 1 and 200)`. Data layer rules: 2 to 10 bands per school, exactly one at 0 |

Relationships: school 1:N `head_remark_band`; enrolment 1:1 `term_report` (a row exists only once something is saved; no row means both comments empty, head automatic).

**Migration** (`drizzle/0009_*.sql` from `drizzle-kit generate`, then hand edited): create `head_remark_band`; add the two `term_report` checks; insert the 5 default bands for every existing school (`insert … select id from school`).

**Default bands** (in `src/lib/remarks.ts`, used by the migration's values, `createSchool` and the demo seed):

| Lowest average | Remark |
|---|---|
| 70 | An excellent result. Keep it up. |
| 60 | A very good result. Keep working hard. |
| 50 | A good result, with room to do even better. |
| 40 | A fair result. More effort is needed next term. |
| 0 | A weak result. Serious work is needed next term. |

**Quick picks** (fixed starter list in `src/lib/remarks.ts`, no setup screen, written without he or she so they fit any student): "A brilliant student. Keep it up.", "Hardworking and well behaved.", "A good term's work.", "Can do better with more effort.", "Needs to pay more attention in class.", "Shows steady improvement.", "Neat, punctual and respectful.", "A quiet student who should take part more.", "Needs to work harder in weak subjects.", "Should read more at home."

**How the automatic comment is worked out** (pure, in `src/lib/remarks.ts`):
- `headRemarkFor(averageHundredths, bands)`: bands' `min_average` turned into hundredths by parsing the text (never through a JavaScript float), sorted high to low; returns the first band with `averageHundredths >= min`. The 0 band means every complete student gets one.
- Incomplete student (no average, spec 0010): no automatic comment, state `waiting`.
- Resolved head comment shape: `{ kind: "typed", text } | { kind: "automatic", text } | { kind: "waiting" }`.
- `tidyRemark(text)`: trim, then replace every run of whitespace (spaces, tabs, line breaks) with one space; empty becomes null. Run in the browser (on leaving a box) and again in `saveRemarks` and `saveRemarkBands`; the server never trusts the browser's tidy.

**State transitions**:
- Head comment for a student in a term: waiting (result incomplete, nothing typed) ↔ automatic (result complete, nothing typed), moving as scores change; either → typed (saved typed text); typed → automatic or waiting (Use automatic, saved as null).
- Teacher comment: empty ↔ written.
- Sheet: editable (current term, not viewing as) or read only (earlier term, viewing as, or lost access), as in spec 0009.

**API surface** (pages call `requireSchoolContext`; data functions take a `SchoolContext`):

| Surface | Kind | Key inputs | Key outputs | Who | Key errors |
|---|---|---|---|---|---|
| `tidyRemark`, `headRemarkFor`, `DEFAULT_REMARK_BANDS`, `QUICK_PICKS` (new, `src/lib/remarks.ts`) | pure | text; average in hundredths and bands | tidy text or null; resolved head comment | any caller | none |
| `loadClassRemarks` (new, `src/server/data/remarks.ts`) | data, runs on the given `ctx.db`, opens no transaction | `classId`, `termId`, `results` (the same snapshot's `loadClassResults` output) | `signerTitle`, `rows[]`: `studentId`, `teacherRemark`, `head` (resolved shape), `lastChange` (`{ by, at }` or null) | form master of the class this session, our team | `NotFound`, `NoCurrentTerm` |
| `getClassRemarks` (new, same file) | data | `classId`, `termId` (optional, default current) | `{ results, remarks }` from one `readSnapshot` | same | same |
| `saveRemarks` (new, same file) | data, one transaction | `termId`, `classId`, `saveId`, `changes[]`: `studentId`, `field` (`teacher` or `head`), `expected` (text or null), `value` (text or null) | `{ changed, updatedAt }` | same, not while viewing as | `TermClosed`, `Conflict` (student ids), `NotInClass` (student ids, new), `InvalidRemark` (new: too long, or a field sent twice), `NotSignedIn`, `NotFound` |
| `getRemarkBands`, `saveRemarkBands` (new, same file) | data | `bands[]`: `minAverage` text, `remark` text | the set high to low; `FormResult` naming the broken band | our team only | `FormResult` errors per AC-10 |
| `saveRemarksAction` (new, `src/app/[school]/classes/remark-actions.ts`) | server action | the `saveRemarks` input plus the school slug | the same `SaveOutcome` shape the score sheet uses | as above; finds the person with `getActionViewer()` | errors mapped to the AC-5 to AC-8 outcomes |
| `/{school}/classes/[classId]` (changed) | page | `?term` | adds the Remarks section after Results, its counts read from the `getClassRemarks` call that replaces the page's `getClassResults` call | form master, our team | not found |
| `/{school}/classes/[classId]/remarks` (new) | page | `?term` | the sheet | form master, our team | not found |
| `RemarksSheet` (new, client, `src/components/remarks-sheet/`) | client component | sheet snapshot, draft key, read only reason | rows, quick picks, type over, Save bar, conflicts, stale notices | | |
| Grading page (changed) | page + team server action | the bands | the bands editor below the grade scales | our team | `FormResult` errors |

`saveRemarks` steps, mirroring `saveScores`: shape checks (tidy each value, refuse over 200 or a student and field sent twice) → transaction → `assertClassAccess` → `select is_current from term … for share`, refusing `TermClosed` → load open enrolments of the class that term for the named students, refusing `NotInClass` for any missing → lock their `term_report` rows `for update` → compare each `expected` with what is stored (tidy text, null for none), collecting `Conflict` → skip no op changes → upsert rows (`on conflict (enrolment_id)`), setting `updated_by` and `updated_at`. A typed head comment is stored as typed even if it equals today's automatic text.

The draft and conflict helpers in `src/components/score-sheet/draft.ts` key by student and column and keep the saved value each entry started from; reuse them with the two columns `teacher` and `head` and remark comparison (tidy text equality) instead of copying them, generalising the compare function if needed.

**Key invariants**:
- Comments reach `term_report` only through `saveRemarks`; bands reach `head_remark_band` only through `saveRemarkBands`.
- The automatic comment is never stored. `head_remark` holds only text a person typed.
- Every stored comment is tidy and at most 200 characters (data layer and database check).
- Every school always has 2 to 10 bands, one starting at 0, so every complete student has an automatic comment.
- A student with an incomplete result never gets an automatic comment; a missing score is never treated as 0 (spec 0010).
- Only the current term takes comments, decided from the share locked term row.
- Withdrawn enrolments are left out of the sheet, the counts and the loader; their saved comments are kept.
- A card's comments and figures come from one snapshot (`loadClassRemarks` with the same snapshot's `loadClassResults`).

**Security model**:
- Comments about children are personal data under the Nigeria Data Protection Act (spec 0003); they stay in the Neon project in London. No new public route.
- `loadClassRemarks` and `saveRemarks` call `assertClassAccess` (spec 0004): a teacher only for their form classes this session, our team for any class. `saveRemarks` calls `assertWritable`, so viewing as can't save. Ids from the address or a save are looked up within `ctx.schoolId`.
- `getRemarkBands` for the editor and `saveRemarkBands` require our team (`assertNotTeacher` plus the team school context).
- Comments render as text through React (escaped), never as HTML; the same holds in the PDF (#12).
- `updated_by` records who last saved each row; there is no change log (agreed: comments are rarely disputed).

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: a form master opens JSS 2 Gold's Remarks sheet, taps a quick pick for one student, types another, saves; both persist after reload, the counts update, the last change line names them; verifies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-9**.
- Automatic comment: a 72.45 average shows the 70 band, exactly 70.00 shows the 70 band, 69.99 shows the 60 band; an incomplete student shows "Waits for all scores", then the 70 band after the last score is saved; editing the band wording changes it on the next read; a typed comment stays put through both; verifies **AC-4**, **AC-10**.
- Tidy and length: text with line breaks and double spaces saves as one line; 200 characters saves, 201 is circled and blocked in the browser and refused by `saveRemarks` with `InvalidRemark`; the database check refuses 201 written directly; verifies **AC-3**.
- Conflict: two sessions load the sheet, both change the same student's teacher comment; the second save writes nothing and shows both texts with Keep mine and Use saved; a different student's comments in the same save are kept as unsaved; verifies **AC-6**.
- Closed term and race: a save for First Term after Second Term is current is refused with `TermClosed`; the earlier term's sheet is read only and lists never saved device comments with Discard; verifies **AC-7**.
- Stale: a student withdrawn after the sheet loaded makes the save refuse with `NotInClass`, nothing written, the row dropped with the AC-8 message; verifies **AC-8**.
- Bands rules: no 0 band, two bands at 50, one band, eleven bands, a 101 lowest average and an empty wording are each refused naming the band; a new school gets the 5 defaults; the migration gave the demo school its defaults; verifies **AC-10**.
- Snapshot: `getClassRemarks` returns head comments resolved from the same results it returns; a score saved during the read can't give a comment from a different average; verifies **AC-11**.
- Auth/permission: a teacher gets not found for another class's sheet and save; a class or student id from another school is not found; viewing as shows read only and the server refuses the save; a teacher can't load or save bands; verifies **AC-12**.
- Screen: the sheet at 390px and 1280px with 40 students, long comments, typed and automatic head comments, waiting rows and a conflict row (component tests plus visual check); verifies **AC-2**, **AC-3**, **AC-4**, **AC-6**.

## Build plan

Skateboard: first the thinnest whole a form master can use for real (write and save comments, see the automatic principal's comment), then the protections the score sheet already taught us we need, then our team's band editor, then the checks. The migration comes first because the automatic comment needs bands from the first slice.

1. [x] Migration: `head_remark_band` with its checks, the two `term_report` length checks, and the 5 default bands for every existing school; schema in `src/db/schema/results.ts`; `createSchool` inserts the defaults; the demo seed gets bands and a few comments; satisfies **AC-10**, **AC-3**.
2. [x] Pure rules in `src/lib/remarks.ts`: `tidyRemark`, `headRemarkFor` in hundredths, `DEFAULT_REMARK_BANDS`, `QUICK_PICKS`; unit tests including the band edges (70.00, 69.99, 0) and whitespace folding; satisfies **AC-3**, **AC-4**.
3. [x] Data: `loadClassRemarks`, `getClassRemarks`, `saveRemarks` with `NotInClass` and `InvalidRemark` added to `errors.ts`, exported from `src/server/data/index.ts`; database tests in `inRollback` for the save steps, conflict, closed term, stale student, snapshot and access; satisfies **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-11**, **AC-12**.
4. [x] Thinnest usable whole: the Remarks sheet page and `RemarksSheet` with teacher comments, quick picks, tidy and counter, the automatic, waiting and typed head comment with Type over and Use automatic, the last change line, the Save bar over `saveRemarksAction`; the Remarks section on the class page with its counts; satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-9**.
5. [x] Protect typed work: device draft and recovery, conflict rows, stale reloads, the term picker with read only earlier terms and the never saved list, viewing as read only; satisfies **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-12**.
6. [x] Bands editor on the Grading page: `getRemarkBands`, `saveRemarkBands` with the AC-10 rules, team only; tests for each rule; satisfies **AC-10**, **AC-12**.
7. [x] Component tests (`*.test.ts`, `createElement`, jsdom) for the sheet, quick picks, head comment states, conflicts and the Remarks section; visual check at 390px and 1280px with 40 students; satisfies **AC-1** to **AC-12** overall.

## Consequences

**Positive**:
- A form master writes a class's comments in one sitting on a phone, and the principal's comments need no typing at all.
- The principal's comment always matches the printed average, and a corrected score corrects it.
- One saving pattern across scores and remarks: the teacher learns it once, and typed work survives bad networks.
- The card (#12) gets comments and figures from one read, so they can never disagree.

**Negative / tradeoffs**:
- Students in the same band get word for word the same principal's comment; only typing over makes it personal.
- Bands have no history: when our team changes a school's wording, reprints of earlier terms show the new automatic wording (the same trade as the deferred "Principal history").
- A form master can type in the principal's voice, and nobody checks it before printing until "Principal approval" (deferred) is built.
- A class with missing scores has no automatic principal's comments for those students; the card (#12) must decide what to print then (recommended: refuse to print a provisional class, as spec 0010 suggests).
- No change history for comments, only the last change; a dispute about an earlier wording can't be settled from the app.
- `term_report.days_present` stays unused, and the school's `show_attendance` switch and the term's "days opened" field do nothing for the card yet.

**Neutral**:
- The class page grows again: Scores, Results, Remarks, then Students.
- The class page swaps its `getClassResults` call for `getClassRemarks`, which returns the same results plus the comments from the same snapshot.
- The Grading page gains a third block (splits, grade scales, comment bands).

## Follow-up

- [ ] Report card PDF (#12): print both comments only through `loadClassRemarks` inside the card's own `readSnapshot`, headed with the signer's title; budget two lines per comment (200 characters); decide how an empty teacher's comment prints.
- [x] Scope: rename row #11 to "Remarks", and add to Deferred: "Attendance: days present per student and the attendance box on the card. The columns (`term_report.days_present`, `term.days_opened`) and the school's switch already exist (from spec 0011)".
- [ ] Principal approval (deferred): when built, let the principal review and change the head's comments before printing.
- [ ] `/sync`: add a convention that comments reach the database only through `saveRemarks`, and that the card reads them only through `loadClassRemarks`.
