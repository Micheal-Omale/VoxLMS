# 0009. Score entry

**Date**: 2026-10-17
**Status**: Accepted

## Summary

A form master opens their class, sees every subject with how many students are fully scored, and taps a subject to fill its ruled score sheet on a phone or computer. Typed scores stay on the device until the server confirms the save, so nothing is lost on a bad network. When two people save the same scores, the later one sees both values and chooses. Only the current term can be changed. Our team gets a Scores page per school to see which classes are behind. The save logic and tables already exist (spec 0003), so there is no migration: the work is the screens, one new save rule, paste, history and progress.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a form master, I want to see which subjects of my class still have missing scores, so that I finish everything before results day.
- As a form master, I want to type a whole subject's CA and exam scores quickly on my phone, so that I can do it between lessons.
- As a form master, I want my typed scores kept even if the network drops or the page reloads, so that I never type a class twice.
- As a form master, I want to see who changed a score and when, so that a dispute is settled on the spot.
- As our team, I want to type scores from a teacher's paper sheet, and paste a column from a spreadsheet, so that we can help on results day.
- As our team, I want to see every class's progress in one place, so that we know whom to chase.

**Acceptance criteria** (the contract):
- **AC-1**: The class page `/{school}/classes/[classId]` opens with a Scores section above the existing student list. It lists every subject the class offers this session, compulsory first, then electives, each in the school's subject order. Each subject shows "N of M complete": M is the number of students taking it this term (open enrolments, and for an elective only students registered for it), and N is how many of them have every part of the split entered. A subject with N = M and M > 0 shows a done mark (a tick with the word "Done"). An elective nobody takes shows "No students take this yet". Each subject opens its score sheet.
- **AC-2**: The Scores section has a term picker listing this session's terms up to and including the current term, the current term first and chosen by default. The chosen term is in the address (`?term=<termId>`) and carries to the sheet and the subject switcher. For an earlier term, progress is that term's, and its sheets open read only with "First Term is closed. Scores can only be changed in the current term." A term after the current one, or from another session, is not found.
- **AC-3**: The score sheet `/{school}/classes/[classId]/scores/[classSubjectId]` shows the class, subject and term, and the students taking that subject that term, surname first, with their admission number. It has one field per part of the section's split for that session (1 to 5 parts), each header showing its label and maximum, plus a live total and grade (from the section's grade scale) and a progress line ("28 of 32 complete"). A subject switcher moves to the class's other subjects in the same term. At 390px wide every part fits on the student's row with fields at least 44px tall and no sideways page scroll.
- **AC-4**: Typing follows spec 0003, AC-4 and the design system. A field takes digits and one decimal place only. A typed score above its part's maximum is circled in red, explained underneath ("Exam is out of 60"), and blocks Save until fixed (only typed changes block; saved scores never do). A part not entered shows a dash ("Exam not entered yet"). The total and grade show only when every part is entered. Clearing a saved score counts as a change and removes it on save. Enter moves along the row, then to the next student; the up and down arrows move within a column.
- **AC-5**: A sticky Save sends only the changed scores, each with the value it replaced (the saved value the teacher started from), under one save id. Tapping Save freezes that change set: a retry after a network failure resends the same changes under the same id, and anything typed after the tap waits for the next Save. A request with no reply after 20 seconds counts as failed. Once the save lands, it says "Saved at 3:14 pm" (Lagos time), the changed row stripes clear, and progress updates. Every typed score is kept on the device, with the saved value it started from, until its save is confirmed. The draft is keyed by user, term and class subject. After a refresh or crash, unsaved scores come back with a notice and are checked against the fresh sheet: a typed score that now equals the saved one drops out; one whose saved value changed meanwhile becomes an AC-7 conflict row; students and parts no longer on the sheet are handled as in AC-8. Offline, Save is off and says so. A failed request keeps everything typed and says "Couldn't save. Your scores are kept on this phone. Try again." If the app was updated since the page loaded and the save can't reach the server, it says "VoxLMS was updated. Reload the page; your scores are kept on this phone." A signed out session says to sign in again, and the draft is still there afterwards.
- **AC-6**: Only the current term can be changed. `saveScores` refuses a term that is not current with `TermClosed`, saving nothing. Inside its transaction it runs its own `select is_current from term … for share` (a share lock only blocks changes to that row) and reads the flag from that result, never from an earlier unlocked read. So a save racing a term switch either lands before the switch or is refused after it, and a save aimed at the term becoming current is refused until the switch commits. Read only sheets have no Save bar and their fields cannot be typed in.
- **AC-7**: When a save is refused because someone else saved some of the same scores first (`Conflict`), nothing is written. The affected students' rows load the newer saved values. Each row shows the teacher's typed values beside the saved ones, marked in amber, with "Keep mine" (every typed part in that row becomes a change against the newer saved values) and "Use saved" (the typed values for that row are dropped). A typed value that equals the newer saved value drops out on its own, and a row left with nothing different is not shown as a conflict. Save stays off until every such row is decided. Every other row's typed scores stay as unsaved changes.
- **AC-8**: When a save is refused because the sheet is out of date (a student no longer takes the subject, `NotTakingSubject`, or a part's maximum is now lower than a typed value, `ScoreAboveMaximum`), the sheet reloads its students, parts and saved scores. It names what changed ("OKON Emem is no longer in this subject, so their scores were not saved"), drops removed students' rows, circles any typed score that is now too high, and keeps every other typed score as unsaved. One more Save finishes.
- **AC-9**: A read only sheet that finds scores on this device that were never saved shows "12 scores typed on this phone were never saved before First Term closed". It lists them from the device's draft (student, part, value) so the teacher can pass them to our team, and offers Discard, which clears them from the device. Nothing is ever saved from a read only sheet.
- **AC-10**: Pasting text with more than one line into a score field fills that column downwards from that student, one line per student in sheet order. Each line is trimmed (carriage returns and spaces removed), and one trailing empty line is ignored. Blank lines leave that student unchanged. Trailing zeros after the decimal point are removed ("48.00" becomes "48", "12.50" becomes "12.5"); nothing else is changed. Each value then goes through the AC-4 rules: a bad value is kept, circled and explained, never rounded or dropped. Lines beyond the last student are ignored and counted ("3 lines were left over"). Text with tabs (more than one column) is refused with "Paste one column at a time". After a paste, a notice says "Pasted 32 scores into Exam, from OKON Emem down. Check the names line up before saving." Nothing is saved until Save.
- **AC-11**: Tapping a student's name on a sheet opens their score history for that subject and term: every change to each part, newest first, showing old value and new value (a dash for none), who made it, and when (date and Lagos time). A school staff member shows as their title and name. Our team shows as "VoxLMS team (name)". History opens on read only sheets too, and shows "No changes yet" for a student with no saves.
- **AC-12**: A Scores page `/admin/schools/[schoolId]/scores`, linked from the school overview beside Staff and Students, shows the current term's classes grouped by section. Each class shows "subjects done X of Y", where Y counts only subjects with at least one taker, and names its unfinished subjects with their counts (at most three named, then "and N more"). Each class opens its class page. Without a current term, the page says to set one first.
- **AC-13**: Who may do what. A teacher reaches the subject list, sheets, saves and history only for their form classes this session; anything else is not found. Our team reaches every class, and their saves are recorded under their own login. While viewing as someone, sheets open read only (fields can't be typed in, so no draft is made) with "You are viewing as this person. Nothing can be saved", and the server refuses the save too (spec 0004). The Scores page is for our team only. Every id from the address or a save (class, class subject, term, student) is checked within the school.
- **AC-14**: When the section has no score split for the session, the sheet says "The score split for Junior Secondary, 2026/2027 is not set yet. The VoxLMS team sets it." and shows no fields. Without a grade scale, the grade shows a dash and totals still show. A subject nobody takes shows an empty sheet with the AC-1 wording. Without a current term, the class page shows the existing "no current term" state.

## Decision

**Chosen option**: Option 1: a subject list with progress on the class page, opening one ruled sheet per subject, saved with an explicit Save over the existing `saveScores`.

The form master works one subject at a time on the `ScoreSheet` that already exists in the design preview, extended to real data, 1 to 5 parts, conflicts, stale sheets, paste and history. The only rule added on the server is that a closed term can't be saved. Progress is counted from scores when it is shown, never stored.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`)

## Feature design

**Data model sketch**: no new tables or columns, and no migration. Confirmed with the engineer.

| Table | How this feature uses it |
|---|---|
| `score` (spec 0003) | Read for sheets and progress; written only through `saveScores`. No row means not entered |
| `score_change` (spec 0003) | Written by `saveScores` (unchanged); read for history by `enrolment_id`, `class_subject_id`, `component_id` (index `score_change_enrolment_idx` exists) |
| `term` | `is_current` decides editable or read only; locked for share inside `saveScores` (AC-6) |
| `class_subject`, `assessment_component`, `grade_band`, `enrolment`, `student_elective` | Read for which subjects, parts, maximums, grades and takers (all existing) |
| `staff`, Better Auth `user` | Read to name who made each change (AC-11) |

"Complete" for a student in a subject means one `score` row for each part of the section's current split for that session (counted by joining to those parts). A subject is done when every taker is complete and there is at least one taker. Both are counted in SQL when shown (index `score_class_subject_idx` exists).

**State transitions**:
- A score field: saved, or not entered → typed (amber, kept on the device) → saving → saved; or → refused (circled, or a conflict row waiting on "Keep mine" or "Use saved") → typed again.
- A sheet: editable (current term, not viewing as) or read only (earlier term, or viewing as). Switching the current term turns an editable sheet read only; a draft left behind becomes the AC-9 notice.

**API surface** (pages call `requireSchoolContext`; data functions take a `SchoolContext`; actions in `src/app/[school]/classes/score-actions.ts`):

| Surface | Kind | Key inputs | Result | Who | Key errors |
|---|---|---|---|---|---|
| `/{school}/classes/[classId]` (changed) | page | `?term` | Scores section (term picker, subject progress) above the existing student list | form master, our team | not found |
| `/{school}/classes/[classId]/scores/[classSubjectId]` (new) | page | `?term` | the sheet, editable or read only | form master, our team | not found |
| `/admin/schools/[schoolId]/scores` (new) | page | none | classes by section with subjects done and unfinished subjects | our team | not found |
| `listSubjectProgress` (new, `scores.ts`) | data | classId, termId | session terms up to current for the picker; per class subject: name, elective flag, takers, complete | form master, our team | `NotFound` (class, or term after current or other session) |
| `getScoreProgress` (new, `scores.ts`) | data | termId | per active class: section, subjects done and total, unfinished subjects with counts | our team (`assertTeam`) | `NotFound` |
| `getScoreSheet` (changed) | data | termId, classSubjectId | adds `term.isCurrent`, term label, section and session names (for AC-14), each student's admission number, `lastSavedAt` (latest `score.updated_at` on the sheet) | form master, our team | `NotFound` |
| `saveScores` (changed) | data | unchanged | unchanged | form master, our team | adds `TermClosed`; others unchanged |
| `getScoreHistory` (new, `scores.ts`) | data | termId, classSubjectId, studentId | per part: changes newest first with old, new, who (resolved name), when | form master, our team | `NotFound` |
| `saveScoresAction` (new) | server action | termId, classSubjectId, saveId, changes | `{ ok: true, updatedAt }`, or `{ ok: false, kind, … }` (below) | form master, our team | none thrown to the client |
| `scoreHistoryAction` (new) | server action | termId, classSubjectId, studentId | history list | form master, our team | not found |

`saveScoresAction` turns each data error into a result the sheet can act on, and returns a freshly read sheet where the sheet must reload:
- `Conflict` → `{ kind: "conflict", studentIds, sheet }` (AC-7)
- `NotTakingSubject` → `{ kind: "stale", removedStudentIds, sheet }` (AC-8)
- `ScoreAboveMaximum` → `{ kind: "stale", sheet }` (AC-8)
- `TermClosed` → `{ kind: "closed" }`, and the sheet turns read only and shows AC-9 (AC-6)
- `ReadOnlySession` → `{ kind: "readOnly" }` (AC-13)
- `InvalidScore` → `{ kind: "invalid", studentId, componentKey }` (the browser rules make this a bug, so the message says to reload)
- `NotFound` → `{ kind: "notFound" }` (for example the teacher stopped being form master mid term): the sheet turns read only, says "You no longer have this class. Your typed scores are kept on this phone.", and keeps the draft
- `NotSignedIn` → `{ kind: "signedOut" }`: says to sign in again; the draft is kept (AC-5)

**`ScoreSheet` changes** (`src/components/score-sheet/`): columns from the sheet's parts (1 to 5, not fixed at three); admission number under the name; the name opens history; a `readOnly` mode with no Save bar, fields that can't be typed in, and the AC-9 notice; a draft that stores each typed value with the saved value it started from, keyed `score-draft:{userId}:{termId}:{classSubjectId}`, and is checked against the fresh sheet on restore (AC-5); an `onSave` that returns the action's result so the sheet can handle conflict and stale rows; conflict rows with "Keep mine" and "Use saved"; multi line paste. The design preview at `/design/score-entry` keeps working on demo data.

**Decisions settled while writing** (each with the runner up):
- Who appears in history: team members by Better Auth user name, staff by their staff title and name in this school, looked up at read time. Runner up: storing a name on each `score_change`. Not needed, and names would go stale.
- Where the term picker lives: on the Scores section only. The student list stays on the current term. Runner up: the picker driving the whole page, which needs per term rosters this feature does not otherwise need.
- 4 or 5 parts on a phone: part fields shrink to fit 390px but stay at least 44px tall and show "100" and "12.5" in full. The total and grade wrap under the parts if they don't fit. Runner up: sideways scrolling inside the sheet. Rejected, because it hides columns and breaks Enter moving along the row.
- History trigger: the student's name, not a long press on a field. A field tap must always mean typing. Runner up: a history icon per row, which crowds the phone row.
- Save id: one per Save tap, reused by its retries with the same frozen change set, so a request that landed but whose reply was lost logs nothing twice (spec 0003, AC-5; the retry's changes are all no ops). `score_change.save_id` has no unique constraint, so this rests on freezing the change set.
- Request timeout: 20 seconds on the client, because server actions have none and a hung "Saving" would block retry. Runner up: no timeout, relying on the browser, which can wait minutes.

**Key invariants**:
- A score in a term that is not current is never written: `saveScores` reads `term.is_current` from its own `select … for share` on the term row in the same transaction (not from the unlocked join in `loadClassSubject`). `setCurrentTerm` updates that row, so the two wait for each other.
- A missing part is never counted as 0: totals, grades and "complete" need every part.
- Nothing is written from a read only sheet, and a refused save writes nothing (spec 0003, AC-5).
- Typed scores leave the device's storage only when the server confirms they are saved, or when the teacher chooses "Use saved" or Discard.
- Progress and history read the same tables the report card will read; nothing is cached or stored separately.

**Security model**:
- Scores are children's personal data under the Nigeria Data Protection Act (spec 0003). They stay in the Neon project in London. No new public route.
- Reads and writes go through `assertClassAccess` (spec 0004): a teacher only for their form classes this session; our team for any class. `getScoreProgress` calls `assertTeam`. Writes keep `assertWritable`, so viewing as can never save.
- Every score change keeps its audit row (`score_change`, add only). History shows staff names only to people who can already open that sheet.
- Drafts in `localStorage` hold only student ids, part keys and values (no names), are keyed by user, and are cleared on confirm or discard. Another person signing in on the same phone never sees or saves someone else's draft.

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: the form master opens JSS 2 Gold, sees Mathematics at 0 of 16, types every part for every student, saves, and the subject shows Done; verifies **AC-1**, **AC-3**, **AC-5**.
- Closed term: switching the current term while a save is waiting on the term lock, the save is refused with `TermClosed` after the switch commits, and nothing is written; a save aimed at the term being made current is refused until the switch commits; an earlier term's sheet is read only; verifies **AC-2**, **AC-6**.
- Restored draft: a draft made from value 12, after a colleague saved 15, restores as a conflict row instead of overwriting 15; verifies **AC-5**, **AC-7**.
- Conflict: two contexts save the same score from the same starting value; the second gets the conflict result with the newer value; "Keep mine" then saves; verifies **AC-7**.
- Out of date: a student is withdrawn after the sheet loads; the save returns `stale` with that student removed, and the others save on the next try; verifies **AC-8**.
- Stale draft: a stored draft for a closed term shows the notice with its scores and is cleared by Discard; verifies **AC-9**.
- Paste: 34 lines into Exam with 32 students fills 32 and reports 2 left over; "48.00" with a carriage return becomes 48; a value of 61 against a maximum of 60 is circled; a tabbed paste is refused; verifies **AC-10**.
- History: two saves by a teacher and one by our team show three changes, newest first, with names resolved; verifies **AC-11**.
- Progress: an elective with two registered students counts only them; a student missing one part is not complete; the team page names unfinished subjects; verifies **AC-1**, **AC-12**.
- Auth/permission: a teacher gets not found for another class's sheet, save, history and the Scores page; a view as save is refused; a class subject id from another school is not found; verifies **AC-13**.
- Edge: no split set shows the AC-14 message; no grade scale shows a dash grade with totals; verifies **AC-14**.

## Build plan

Skateboard: first the thinnest whole a form master can use for real (subject list, one sheet, save), then the cases that protect typed work, then the helpers (paste, history), then our team's overview.

1. [x] Data: `TermClosed` and the term share lock in `saveScores`; `getScoreSheet` additions; `listSubjectProgress` and `getScoreProgress` on one shared progress query; `getScoreHistory` with name lookup; database tests in `inRollback`; satisfies **AC-1**, **AC-6**, **AC-11**, **AC-12**, **AC-13**.
2. [x] Thinnest usable whole: the Scores section on the class page, the sheet route on real data with `saveScoresAction` (happy path, offline, failed request), `ScoreSheet` with 1 to 5 parts and admission numbers, subject switcher, empty states; satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-13**, **AC-14**.
3. [x] Protect typed work: the term picker and read only sheets, the stale draft notice, conflict rows with "Keep mine" and "Use saved", and the stale reload; satisfies **AC-2**, **AC-6**, **AC-7**, **AC-8**, **AC-9**.
4. [x] Helpers: multi line paste into a column, and the history panel opened from the student's name; satisfies **AC-10**, **AC-11**.
5. [x] Our team's Scores page and its link on the school overview; satisfies **AC-12**.
6. [x] Component tests (`*.test.ts`, `createElement`, jsdom) for paste, conflict choice, read only and stale draft; visual check at 390px and 1280px with 3 and 5 parts; satisfies **AC-3**, **AC-7**, **AC-9**, **AC-10**, and **AC-1** to **AC-14** overall.

## Consequences

**Positive**:
- The pilot school's form masters can enter every subject before results day, on the phones they have.
- Typed work survives bad networks, reloads, conflicts and students leaving mid entry.
- Score disputes are answered on the sheet itself, from the change log already kept.
- Our team sees who is behind without asking each teacher.
- No migration and no new tables; progress can never drift from the scores.

**Negative / tradeoffs**:
- One form master types every subject; in schools where subject teachers own their marks, the form master must collect paper sheets first (subject teachers are a later release).
- A correction after the term switch needs our team to make that term current again, fix it, then switch back. There is no lock or reopen button.
- "Absent" can't be recorded; a missed exam is just not entered, and results computation (#10) decides how that prints.
- Drafts live on one device; scores typed on a phone and never saved don't appear on the laptop.
- Paste trusts the order of the teacher's spreadsheet; a list sorted differently pastes against the wrong names, which the notice warns about but can't prevent.
- Progress is counted on every page view; fine at pilot size, worth watching at many schools.

**Neutral**:
- The class page leads with scores; the student list moves below.
- Spec 0003's follow up item for score entry (send expected values and a save id, show conflicts clearly) is met by AC-5 and AC-7.
- `ScoreSheet` stops being a fixed three column demo; the design preview keeps working on demo data.

## Follow-up

- [ ] Subject teachers (a later release): a subject teacher link per class subject and access through it; the sheet and save stay the same.
- [ ] Results computation (#10) decides how a subject with a missing part prints on the report card and broadsheet, and whether an "Absent" mark is needed.
- [ ] Principal approval (deferred in scope) could add a lock per class; until then the current term is the only lock.
- [ ] Excel import (#13) should go through `saveScores` (with its own save id) so imported scores get the same checks and history.
- [ ] `/sync` should note in spec 0003 that `saveScores` now refuses terms that are not current.
