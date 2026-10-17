# Verify: classes, subjects & grading rules · spec 0006 · updated 2026-10-17
_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run on the demo school (Grace High) as our team, at `/admin/schools/<id>`. Undo any demo data you create.

## UI / manual
- [ ] Subjects page: tick French and Igbo on "Add from the standard list" → both join the end of the order with short names FRE and IGB → AC-1, AC-2
- [ ] Add a subject of the school's own, "Hausa Studies" → the short name is suggested as you type; saving "Mathematics" again shows "Another subject is already called Mathematics" under the name; short name "MTH" shows it belongs to Mathematics → AC-1
- [ ] Rename English Studies from its menu → the new name shows on the school home and score sheets; the "Standard list: English Language" link stays → AC-1
- [ ] Move English Studies up to first → the school home lists it first for JSS 2 Gold and SS 1 Science → AC-2
- [ ] Classes page: tick JSS 1, type arms "Gold, Blue" → the preview says it makes JSS 1 Gold, JSS 1 Blue; create → both appear under Junior Secondary, ordered before JSS 2 → AC-3
- [ ] Tick JSS 2 with arm "Gold" → the preview says JSS 2 Gold already exists and will be skipped → AC-3
- [ ] Open JSS 1, tick four subjects, save for all 2 arms → both arms get them; "Gold only" then add one subject → the level shows a dash on that subject and "Arms that differ: JSS 1 Gold also ..." → AC-4
- [ ] Then untick a different subject for the whole level and save → Gold keeps its own extra subject, because a level save only touches the subjects changed → AC-4
- [ ] A class with 20 subjects: try a 21st → "would have 21 subjects. A class offers at most 20" and nothing saves → AC-4
- [ ] Score split and grades: Junior Secondary, CA 1 to 15 and Exam to 65 → "Nothing was saved. 5 saved scores for CA 1 are above 15 ..." → AC-7
- [ ] Junior Secondary: a split adding to 95 → Save stays off and "The parts add up to 95" shows → AC-5
- [ ] Primary: choose "CA 30, Exam 70" → save → split saved; existing parts keep their keys (score sheets keep working) → AC-5
- [ ] Junior Secondary scale: change A from 70 to 75 and save → a total of 72 now shows B on the score sheet with no score re-entered → AC-6
- [ ] JSS 2 Gold: try to take Mathematics off, or make it an elective → refused with the count of saved scores → AC-7
- [ ] Remove a subject nothing uses → deleted; remove Mathematics → refused, "offered by 2 classes in 2026/2027" → AC-8
- [ ] Remove JSS 2 Gold → the confirm says it has 16 students this term and offers no remove button → AC-8
- [ ] Add session 2027/2028 on Session and terms, open Classes with that session → switcher shows both sessions, "2027/2028 has nothing set up yet" banner; Copy → subjects, splits and scales copied; banner gone; Copy again is not offered → AC-9
- [ ] School overview checklist shows Subjects, Classes, Score split and grades with short statuses and links; Primary 4 (no subjects) keeps Classes not done → AC-10
- [ ] Sign in as a teacher (or view as one) and open `/admin/schools/<id>/subjects`, `/classes`, `/grading` → not found → AC-11
- [ ] Check every page at 390px and 1280px: no sideways scroll, controls 44px, errors in plain words → design bar

## Commands
- [ ] `npx vitest run test/classes-subjects-grading.test.ts` → 19 tests pass (rules, the score save lock, copy, access) → AC-1 to AC-11
- [ ] `npx vitest run` → whole suite passes (subject order changes don't break earlier specs) → AC-2
- [ ] `npx drizzle-kit migrate` then query `information_schema.columns` for `school_subject.sort_order` and `is_active`, and `pg_constraint` for `subject_school_short_name_key` → all present → AC-1, AC-2, AC-8
- [ ] `npm run typecheck` and `npm run lint` → clean

## Acceptance-criteria coverage
- AC-1 standard list, own subjects, short names: UI steps 1 to 3, test "AC-1" · AC-2 one order: UI step 4, test "AC-2" · AC-3 classes from levels × arms: UI steps 5, 6, test "AC-3" · AC-4 level and arm offers, 20 cap: UI steps 7 to 9, test "AC-4" · AC-5 splits: UI steps 11, 12, test "AC-5" · AC-6 scales change grades at once: UI step 13, test "AC-6" · AC-7 saved scores protected and the lock: UI steps 10, 14, tests "AC-7" (including the wait test) · AC-8 delete or switch off: UI steps 15, 16, test "AC-8" · AC-9 session switcher and copy: UI step 17, test "AC-9" · AC-10 checklist: UI step 18, test "AC-10" · AC-11 team only, school boundary: UI step 19, test "AC-11"
