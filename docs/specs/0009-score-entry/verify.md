# Verify: score entry · spec 0009 · updated 2026-10-17
_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Use the demo school Grace High (`/gracehigh`), class JSS 2 Gold. Remove any scores a check saves afterwards (rows in `score` and `score_change` for that class subject).

## UI / manual
- [ ] Open `/gracehigh/classes/<JSS 2 Gold id>` → a Scores section sits above Students; every subject shows "N of 16 complete"; Mathematics shows 10 of 16; compulsory subjects come first, then electives under "Electives" → AC-1
- [ ] Open SS 1 Science's class page → Further Mathematics shows 3 takers (only registered students) → AC-1
- [ ] Fill every part for every student in one subject and save → the subject shows a tick and "Done" on the class page → AC-1, AC-5
- [ ] With an earlier term in the session, pick it in the Term picker → the address gets `?term=<id>`, progress is that term's, and the "First Term is closed" line shows; its sheets open read only with the same words; a later term's id in the address gives not found → AC-2
- [ ] Open a sheet → class, subject and term in the header, admission numbers under names, one field per part with label and maximum, live total and grade, "N of M complete"; the subject switcher keeps `?term` → AC-3
- [ ] At 390px wide, open `/design/score-entry?parts=5` and a real 3 part sheet → every part fits on the student's row, fields are at least 44px tall, no sideways scroll; with 5 parts the total wraps under the fields → AC-3
- [ ] Type `61` in Exam (out of 60) → red circle, "Exam is out of 60. You wrote 61.", Save does not send; Enter moves along the row then to the next student; up and down arrows move in a column; a part left empty shows "Exam not entered yet" and no total → AC-4
- [ ] Type scores, save → "Saved at <time>" in Lagos time, row stripes clear, progress updates; refresh → scores are still there → AC-5
- [ ] Type scores, go offline (DevTools) → Save is off and says you are offline; refresh while offline-typed → scores come back with the "kept on this phone" notice → AC-5
- [ ] Sign out in another tab, then Save → "You were signed out" with Sign in; after signing in again the typed scores come back → AC-5
- [ ] Make another term current (team Terms page) while a sheet is open, then Save → the sheet turns read only and lists the scores "never saved before First Term closed"; Discard clears them → AC-6, AC-9
- [ ] In two browsers, type different values for the same score and save both → the second shows the amber row with the newer saved value, "Keep mine" and "Use saved"; Save is off until chosen; Keep mine then saves → AC-7
- [ ] Withdraw a student (team Students page) while a sheet with their typed scores is open, then Save → "<SURNAME Other> is no longer in this subject, so their scores were not saved", their row goes, others stay typed; one more Save finishes → AC-8
- [ ] Paste `48.00`, blank, `abc`, `70`, `12.50` into Exam from row 1 of a 3 student list → 48, unchanged, abc circled, 70 circled, "2 lines were left over"; a tabbed paste says "Paste one column at a time." → AC-10
- [ ] Tap a student's name → the score history panel lists each part's changes newest first with old and new values, who (staff title and name, or "VoxLMS team (name)") and Lagos date and time; a student with no saves shows "No changes yet" → AC-11
- [ ] As our team, open `/admin/schools/<id>` → "Scores" under "This term"; it opens the Scores page with classes by section, "subjects done X of Y", unfinished subjects (three named, then "and N more"); each class opens its class page → AC-12
- [ ] Sign in as a teacher (Funke Adewale) → another class's page, sheet and the team Scores page are not found; as our team viewing as her, sheets are read only with "You are viewing as this person. Nothing can be saved." → AC-13
- [ ] Open a sheet whose section has no split for the session → "The score split for <section>, <session> is not set yet. The VoxLMS team sets it." with no fields; with no grade scale the grade shows a dash and totals still show → AC-14

## Commands
- [ ] `npx vitest run test/score-entry.test.ts` → closed term refusal, reachable terms, progress, team page, history names and access rules pass → AC-1, AC-2, AC-6, AC-11, AC-12, AC-13
- [ ] `npx vitest run test/score-sheet.test.ts` → paste, frozen retry, conflicts, restored draft, stale reload and read only sheets pass → AC-4, AC-5, AC-7, AC-8, AC-9, AC-10, AC-13
- [ ] `npm test` → whole suite passes (180 tests on 2026-10-17)
- [ ] `npx tsc --noEmit -p .` and `npx eslint` → no errors

## Acceptance-criteria coverage
- AC-1: class page steps, Done step, score-entry.test progress · AC-2: term picker step, score-entry.test terms · AC-3: sheet and 390px steps · AC-4: typing step, score-sheet.test · AC-5: save, offline, sign out steps, score-sheet.test retry · AC-6: term switch step, score-entry.test TermClosed (the race against a term switch is reasoned in code, not yet tested with two connections) · AC-7: two browser step, score-sheet.test conflicts · AC-8: withdraw step, score-sheet.test stale · AC-9: term switch step, score-sheet.test read only · AC-10: paste step, score-sheet.test paste · AC-11: history step, score-entry.test history · AC-12: team page step, score-entry.test · AC-13: teacher and viewing as step, both test files · AC-14: no split step
