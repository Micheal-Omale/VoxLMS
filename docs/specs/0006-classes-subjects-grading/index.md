# 0006. Classes, subjects and grading rules

**Date**: 2026-10-16
**Status**: In Progress

## Summary

Our team sets up what each school teaches and how it grades. On three new checklist pages: the school's subject list (ticked from the shared Nigerian list, in one school wide order), its classes (made in one go from levels and arms) with the subjects each level offers, and each section's score split and grade scale (started from common presets). The tables already exist (spec 0003), so the build is one small migration, the setup pages, and the rules that keep saved scores safe when the setup changes. Grades are worked out from the scale whenever they are shown, so changing a scale changes every grade at once with nothing entered again.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As our team, I want to tick a school's subjects from a standard list and put them in the school's order once, so that every class, score sheet and report card lists them the same way.
- As our team, I want to create all of a school's classes in one go and give each level its subjects, so that a whole school is ready in minutes.
- As our team, I want to set each section's score split and grade scale from a common preset, so that teachers can enter scores and see the right grades.
- As our team, I want to fix a mistake in the setup after scores are in without breaking any score, so that report cards stay correct.

**Acceptance criteria** (the contract):
- **AC-1**: Our team builds the school's subject list by ticking subjects from the shared standard list (spec 0003). Each can be renamed to the school's wording ("English Studies") and keeps its link to the standard subject. Our team can also add a custom subject, with an optional link to a standard subject. Each subject has a short name (for broadsheet columns), suggested automatically, 2 to 5 capital letters or digits, unique within the school. Subject names are unique within the school. Problems show next to the field in plain words.
- **AC-2**: The school has one subject order, changed with move up and move down. Every list of a class's subjects (the school home, score sheets, and later report cards and broadsheets) follows that order. New subjects go to the end.
- **AC-3**: Our team creates classes by ticking levels (only levels whose stage has a section in the school) and typing arms once (for example Gold, Blue), or no arms. One save creates every class, named from the level and arm ("JSS 2 Gold", or "JSS 2" with no arm). A class whose name already exists is skipped and listed as skipped. A class can be renamed later (names stay unique in the school); its level and section never change.
- **AC-4**: For the session being edited, our team sets a level's subjects once (each compulsory or elective) and the change applies to every active arm of that level. A single class can then differ (add or drop a subject, or change compulsory or elective). The level's view shows which arms differ. A class offers at most 20 subjects in a session. Choosing which students take each elective is built in #8 (Enrol teachers and students), not here.
- **AC-5**: Our team sets each section's score split for a session, starting from a preset (CA 1 20, CA 2 20, Exam 60 · CA 40, Exam 60 · CA 1 10, CA 2 10, CA 3 10, Exam 70 · CA 30, Exam 70) and then renaming parts or changing maximums. A split has 1 to 5 parts, each with a unique label and a whole number maximum, and the maximums add up to exactly 100.
- **AC-6**: Our team sets each section's grade scale for a session, starting from the preset for its stage (A to F at 70, 60, 50, 45, 40, 0 for Primary and Junior Secondary; WAEC A1 to F9 at 75, 70, 65, 60, 55, 50, 45, 40, 0 for Senior Secondary), and can edit any band's grade, lowest score and remark, or add and remove bands. A scale has 2 to 12 bands, unique grades, unique whole number lowest scores, and one band starting at 0. Saving it changes the grades shown for that section and session straight away, with no score entered again, and never changes another session's grades.
- **AC-7**: Once scores exist, labels, a raised maximum, and the whole grade scale can still change. These are refused, with a message saying how many saved scores are affected: lowering a maximum below a saved score, removing a part that has scores, removing a subject from a class where it has scores, and making a compulsory subject elective where it has scores. A maximum can never be lowered while a teacher's save is checking scores against it (one of the two waits for the other).
- **AC-8**: A class or subject that nothing uses yet is deleted. One that is used can only be switched off: it stays on past records and leaves the pickers and this session's lists. A class can't be switched off while students are enrolled in it for the current term. A subject can't be switched off while any class offers it in the session being edited. A switched off class or subject can be switched back on.
- **AC-9**: The class subjects, score split and grade scale pages open on the current term's session, with a session switcher when the school has more than one. When the session being edited has none of these set and an earlier session exists, a "Copy from <earlier session>" action copies the earlier session's class subjects (for active classes and subjects), score splits and grade scales. It fills only what is empty and never overwrites.
- **AC-10**: The school's setup checklist gains three items: "Subjects" (done when the school has at least one active subject), "Classes" (done when there is at least one active class and every active class offers at least one subject in the current session), and "Score split and grades" (done when every section has a split adding up to 100 and a grade scale in the current session). Each shows a short status and links to its page.
- **AC-11**: Every page and action here is for our team only (anyone else gets not found). Every change keeps the school boundary (spec 0003): nothing set up for one school can touch another.

## Decision

**Chosen option**: Option 1: three checklist pages over the existing tables, with one add only migration on `school_subject`.

