# Verify: report card PDF · spec 0012 · updated 2026-10-18
_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] As the form master of JSS 2 Gold (Mrs Funke Adewale), open `/gracehigh/classes/<JSS 2 Gold id>` → a Report cards section sits after Remarks with "Ready: 16 report cards, one A4 page each", "One PDF for the whole class. Print it in black and white." and, while some comments are empty, "N students have no form master's comment. Their cards leave lines to write on." → AC-1
- [ ] Tap Download report cards at 390px and at 1280px → the file downloads and the page stays put, named `GHS JSS 2 Gold First Term 2026-2027 report cards.pdf` → AC-1, AC-3
- [ ] Open the file → exactly one A4 portrait page per open enrolment, in surname order; a withdrawn student has no page → AC-3
- [ ] On the school logo plan with a logo uploaded → the logo sits left of the school name; remove the logo → the header has no image; switch the school to basic → no school logo, the footer shows "Powered by" with the black VoxLMS logo; every plan shows "Printed <today in Lagos>" → AC-4
- [ ] Check one card against the Results breakdown and the Remarks sheet → name surname first in bold, admission number (or GHS-0123 when none), class, gender, subjects taken, number in class, "5th of 16", total, average and class average to two places, "Next term begins" only when the term has the date → AC-5
- [ ] Subject table → compulsory then electives in the school's order, part heads like "CA 1 (20)", "Total (100)", totals like 69.5 and 70, averages like 67.40, ordinals, highest, lowest, the grade band's remark; the grade key under the table reads high to low → AC-6
- [ ] A student with no teacher's comment → two blank ruled lines under "Form master's comment"; every card shows the principal's (or head teacher's) comment and the form master's name with a line to sign → AC-7
- [ ] Upload the principal's signature (team School details) → it prints above the line with the name and title under it; remove it → the line is left blank to sign → AC-8
- [ ] Clear one Exam score → the section turns the button off and lists "OKON Emem: Mathematics: Exam"; with more than 10 incomplete students it ends "and N more" → AC-2
- [ ] Load the class page ready, then add a student to the class (team) and tap Download → you land back on the class page at Report cards with the missing list; no file arrives → AC-2
- [ ] Clear the principal's name (team) → "Report cards need the principal's name. The VoxLMS team adds it." → AC-2
- [ ] As Mr Ibrahim Musa, open the JSS 2 Gold download address → not found; signed out → sign in page; `?term=` a term after the current one or from another session → not found; as our team, and viewing as the form master → the file downloads → AC-12
- [ ] Print one page from the demo class in black and white, photocopy it, and read the copy → every figure, the grade key and both comments still read clearly; no grey text or filled boxes → AC-9
- [ ] Open `/design/report-card?plan=basic&parts=5` and `/design/report-card?plan=school_logo&parts=1` → shown in the browser, 45 pages each (header `X-Page-Count`), nothing on a second page per card → AC-14, AC-10
- [ ] On the deployed app, download a 45 student class → arrives in under 20 seconds and is under 2 MB → AC-13

## Commands
- [ ] `npx vitest run test/report-card.test.ts test/report-cards-section.test.ts` → all pass (readiness reasons, register order, ids, blank comments, grade key, plan rules, section states) → AC-1 to AC-7
- [ ] `npx vitest run test/report-card-render.test.ts` → 45 pages for 45 cards with 1, 3 and 5 parts on both plans, an overflowing card fails the page check, 45 cards under 2 MB, one more card under 30 KB, images and fonts embedded once → AC-9, AC-10, AC-13
- [ ] `npx vitest run test/report-cards-data.test.ts` → every card matches `getClassRemarks`, access rules, images by id, the route's headers, redirects and the late student race → AC-2, AC-3, AC-11, AC-12, AC-13
- [ ] `npx next build`, then open `.next/server/app/[school]/classes/[classId]/report-cards/route.js.nft.json` → it lists both `AtkinsonHyperlegibleNext-*.ttf` files → AC-9
- [ ] Set `REPORT_CARD_OUT=<folder>` and run the render and data tests → the worst case and demo class PDFs are written there for a page by page look at 100% zoom → AC-4 to AC-9

## Acceptance-criteria coverage
- AC-1 … section steps 1, 2 and the section component tests · AC-2 … missing list, late student, no signer steps and the readiness tests · AC-3 … download and page order steps · AC-4 … plan step · AC-5 … student block step · AC-6 … subject table step · AC-7 … comments step · AC-8 … signature step · AC-9 … print and photocopy step and the build trace check · AC-10 … preview step and the render tests · AC-11 … the data test matching `getClassRemarks` · AC-12 … access step and route tests · AC-13 … deployed timing step and size tests · AC-14 … preview step
