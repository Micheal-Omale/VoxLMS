# Verify: Result PIN checker · spec 0014 · updated 2026-10-19
_Steps derived from spec 0014 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Covers build plan tasks 1 to 8 (complete)._

## UI / manual
- [ ] As our team, open the school's admin page → "Results online" shows under "This term" → AC-1
- [ ] Results online: the term picker lists the current term and earlier terms only, newest first; the state reads "Not released. Parents with slips see 'results are not out yet'." → AC-1
- [ ] Each class shows students, slips live, checked and without a slip, and "Print slips for N students" (off with "Every student has a slip." at N = 0) → AC-5
- [ ] Print a class → a PDF named like `TSA JSS 2 Gold First Term 2026-2027 PIN slips.pdf` downloads; the counts refresh; the "If the file didn't download…" line shows → AC-6
- [ ] Open the PDF: A4, 10 slips a page in 2 by 5, dashed cut lines, black only, each slip shows school, "Result PIN · term", name and class, the PIN in three groups of four, "Serial TSA 000123", "Check the result at {host}/result", the keep safe line → AC-8, AC-9
- [ ] "Release First Term results" with a class missing scores → the confirm lists "JSS 1 …: N students missing scores"; confirm → "Released to parents on {date} at {time} by {name}." → AC-2
- [ ] Visit `/result` signed out: the VoxLMS mark, "Check a school result", one "Result PIN" field with the hint, "Check result" → AC-12
- [ ] Type `1234` → "That PIN doesn't look right…", and the field keeps `1234` → AC-12 step 1
- [ ] Type a made up Luhn valid PIN (e.g. `0000 0000 0000`) → "We couldn't find that PIN…", field empty → AC-12 step 3
- [ ] Type a real PIN before release → "{School} has not released First Term, 2026/2027 results yet…" → AC-12 step 6
- [ ] After release, a real PIN of a ready class → redirect to `/result` showing the school, title, student, position, average, total, class average, Download, subject rows that open to their parts, grade key, both comments, the signer, "Check another PIN" → AC-13
- [ ] Refresh within 30 minutes → the result shows again, and the class page shows "checked 1 time" (not 2) → AC-13, AC-14
- [ ] DevTools: `vox_result` is HttpOnly, SameSite Lax, Path `/result`, its value has no PIN; the result response carries `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer` → AC-14, AC-16
- [ ] "Download report card" → `TSA {SURNAME} {Other names} First Term 2026-2027 report card.pdf`, one A4 page matching the school's printed card → AC-17
- [ ] "Withdraw release" → confirm → refresh the open result tab: the "not released" message shows; `/result/card` sends you back to `/result` → AC-3, AC-14, AC-17
- [ ] Type 11 wrong PINs from one network → the 11th says "Too many wrong PINs from this network. Try again in N minutes." → AC-15
- [ ] Class slip page (click a class on Results online): every student with serial, made on, checked counts and status; prints listed newest first with "Remake these slips" → AC-10
- [ ] "Replace slip" → confirm → a one slip PDF downloads; the old PIN now says "This slip has been replaced…"; replacing it again from a stale tab says "This slip was already replaced. The list has been refreshed." → AC-11
- [ ] "Remake these slips" → confirm names how many stop working (and how many were checked) → one PDF of the still live slips → AC-11
- [ ] As a teacher, open `/admin/schools/{id}/results` → not found → AC-18
- [ ] Look at the pages at 390 px and 1280 px → AC-13 (layout)
- [ ] Design preview: `/design/pin-slips` renders 45 slips inline in 5 A4 pages → AC-8, AC-22
- [ ] Design preview: `/design/result` renders basic and school logo result views and all AC-12 message states → AC-12, AC-13, AC-22

## Commands
- [x] `npx vitest run test/result-pin.test.ts` → 11 pass (PIN shape, check digit, groups, serials, IPv6 /64, cookie tamper and expiry, missing key, waits) → AC-7, AC-9, AC-14, AC-15, AC-20
- [x] `npx vitest run test/result-pins-data.test.ts` → 10 pass (print, render rollback, teacher refused, answers in order, throttle, replace and remake, slip page counts, never leaked, missing key, page count overflow rollback) → AC-5, AC-6, AC-7, AC-8, AC-11 to AC-16, AC-18, AC-19, AC-20
- [x] `npx vitest run test/release-lock.test.ts` → 5 pass (scores and remarks locked, student writers locked, removeStudent blocked with slips, session grading and offers locked, setCurrentTerm carries no students) → AC-4, AC-19
- [x] Query the dev branch: tables `result_pin`, `result_pin_run`, columns `school.pin_serial_counter`, `term.results_released_at`, `term.results_released_by` exist, with index `result_pin_one_live_per_enrolment` → AC-19
- [x] POST to `/admin/schools/{id}/results/slips` with a foreign `Origin` → 403; with no session → 401 → AC-18

## Acceptance-criteria coverage
- AC-1, AC-2, AC-3, AC-5, AC-6: UI steps 1 to 6, 15 · AC-4: `test/release-lock.test.ts` · AC-7, AC-9: commands 1, slip PDF step, commands 2 · AC-8: PDF step, commands 2, `/design/pin-slips` · AC-10, AC-11: slip page steps · AC-12 to AC-17: `/result` steps, commands 2 · AC-18: teacher step, route command, commands 2 · AC-19: schema query, commands 2, 3 · AC-20: commands 1, 2 · AC-22: `/design/pin-slips`, `/design/result` preview steps
- Deployed checks: AC-21 (timing and bundle size verification on live production deployment)
