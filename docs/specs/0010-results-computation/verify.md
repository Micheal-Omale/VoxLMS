# Verify: results computation · spec 0010 · updated 2026-10-18
_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Use the demo school Grace High (`/gracehigh`), class JSS 2 Gold, signed in as our team. On the dev branch every JSS 2 Gold score is filled, so the class starts Final. Undo any change a check makes (scores through the sheet, setup through the team pages).

## UI / manual
- [ ] Open `/gracehigh/classes/<JSS 2 Gold id>` → a Results section sits between Scores and Students, with "16 in class", the class average and "Final" → AC-8
- [ ] Pick a subject, check one student's Total by hand (CA 1 + CA 2 + Exam) and their grade against the Junior Secondary scale; a 69.5 total shows B → AC-1
- [ ] Add up one student's subject totals and divide by their number of subjects; the average shown matches to two places, halves rounded up → AC-2
- [ ] Clear one student's Exam in one subject and save → the banner reads "Provisional: 1 student incomplete", that student moves to "Incomplete" with "Missing <Subject>: Exam", everyone else is still ranked; put the Exam back → "Final" returns → AC-2, AC-7
- [ ] Type 0 for a part and save → the student stays ranked and the 0 counts in their total → AC-2
- [ ] Make two students' averages equal to two places → both show the same position and the next student skips one (two 3rd, next 5th); ordinals read 1st, 2nd, 3rd, 11th, 12th, 13th, 21st → AC-3
- [ ] Withdraw a student (team Students page) → they leave the list, "in class" drops by one, and every subject's figures exclude them → AC-4
- [ ] Open SS 1 Science's Results and a student's breakdown → Further Mathematics appears only for its three registered students, and its position, class average, highest and lowest count only them → AC-1, AC-5
- [ ] Tap a ranked student → the breakdown lists compulsory subjects then electives, each with parts, Total, Grade and remark, Position, Class average, Highest, Lowest, then Overall with "Nth of 16"; a subject whose takers are not all complete shows "Provisional" → AC-5, AC-6, AC-8
- [ ] At 390px wide, open the class page and `/design/results?subjects=20&parts=5` → no sideways scroll, every row at least 44px tall, each subject in the breakdown is a stacked block → AC-8
- [ ] Pick First Term in the Scores term picker after making Second Term current → Results follow `?term` and show First Term's figures → AC-8
- [ ] `/design/results?state=nosplit` (and a section with no split) → "Results need the score split for Junior Secondary, 2026/2027. The VoxLMS team sets it." with no figures → AC-9
- [ ] Sign in as Funke Adewale → JSS 2 Gold shows Results; SS 1 Science's class page is not found; as our team viewing as her, Results still show → AC-10

## Commands
- [ ] `npx vitest run test/results.test.ts` → the hand calculated sample class, ties, half up rounding, 69.5 is B, `gradeFor` agreement, missing parts, electives, no subjects, no split and no scale all pass → AC-1 to AC-7, AC-12
- [ ] `npx vitest run test/results-data.test.ts` → demo class figures, grade band and split changes on the next read, withdrawn student, elective made compulsory, term choice, access and school scoping pass → AC-1, AC-4, AC-7, AC-9, AC-10, AC-11
- [ ] `npx vitest run test/results-section.test.ts` → summary, ranked order with ties, incomplete group, empty states and the breakdown panel pass → AC-8, AC-9
- [ ] `npm test` → whole suite passes (313 tests on 2026-10-18; the dev branch can drop connections, so rerun a file that fails with "did not answer" or "Connection terminated")
- [ ] `npx tsc --noEmit -p .` and `npx eslint` → no errors

## Acceptance-criteria coverage
- AC-1 · manual steps 2 and 8 · `results.test.ts`, `results-data.test.ts`
- AC-2 · manual steps 3, 4 and 5 · `results.test.ts`
- AC-3 · manual step 6 · `results.test.ts`
- AC-4 · manual step 7 · `results-data.test.ts` (withdrawn student)
- AC-5 · manual steps 8 and 9 · `results.test.ts`
- AC-6 · manual step 9 · `results.test.ts`
- AC-7 · manual step 4 · `results.test.ts`, `results-data.test.ts`
- AC-8 · manual steps 1, 9, 10 and 11 · `results-section.test.ts`
- AC-9 · manual step 12 · `results-section.test.ts`, `results-data.test.ts`
- AC-10 · manual step 13 · `results-data.test.ts`
- AC-11 · `results-data.test.ts` (scores saved in the same snapshot are read through the given context)
- AC-12 · `results.test.ts` (sample class); the withdrawn student is in `results-data.test.ts`
