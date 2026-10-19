# Verify: remarks · spec 0011 · updated 2026-10-18
_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] As the form master of JSS 2 Gold, open `/gracehigh/classes/<JSS 2 Gold id>` → a Remarks section sits after Results with "N of M have a teacher's comment" and, if any result is incomplete, "K principal's comments wait for all scores" → AC-1
- [ ] On the class page pick First Term while Second Term is current → the Remarks button says "View remarks" and opens `/remarks?term=<id>` → AC-1, AC-7
- [ ] Open the Remarks sheet at 390px → each student is a stacked block (name, admission number, average and position or "Incomplete", then the two comments), no sideways scroll, every field and button at least 44px tall → AC-2
- [ ] Give a class's section its own head (Sections page) → the head's column reads "Head teacher's comment" (or that head's title) → AC-2
- [ ] Tap Quick picks, then two picks on an empty box → the first fills it, the second is added after one space; picks on typed text never replace it → AC-3
- [ ] Type "  A good\n\nterm's   work. " and leave the box → it becomes "A good term's work." → AC-3
- [ ] Type 185 characters → "185 of 200"; type 201 → the box is circled in red with "Comments fit in 200 characters", Save is refused until fixed, nothing is cut off → AC-3
- [ ] A complete student shows the band comment with an "Automatic" label; an incomplete one shows "Waits for all scores"; save the last missing score → the automatic comment appears on the next read → AC-4
- [ ] Type over on an automatic comment → box seeded with that text, label "Typed"; save; reload → still typed. Use automatic, save → back to automatic → AC-4
- [ ] Type a comment, go offline → Save turns off with the offline message; reload the page → the comment comes back with "Unsaved comments for 1 student were kept on this phone" → AC-5
- [ ] Save → "Saved at 3:14 pm" in Lagos time and the counts update → AC-5
- [ ] In two browsers change the same student's teacher's comment; save the first, then the second → second shows the saved text in amber beside yours with Keep mine / Use saved; Save stays off until decided → AC-6
- [ ] Withdraw a student (team Students page) after the sheet loaded, then save a comment for them → "SURNAME Name is no longer in this class, so their comments were not saved", their row goes, other typed comments stay → AC-8
- [ ] After a save, each saved row shows "Last changed by <title name>, <time>"; a team save shows "VoxLMS team (name)" → AC-9
- [ ] As our team, `/admin/schools/<id>/grading` → "Principal's comment bands" below the grade scales; remove the 0 band, add an 11th, set 101, repeat a lowest average, empty a wording → each names the band and saves nothing; a valid change shows on the next sheet read for automatic comments only → AC-10
- [ ] As our team, view as the form master → the sheet is read only with "You are viewing as this person. Nothing can be saved." → AC-12
- [ ] As a teacher, open another class's `/remarks` address → not found → AC-12

## Commands
- [ ] `npx drizzle-kit migrate` then query `select count(*) from head_remark_band group by school_id` → 5 per school; `term_report_teacher_remark_length` and `term_report_head_remark_length` constraints exist → AC-3, AC-10
- [ ] `npx vitest run test/remarks.test.ts` → band edges (70.00, 69.99, 0), tidy, picks and band rules pass → AC-3, AC-4, AC-10
- [ ] `npx vitest run test/remarks-data.test.ts` → save, conflict, closed term, stale student, snapshot, access and band rules pass → AC-5 to AC-8, AC-10 to AC-12
- [ ] `npx vitest run test/remarks-sheet.test.ts test/remarks-section.test.ts` → sheet and section behaviour passes → AC-1 to AC-9, AC-12
- [ ] `npm test` → whole suite green (389 tests on 2026-10-18) → all

## Acceptance-criteria coverage
- AC-1 … UI steps 1, 2; remarks-section tests
- AC-2 … UI steps 3, 4
- AC-3 … UI steps 5 to 7; migration check; remarks tests
- AC-4 … UI steps 8, 9; remarks tests
- AC-5 … UI steps 10, 11; sheet tests
- AC-6 … UI step 12; data and sheet tests
- AC-7 … UI step 2; data and sheet tests
- AC-8 … UI step 13; data and sheet tests
- AC-9 … UI step 14; sheet tests
- AC-10 … UI step 15; migration check; data tests
- AC-11 … data tests (snapshot)
- AC-12 … UI steps 16, 17; data tests
