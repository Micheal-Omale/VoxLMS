# 0010. Results computation

**Date**: 2026-10-18
**Status**: Proposed

## Summary

The system works out each class's term results from the saved scores every time they are read: each subject's total, grade, remark and position, each subject's class average, highest and lowest, and each student's overall total, average and position (for example "5th of 32"). Nothing is stored, so a corrected score changes every affected figure at once. A missing score is never counted as 0: a student with any part not entered has no overall result, and the others are ranked as provisional until everyone is complete. The form master sees it all in a new Results section on the class page, so they can check a hand calculation before report cards (#12) print. There is no migration.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a form master, I want my class's totals, averages and positions worked out for me, so that I don't spend a weekend with a calculator before results day.
- As a form master, I want to see which students are still incomplete and exactly which parts are missing, so that I can chase the right scores before printing.
- As a parent (through the report card), I want my child's figures to match a hand calculation, with ties shared the way Nigerian schools do it, so that I can trust the card.
- As our team, I want one computation that the report card, broadsheet and reprint all read, so that no two documents ever disagree.

**Acceptance criteria** (the contract):
- **AC-1**: A student takes a subject when the class offers it this session as compulsory, or as an elective the student is registered for that session. For each subject a student takes, the subject total is the sum of every part of the section's split for that session, kept exactly as typed (one decimal place at most, never rounded). The total shows only when every part is entered; otherwise the subject is incomplete for that student and names its missing parts. The grade and remark come from the section's grade scale for that session, by comparing the exact total with each band's lowest score (69.5 against an A starting at 70 is B). Without a grade scale, grade and remark show a dash and every other figure still works.
- **AC-2**: A student is complete when every subject they take is complete. A complete student's overall total is the sum of their subject totals, and their average is that total divided by the number of subjects they take, rounded half up to two decimal places (67.455 becomes 67.46, 67.454 becomes 67.45). An incomplete student has no overall total, average or class position; they show "Incomplete" with each missing subject and its parts ("Mathematics: Exam · Basic Science: CA 2"). A student who takes no subjects shows "Incomplete: takes no subjects yet". A part not entered is never counted as 0; a 0 the teacher typed is a real score.
- **AC-3**: Complete students are ranked by their two place average, highest first, against the other students of their own class (arm) in that term. Equal two place averages share a position and the next position is skipped (two students 3rd, the next 5th). Positions are written as ordinals with no tie mark: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd, 23rd, 101st, 111th. A class position is shown with the number in class ("5th of 32").
- **AC-4**: The number in class is every student whose enrolment for that term is in this class and not withdrawn, complete or not. A student withdrawn in a term is left out of that term entirely: not listed, not counted, and not in any total, average, position, highest or lowest. Their earlier terms are separate enrolments and keep them (spec 0003, AC-10). A student moved to another arm appears in whichever class their enrolment for that term is in when results are read.
- **AC-5**: For each subject, the students who have that subject complete (whether or not their overall result is complete) are ranked by exact subject total, with the AC-3 tie and ordinal rules, giving each a subject position. The same students give the subject's class average (the mean of their totals, two places, half up), highest total and lowest total. A subject with no complete takers shows dashes for all four. An elective counts only its registered takers.
- **AC-6**: The class average is the mean of the ranked students' two place averages, rounded half up to two places. With no ranked students it shows a dash.
- **AC-7**: While any student in the class is incomplete, class positions and the class average are provisional and say so ("Provisional: 3 students incomplete"). A subject's positions, class average, highest and lowest are provisional while any of its takers is incomplete in it. A complete student's own subject positions can still be provisional while other takers of that subject are incomplete. The class results are final (`final: true`, for the report card #12 to check) only when the class has at least one student, the split is set, the class offers at least one subject, and every student is complete. Every figure follows the data at the moment it is read: changing a score, the split, the grade scale, an enrolment or an elective registration changes the results on the next read, with nothing stored and nothing to recompute.
- **AC-8**: The class page `/{school}/classes/[classId]` gains a Results section between Scores and Students. It follows the Scores term picker (`?term`), so it shows any term of this session up to the current one. It shows the number in class, the class average, and whether the results are final or provisional. Below that, the ranked students in position order (equal positions in surname order, then other names, then student number), each with position, name (surname first), overall total and average. Then an "Incomplete" group in surname order, each naming what is missing. Tapping a student opens their breakdown: every subject they take (compulsory first, then electives, each in the school's subject order) with its parts, total, grade, remark, subject position, class average, highest and lowest, then their overall total, average and position. A subject whose figures are provisional carries its own small "Provisional" mark there, apart from the class's banner. On a phone each subject is a stacked block (name, then parts, then figures), not a wide table. At 390px wide nothing scrolls the page sideways and every tappable row is at least 44px tall.
- **AC-9**: When the section has no score split for the session, the Results section says "Results need the score split for Junior Secondary, 2026/2027. The VoxLMS team sets it." and shows no figures. A class with no students, or no subjects this session, shows a plain empty state saying which. Without a current term, the class page shows its existing "no current term" state.
- **AC-10**: Who may see results. A teacher sees results only for their form classes this session; anything else is not found. Our team sees every class, including while viewing as someone (results are read only either way). Every id from the address (class, term) is checked within the school, and a term after the current one, or from another session, is not found.
- **AC-11**: All of a class's figures come from one consistent read of the database, so a score saved halfway through cannot leave one figure old and another new. The same read can run inside a caller's own snapshot, so the report card (#12) and broadsheet (#16) show exactly the figures the Results section shows.
- **AC-12**: The computation is tested against a sample class worked out by hand, covering at least: a tie on the two place average (two 3rd, next 5th) where the exact averages differ, a 69.5 total graded B, half up rounding at a third decimal of 5, an elective with only some takers, a student with one missing part (unranked, others provisional), a typed 0 counted as a real score, a student who takes no subjects, and a withdrawn student left out of every figure.

## Decision

**Chosen option**: Option 1: a pure computation over one snapshot read, shown in a Results section on the class page.

One data function reads a class's open enrolments, subjects, electives, split, grade scale and scores for a term in a single read only snapshot, and hands them to a pure function (no database, no clock) that applies every rule above in whole number tenths, so a hand calculation and the code agree to the last digit.

**Implementation skills**: `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

## Feature design

**Data model sketch**: no new tables or columns, and no migration. Confirmed with the engineer. Results are read, never stored.

| Table | How this feature uses it |
|---|---|
| `enrolment` | The class's students for the term: open (not withdrawn) enrolments only (AC-4) |
| `class_subject` + `school_subject` | Subjects the class offers this session, compulsory or elective, in the school's subject order, with short names |
| `student_elective` | Which students take each elective that session (AC-1, AC-5) |
| `assessment_component` | The section's split for the session: parts, labels, maximums (AC-1, AC-9) |
| `grade_band` | The section's grade scale for the session: grade, lowest score, remark (AC-1) |
| `score` | One row per entered part; no row means not entered (AC-1, AC-2) |
| `student`, `class`, `section`, `academic_session`, `term` | Names, admission numbers, section and session names, term checks |

**How the numbers are worked out** (pure function `computeClassResults` in `src/lib/results.ts`):
- Scores arrive as text in the form `canonicalScore` gives (`"12"`, `"12.5"`) and are turned into whole number tenths (125) by parsing the text, never through a JavaScript number. Every sum is done in tenths, so no floating point error can creep in.
- Subject total in tenths = sum of the parts. Grade: the band with the highest lowest score that the total reaches (`totalTenths >= min * 10`). Band minimums are whole numbers and every scale has a band at 0 (spec 0006, AC-6), so every total has a grade whenever a scale exists.
- One helper divides with halves going up, using whole numbers only: `divHalfUp(a, b) = floor((2 * a + b) / (2 * b))`, for `a >= 0` and `b > 0`. It throws when `b <= 0`. Callers never reach that: a student with no subjects is incomplete (AC-2), and a subject or class with no one to average shows a dash (AC-5, AC-6). The helper has its own tests, including exact halves (67.455 becomes 67.46).
- Student average in hundredths: `divHalfUp(totalTenths * 10, n)` for `n` subjects taken. Ties are decided on this number.
- Subject class average in hundredths: `divHalfUp(sumOfTotalsTenths * 10, k)` for `k` complete takers. Class average in hundredths: `divHalfUp(sumOfAveragesHundredths, k)` for `k` ranked students.
- Position (competition ranking, the "1, 2, 3, 3, 5" kind): one plus the number of students with a strictly higher value.
- Ordinal: `st`, `nd`, `rd` for numbers ending in 1, 2, 3, except those ending in 11, 12, 13, which take `th` like everything else.
- Display: tenths shown with one decimal only when needed (`69.5`, `70`); averages always with two (`67.40`).

**Result shape** (what `getClassResults` returns):
- `term` (id, number, is current), `section` (name), `session` (name), `split` (parts with key, label, max; empty when not set), `hasGradeScale`
- `numberInClass`, `incompleteCount`, `final`, `classAverage` (hundredths or null)
- `subjects[]`: `classSubjectId`, `name`, `shortName`, `isElective`, `takers`, `completeTakers`, `classAverage` (hundredths or null), `highest`, `lowest` (tenths or null), `provisional`
- `students[]`: `studentId`, `surname`, `otherNames`, `studentNo`, `admissionNo`, `status` (`ranked` or `incomplete`), `total` (tenths or null), `average` (hundredths or null), `position` (null when incomplete), `missing[]` (`{ subjectName, partLabels[] }`), `subjects[]` (per subject taken: scores by part key as text, `total` in tenths, `grade`, `remark`, `position`, `provisional`, or the missing part labels)
- The wording "Mathematics: Exam · Basic Science: CA 2" is built by `missingLabel(missing)` in `src/lib/results.ts`, so the report card (#12) words it the same way.
- Students come back in display order: ranked by position, then incomplete; within each, surname, then other names (`localeCompare` with `"en"` and base sensitivity, so case and accents don't change the order), then student number.
- The term is chosen exactly as `listSubjectProgress` chooses it: no `termId` means the term marked current (`term.is_current`, never dates); a `termId` must be a term of the current session numbered up to the current one, else `NotFound`.

**State transitions**:
- A student's result in a term: incomplete (some part of some subject they take is not entered, or they take no subjects) ↔ ranked (everything entered). It moves as scores, split, electives and enrolment change. Withdrawing the enrolment removes the student from the results.
- A class's results in a term: provisional (anyone incomplete) ↔ final (everyone complete). Final can turn provisional again if, for example, a part is added to the split or a student joins.

**API surface** (pages call `requireSchoolContext`; data functions take a `SchoolContext`):

| Surface | Kind | Key inputs | Key outputs | Who | Key errors |
|---|---|---|---|---|---|
| `computeClassResults` (new, `src/lib/results.ts`) | pure function | split, grade bands, subjects with takers, students, scores as text | the result shape above | any caller | none (bad stored data is impossible by the database checks) |
| `formatTenths`, `formatHundredths`, `ordinal` (new, `src/lib/results.ts`) | pure functions | a number | display text | any caller | none |
| `loadClassResults` (new, `src/server/data/results.ts`) | data, runs on the given context's `db` without opening a transaction | `classId`, `termId` (optional, default current) | the result shape | form master of the class this session, our team | `NotFound` (class, or a term after the current one or in another session), `NoCurrentTerm` |
| `getClassResults` (new, same file) | data | same | `readSnapshot(ctx, (s) => loadClassResults(s, input))` | same | same |
| `/{school}/classes/[classId]` (changed) | page | `?term` | adds the Results section between Scores and Students, fetched in parallel with the existing reads | form master, our team | not found |
| `ResultsSection` (new, `src/app/[school]/classes/[classId]/results-section.tsx`) | server component | the result shape | summary, ranked list, incomplete group, empty states | | |
| `StudentResultPanel` (new, client, same folder) | client component | one student's entry plus `subjects` and `split` | the breakdown panel, opened from a student row, using the same sheet pattern as the score history panel | | |

The breakdown needs no extra request: the page already holds the whole class's results (at most about 50 students by 20 subjects), so the panel opens instantly, even on a slow network.

**Key invariants**:
- A part not entered is never 0 in any figure. Only complete subjects have totals, only complete students have averages and positions, and only complete takers feed a subject's position, class average, highest and lowest.
- Withdrawn enrolments never appear in, or count toward, any figure (spec 0003, AC-10).
- Only scores for parts in the section's current split, and for subjects the class offers this session, count. A student takes each offered subject at most once (an elective registration for a subject that is now compulsory changes nothing). Spec 0006 already refuses removing a part or a subject that has scores and lowering a maximum below a saved score; the loader still reads only offered subjects and current parts, so stray rows can never enter a figure.
- Ties are decided on exactly the number that is printed: the two place average for class positions, the one decimal total for subject positions.
- Grades compare the exact total with the band, never a rounded one, so the score sheet's live grade (`gradeFor` in `score-math.ts`) and the results always agree. A test holds the two together.
- Nothing computed is stored. The same inputs always give the same outputs, and `computeClassResults` reads no clock, no random value and no database.
- A class's figures always come from one snapshot (`getClassResults`), or from the caller's snapshot (`loadClassResults`), never from reads at different moments. Every read in the loader, including `assertClassAccess` and `getCurrentTerm`, goes through the `ctx.db` it was given, never the shared client. The pooled `neon-serverless` driver (spec 0001) runs real transactions, which this relies on.

**Security model**:
- Scores, names and positions are children's personal data under the Nigeria Data Protection Act (spec 0003). They stay in the Neon project in London. No new public route; parents see results only later, through the PIN checker (#21).
- `loadClassResults` calls `assertClassAccess` (spec 0004) for the class and the current session: a teacher only for their form classes this session, our team for any class. Ids from the address are always looked up within `ctx.schoolId`.
- Read only by nature: nothing here writes, so viewing as needs no extra guard.
- The class's results reach the browser only for people who may already open that class's score sheets; the breakdown panel holds nothing the sheets don't already show.

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: the hand calculated sample class (pure function test): every subject total, grade, subject position, subject class average, highest, lowest, student total, average, class position and the class average match the worked figures; verifies **AC-1** to **AC-6**, **AC-12**.
- Ties: averages 67.454 and 67.448 both print 67.45 and share 3rd, the next student is 5th; two equal subject totals share a subject position; verifies **AC-3**, **AC-5**.
- Rounding and grade boundary: a total of 69.5 is B against an A at 70; an average of exactly 67.455 prints 67.46; `gradeFor` from the score sheet gives the same grade as the results for every total from 0 to 100 in steps of 0.5; verifies **AC-1**, **AC-2**.
- Missing score: one student lacks Mathematics Exam: unranked, listed "Mathematics: Exam", still has positions in their complete subjects; the class says "Provisional: 1 student incomplete"; entering the Exam makes the class final; a typed 0 counts; verifies **AC-2**, **AC-5**, **AC-7**.
- Electives: an elective with two registered takers ranks only those two, and a student's average divides by their own number of subjects; verifies **AC-1**, **AC-5**.
- Withdrawn: a student withdrawn mid term is gone from the list, the number in class and every subject figure; verifies **AC-4**.
- Database (in `inRollback`): `getClassResults` on the demo school returns the same figures as the pure function on the same rows; changing a grade band changes grades on the next read; a part added to the split makes everyone incomplete; an elective registration left behind after the subject became compulsory counts the subject once; the loader makes no read outside the snapshot it was given; verifies **AC-1**, **AC-7**, **AC-11**.
- Auth/permission: a teacher gets not found for another class's results; a class id from another school is not found; a term from another session is not found; our team sees any class; verifies **AC-10**.
- Edge: no split shows the AC-9 message; no grade scale shows dash grades with totals and positions; a student with no subjects shows "takes no subjects yet"; verifies **AC-1**, **AC-2**, **AC-9**.
- Screen: the Results section renders the ranked list, the incomplete group and the breakdown panel (component test); visual check at 390px and 1280px with 20 subjects; verifies **AC-8**.

## Build plan

Skateboard: first the thinnest whole a form master can use for real (the rules, one read, the ranked list on the class page), then the breakdown, then the polish and the visual check. No migration, so the pure rules come first: everything else stands on them.

1. [ ] Pure rules in `src/lib/results.ts`: tenths and hundredths arithmetic, grade lookup, competition ranking, ordinals, provisional and final, display formatting, and `computeClassResults`; unit tests against the hand calculated sample class, plus the `gradeFor` agreement test; satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-12**.
2. [ ] Data: `loadClassResults` and `getClassResults` in `src/server/data/results.ts` (access check, term choice matching `listSubjectProgress`, open enrolments, takers, split, scale, scores), exported from `src/server/data/index.ts`; database tests in `inRollback`; satisfies **AC-4**, **AC-7**, **AC-10**, **AC-11**.
3. [ ] Thinnest usable whole: the Results section on the class page between Scores and Students, following `?term`: summary line, ranked list, incomplete group with missing parts, and the AC-9 empty states; satisfies **AC-8**, **AC-9**.
4. [ ] Student breakdown panel opened from a row: subjects with parts, total, grade, remark, subject position, class average, highest, lowest, then overall figures; satisfies **AC-8**.
5. [ ] Component tests (`*.test.ts`, `createElement`, jsdom) for the section and the panel; visual check at 390px and 1280px with 20 subjects and 5 parts; satisfies **AC-8**, and **AC-1** to **AC-12** overall.

## Consequences

**Positive**:
- Form masters stop doing results by hand, and every figure matches a calculator check to the last digit.
- A missing score can never quietly become 0; the teacher sees exactly which parts to chase.
- The report card, broadsheet and single student reprint (#12, #15, #16) read one computation, so they can never disagree, and a corrected score updates everyone's position at once.
- No migration, no stored figures, nothing to keep in step.

**Negative / tradeoffs**:
- Results are worked out on every class page view (a handful of queries plus arithmetic for about 50 students by 20 subjects). Fine at pilot size; measure before caching anything.
- One incomplete student keeps the whole class provisional; a student who never sits an exam keeps it provisional until the teacher types 0 or our team withdraws them. There is no "Absent" or "Exempt" mark yet.
- A subject a student genuinely doesn't take must be made an elective and left unregistered; a compulsory subject cannot be skipped for one student.
- Positions are within one arm only; a school that ranks across all arms of a level can't yet.
- Provisional positions are visible to the teacher and can change when late scores land; the report card must check `final` before printing.
- Two decimal averages can still tie; that is intended (shared position), but the card has no tie breaker.
- The split, grade scale and electives are set per session, not per term, so a change made in Second Term also changes First Term's results. Adding a part to the split mid session makes every student of every earlier term in that section incomplete. A reprint of an earlier term can therefore differ from the paper already handed out.

**Neutral**:
- The Results section makes the class page longer: Scores, then Results, then Students.
- Spec 0006's follow up on decimal totals (graded exactly, 69.5 is B) and spec 0009's follow up on missing parts and "Absent" (shown as incomplete, no mark for now) are both settled here.
- The score sheet's live total and grade already follow these rules; nothing there changes.

## Follow-up

- [ ] Report card PDF (#12): call `loadClassResults` inside the PDF's own `readSnapshot` with remarks and attendance, and decide whether a provisional class can print (recommended: refuse, naming the incomplete students). Also decide whether reprinting an earlier term warns that setup changed since (the split and scale are per session).
- [ ] Class broadsheet (#16) and single student reprint (#15): read `loadClassResults`, never their own maths.
- [ ] Third term cumulative (#18): reuse the tenths and half up helpers from `src/lib/results.ts` for the cumulative average.
- [ ] Add to the scope's Deferred list: "Absent" and "Exempt" marks per student per subject (from spec 0010), and ranking across all arms of a level (from spec 0010).
- [ ] `/sync` should tick spec 0003's results computation follow up, mark its exemption follow up as deferred, and tick the matching follow ups in specs 0006 and 0009.