Build the setup as three small pages in the team area (Subjects, Classes, Score split and grades), each saving through server actions into the tables spec 0003 already created, with the safety rules checked inside the save's transaction.

**Implementation skills**: `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

## Feature design

**Data model sketch** (one add only migration):
- `school_subject`: add `sort_order` int, not null, default 0 (existing rows are numbered per school in name order); add `is_active` boolean, not null, default true; add `unique (school_id, short_name)` (the demo data already passes).
- Reused as they are (spec 0003):
  - `class`: `section_id`, `stage`, `standard_level_id`, `arm` (null), `name`, `sort_order`, `is_active`. New classes get `sort_order` = the standard level's order × 10 + the arm's position, so lists run JSS 1 Gold, JSS 1 Blue, JSS 2 Gold.
  - `class_subject`: `session_id`, `class_id`, `section_id`, `subject_id`, `is_elective`. "Per level" writes one row per active arm. Its `sort_order` column stays (add only rule) but is no longer read; every read orders by `school_subject.sort_order`, then name.
  - `assessment_component`: `key` is made from the label when a part is created (`ca1`, `exam`) and never changes after, because score saves name parts by key. Renaming changes only `label`.
  - `grade_band`: saved as a whole scale (the section and session's rows are replaced in one transaction; nothing references a band).
- Presets live in code (`src/lib/grading-presets.ts`): the four splits in AC-5 and the two scales in AC-6, with Primary using CA 40 / Exam 60 and the A to F scale by default, secondary using CA 1 20 / CA 2 20 / Exam 60.

**State transitions**:
- class and school subject: active → switched off → active again. Delete is only possible while unused (a class with no enrolments and no form teacher, in any session; a subject with no class subject and no student elective rows). Deleting an unused class also deletes its class subject rows in the same transaction.
- class subject: compulsory ↔ elective; compulsory → elective is refused while it has scores in that session.

**API surface** (pages call `requireTeamSchoolContext`; actions call data functions in `src/server/data/curriculum.ts` and `src/server/data/grading.ts`, which return the `FormResult` shape from `setup.ts`):

| Surface | Kind | Key inputs | Result | Who | Key errors |
|---|---|---|---|---|---|
| `/admin/schools/[id]/subjects` | page | none | the school's subjects in order, the standard list to tick from | our team | not found |
| `addStandardSubjects` | action | standard subject ids | subjects added at the end, short names suggested | our team | name or short name already used |
| `saveSubject` | action | id (opt, new if absent), name, short name, standard subject id (opt) | saved | our team | name taken; short name taken or wrong format |
| `moveSubject` | action | id, `up` or `down` | order swapped with its neighbour | our team | not found |
| `removeSubject` / `restoreSubject` | action | id | deleted if unused, else switched off; or switched back on | our team | offered in the session being edited |
| `/admin/schools/[id]/classes?session=` | page | session (opt, default current) | classes by level, each level's subject offer, which arms differ, copy banner when empty | our team | not found; no sections yet; no session yet |
| `createClasses` | action | level ids, arms (list, may be empty) | classes created, names skipped | our team | level's stage has no section |
| `saveClass` | action | id, name, arm | renamed | our team | name taken |
| `removeClass` / `restoreClass` | action | id | deleted if unused, else switched off; or switched back on | our team | students enrolled this term |
| `saveLevelOffer` | action | level id, session id, changes: `{ subjectId, offered, isElective }[]` (only the subjects the form changed) | applied to every active arm of the level | our team | over 20 subjects; refused removals or flips, per arm, with score counts |
| `saveClassOffer` | action | class id, session id, the class's full subject list with elective flags | that class's offer replaced | our team | over 20; refused removals or flips with score counts |
| `copySessionSetup` | action | from session id, to session id | empty parts filled; counts copied | our team | nothing to copy |
| `/admin/schools/[id]/grading?session=` | page | session (opt) | one card per section: split and scale, presets | our team | not found; no sections yet |
| `saveScoreSplit` | action | section id, session id, parts: `{ id (opt), label, max }[]` in order | split saved | our team | total not 100; 0 or over 5 parts; duplicate label; max below a saved score; part with scores removed |
| `saveGradeScale` | action | section id, session id, bands: `{ grade, min, remark }[]` | scale replaced | our team | under 2 or over 12 bands; duplicate grade or lowest score; no band at 0 |

**Level offer view**: each subject's box is ticked when every active arm offers it, partly ticked when some do, and empty when none do. Saving sends only the boxes our team changed, so an arm's own difference survives a level save unless that subject is touched.

**Key invariants**:
- Every reader of a class's subjects orders by `school_subject.sort_order`, then name.
- A section's parts for a session add up to 100 whenever a save finishes; 1 to 5 parts; whole number maximums.
- No saved score ever exceeds its part's maximum. `saveScoreSplit` locks the section and session's part rows (`select … for update`) before checking saved scores, and `saveScores` now locks the same rows (`for share`) before checking maximums, so the two can never interleave.
- A grade scale always has a band starting at 0, so every total from 0 to 100 has a grade.
- Removing an offered subject, removing a part, or flipping compulsory to elective never orphans a saved score: each is checked against `score` inside the same transaction.
- A class offers at most 20 subjects per session (checked while holding a lock on the class row).
- Copying a session never overwrites: it writes only into a section, or class, that has nothing set for the target session.
- Setup changes in one session never edit another session's rows (spec 0003).

**Security model**:
- Every page uses `requireTeamSchoolContext`; every data function calls `assertTeam`. Teachers and anyone else get not found.
- Every write carries the school id from the address and is checked by the composite keys (spec 0003); ids from forms are always looked up within that school.
- No children's personal data is touched here, only setup. Scores are never edited by this feature, only counted, so the score change log (spec 0003) needs nothing new.

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: on the demo school, tick Mathematics and English from the standard list, move English first, create JSS 1 with arms Gold and Blue, give JSS 1 eight subjects, set Junior Secondary to CA 1 20 / CA 2 20 / Exam 60 and A to F; both arms list English first; the checklist shows all three items done; verifies **AC-1** to **AC-6**, **AC-10**.
- Failure case: with a saved CA 1 score of 18, lowering CA 1 to 15 is refused naming one score; removing Mathematics from JSS 2 Gold (which has scores) is refused while its other changes save nothing; a split adding to 95 is refused; verifies **AC-5**, **AC-7**.
- Failure case: changing the A band from 70 to 75 turns a total of 72 from A to B on the next read, and the 2025/2026 grades stay the same; verifies **AC-6**.
- Failure case: a level save that drops a subject from SS 1 Arts only leaves SS 1 Science's own extra subject alone; a 21st subject is refused; verifies **AC-4**.
- Edge: removing an unused subject deletes it; removing one used last session switches it off and it leaves the picker; a class with students this term can't be switched off; verifies **AC-8**.
- Edge: copy from 2026/2027 into a new 2027/2028 fills splits, scales and offers; running it again copies nothing; verifies **AC-9**.
- Auth/permission: a teacher calling any action or opening any page gets not found; a subject id from another school passed to `saveLevelOffer` is not found; verifies **AC-11**.

## Build plan

Skateboard: first the shortest path to a pilot that a teacher can score against (subjects, classes, the split and the scale), then the session tools and the checklist.

1. [x] Migration: `school_subject.sort_order` (backfilled in name order per school), `is_active`, `unique (school_id, short_name)`; update the demo seed to set subject order (English, Mathematics first); satisfies **AC-1**, **AC-2**, **AC-8**.
2. [x] Data functions for subjects, classes and offers in `src/server/data/curriculum.ts` (team only, with every rule above); switch `listHomeClasses` and any other class subject reader to the school subject order; satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-7**, **AC-8**, **AC-11**.
3. [x] Grading presets and data functions for splits and scales in `src/server/data/grading.ts`; add the `for share` lock on part rows in `saveScores`; satisfies **AC-5**, **AC-6**, **AC-7**, **AC-11**.
4. [x] Subjects page: tick from standard list, edit, custom subject, move up and down, remove or switch off; satisfies **AC-1**, **AC-2**, **AC-8**.
5. [x] Classes page: levels × arms grid, rename, remove or switch off, level offer with partly ticked boxes, per class offer; satisfies **AC-3**, **AC-4**, **AC-7**, **AC-8**.
6. [x] Score split and grades page: one card per section with presets, split editor showing the running total, scale editor; satisfies **AC-5**, **AC-6**, **AC-7**.
7. [x] Session switcher on the classes and grading pages, "Copy from last session", and the three checklist items; satisfies **AC-9**, **AC-10**.
8. [x] Tests for the rules, the lock, the copy and access; satisfies **AC-1** to **AC-11**.

## Consequences

**Positive**:
- Our team can set up a whole school's teaching and grading in minutes, and teachers can start entering scores (#9).
- Grades always follow the current scale, and no setup change can leave a score that breaks its part's maximum or loses its subject.
- Subjects keep their link to the standard list, so the future learning platform can match subjects across schools.

**Negative / tradeoffs**:
- A new arm added mid session does not inherit its level's subjects by itself; our team saves the level offer again (the partly ticked boxes show which subjects to tick).
- Every new session needs "Copy from last session" pressed once, or a fresh setup.
- `class_subject.sort_order` becomes an unused column (kept because migrations are add only).
- A school that orders subjects differently for different classes can't (one school wide order).
- Saving the score split now briefly waits for any score save running against the same section, and the reverse.

**Neutral**:
- Choosing which students take each elective moves to #8, where the students exist.
- Report card #12 can design its page for at most 20 subjects.

## Follow-up

- [ ] Enrol teachers and students (#8): register each senior student's electives per session (spec 0003, AC-8), choosing from the electives their class offers.
- [ ] Results computation (#10): decide how a total with a decimal (for example 69.5) is matched to a grade band, since bands use whole numbers.
- [ ] Report card PDF (#12): design for up to 20 subject rows on one A4 page, in the school subject order.
