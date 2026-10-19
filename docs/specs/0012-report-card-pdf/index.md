# 0012. Report card PDF

**Date**: 2026-10-18
**Status**: In Progress

## Summary

The form master downloads one PDF for the whole class, one A4 page per student, in register order, ready to print in black and white and photocopy. Each card shows the school's details, the student's figures from results (spec 0010), both comments from remarks (spec 0011), the grade key and the signer's signature (spec 0007). A class that still has a missing score can't print, and the page lists who to chase. The PDF is made on the server with `@react-pdf/renderer` (spec 0001). Nothing is stored and there is no migration.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a form master, I want every report card for my class in one file, so that I print once at a business centre and hand cards out down the register.
- As a form master, I want to be told exactly which scores are missing before I can print, so that no card ever goes home with a wrong position.
- As a parent, I want a clear card that still reads well after photocopying, with every figure matching the teacher's sheet, so that I can check it line by line.
- As our team, I want the card to carry the school's logo on the school logo plan and "Powered by VoxLMS" on the basic plan, so that the two prices mean something.
- As our team, I want one card layout that the single student reprint (#15) and the PIN result page (#21) reuse, so that every copy of a card looks the same.

**Acceptance criteria** (the contract):
- **AC-1**: The class page `/{school}/classes/[classId]` gains a Report cards section after Remarks. It follows the same term picker (`?term`). When the class can print, it says "Ready: 32 report cards, one A4 page each" and shows a "Download report cards" button with the caption "One PDF for the whole class. Print it in black and white." When some students have no teacher's comment, it adds "3 students have no form master's comment. Their cards leave lines to write on." (worded with the section's teacher title). Tapping the button downloads the file without leaving the page.
- **AC-2**: The class can't print, and the button is off with the reason written under it, when any of these hold. Results are not final (spec 0010, AC-7): "Report cards print when every score is in. Still missing:" followed by each incomplete student (surname first) and what is missing, worded by `missingLabel` ("OKON Emem: Mathematics: Exam · Basic Science: CA 2"); after 10 students, "and 4 more". No score split: the spec 0010, AC-9 message. No students, or no subjects: the plain empty state saying which. No signer (`getSignerForSection` returns null): "Report cards need the principal's name. The VoxLMS team adds it." The download address checks the same rules again on the server; when one fails (for example a student was added after the page loaded), it sends the person back to the class page at the Report cards section with that term, where the current reason shows. A refused download never sends a partial or provisional file.
- **AC-3**: The file is one PDF with exactly one A4 portrait page per open enrolment of the class that term (withdrawn students are left out, spec 0010, AC-4), in register order: surname, then other names, then student number, compared as the Results list compares them. It downloads as an attachment named `{school code} {class name} {term name} {session with / as -} report cards.pdf`, for example `GHS JSS 2 Gold First Term 2026-2027 report cards.pdf`.
- **AC-4**: Each card's header shows the school name, address, phone and email (each only when set), and the motto (only when set). On the school logo plan the school's logo sits at the left of the name; with no logo uploaded the header simply has no image. On the basic plan there is no school logo, and the footer carries the black VoxLMS logo with "Powered by VoxLMS". Under the header, the title reads "Report card · First Term, 2026/2027" (`termLabel`). The footer also carries "Printed 18 October 2026" (Lagos date) on every plan.
- **AC-5**: The student block shows: name, surname first in bold; admission number, or the VoxLMS student number when there is none (`displayStudentId`); class; gender (Male or Female); number of subjects taken; number in class; position in class ("5th of 32"); total score; average (two places); class average (two places); and "Next term begins: Monday 5 January 2027" only when the term has that date.
- **AC-6**: The subject table lists every subject the student takes, compulsory first and then electives, each in the school's subject order, with one row each. Columns: Subject; one column per part of the split, headed with its label and maximum ("CA 1 (20)"); Total, headed with the split's full maximum ("Total (100)"); Grade; Position; Class average; Highest; Lowest; Remark (the grade band's remark). Figures come from `loadClassResults` and are written with its helpers: totals with one decimal only when needed (`69.5`, `70`), averages with two (`67.40`), positions as ordinals (`3rd`). Without a grade scale, Grade and Remark show a dash. Under the table, one line gives the grade key from the section's scale for the session, high to low ("A 70 to 100 Excellent · B 60 to 69.9 Very good · …"); without a scale, the line is left out.
- **AC-7**: The comments block has two parts. First, headed "{teacher title}'s comment" ("Form master's comment", "Class teacher's comment"): the teacher's comment, then the form master's title and name (from the class's form master this session, left out when none is assigned) and a short line to sign by hand. An empty teacher's comment prints two blank ruled lines to write on instead. Second, headed "{signer title}'s comment" ("Principal's comment", "Head teacher's comment"): the head's comment, automatic or typed (spec 0011, AC-4), never empty because the class is final. Comments print as plain text, each up to 200 characters, and fit in two lines.
- **AC-8**: The signature block shows the signer's signature image above a line, and the signer's name and title under it, all from `getSignerForSection` (spec 0007). When the signer has no signature image, the line is left blank to sign by hand. The image is read from the database by id inside the card's own read and is never fetched over the network.
- **AC-9**: The card is made for black and white printing and photocopying: black text and black lines only (no colour, no grey text, no filled backgrounds), lines at least 0.5 point thick, body text at 9 point, and no text smaller than 7.5 point. The font is Atkinson Hyperlegible Next, Regular and Bold, embedded from static TTF files that ship with the app. Numbers sit right aligned in fixed width columns, so figures line up.
- **AC-10**: Nothing ever spills onto a second page. A worst case class (20 subjects, 5 split parts, the longest real subject names, 200 character comments, a long school name and address, a 45 student class) renders one page per student. After rendering, the server counts the file's pages, and when the count is not one per student it sends no file: the person sees "These report cards didn't fit on one page each. The VoxLMS team has been told." and the server logs the class, term and counts as an error.
- **AC-11**: Everything on every card in the file comes from one consistent read: one `readSnapshot` that calls `loadClassResults`, then `loadClassRemarks` with that output, then reads the school, class, form master, signer, grade scale, term and images. No figure or comment is worked out anywhere else, and nothing is stored. A score saved while the file is being made either shows on every card or on none.
- **AC-12**: Who may download. The class's form master this session, and our team for any class. Viewing as someone may download too (it only reads). Anyone else, a class or term from another school, a term after the current one or from another session gets not found, exactly as Results (spec 0010, AC-10). Without a session, the download address sends the person to sign in. Earlier terms of this session print with today's figures, without a warning.
- **AC-13**: A 45 student class downloads in under 20 seconds on the deployed app, and its file is under 2 MB. Each extra student adds less than 30 KB, because the logo, the signature and the font are each embedded once, not once per page. The response is private and never cached (`Cache-Control: private, no-store`).
- **AC-14**: A preview `/design/report-card` serves the worst case class from AC-10 on made up data, shown in the browser rather than downloaded, with `?plan=basic` and `?plan=school_logo` and a choice of 1 to 5 parts. It returns 404 in production unless `SHOW_DESIGN_PREVIEWS=1`, like the other previews.

## Decision

**Chosen option**: Option 1: a server route that renders a react-pdf document from a pure card model, built from one snapshot read.

One data function reads the class's results, remarks and everything else the card prints in one read only snapshot. A pure function turns that into a plain card model (every string already formatted), and a react-pdf document draws one page per card. The route checks readiness, renders, counts pages, and sends the file.

**Implementation skills**: `react-pdf` (`.claude/skills/react-pdf/`) · `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

## Feature design

**Data model sketch**: no new tables or columns, and no migration. The card reads only.

| Table | What the card reads |
|---|---|
| everything `loadClassResults` reads (spec 0010) | figures, subjects, split, students |
| `term_report`, `head_remark_band` through `loadClassRemarks` (spec 0011) | both comments |
| `school` | name, code, address, phone, email, motto, plan, `logo_asset_id` |
| `section` | `teacher_title`; the signer through `getSignerForSection` |
| `class_teacher` + `staff` | the form master's title and name for the session |
| `grade_band` | the section's scale for the session, for the key line |
| `term` | `next_term_begins_on` |
| `asset` | logo and signature bytes, by id, within `school_id` |

**Card layout** (A4 portrait, 595 by 842 points, 28 point margins). Budgets are for the AC-10 worst case; the order is fixed:

| Block | Contents | Budget |
|---|---|---|
| Header | logo (school logo plan) at 56 points square, name in Bold 15 point (wraps to 2 lines), address, phone and email, motto in 8 point | 95 pt |
| Title | "Report card · First Term, 2026/2027", Bold 11 point, a 1 point rule under it | 22 pt |
| Student block | two columns of label and value pairs (AC-5), 9 point | 70 pt |
| Subject table | header row 22 pt (two lines for "Class average"), 20 rows of 15 pt; subject name 1 line, 2 only when needed; 8.5 point figures | 330 pt |
| Grade key | one or two lines, 7.5 point | 20 pt |
| Comments | two parts, heading plus two lines each (AC-7) | 80 pt |
| Signature | image up to 36 points tall, line, name and title | 60 pt |
| Footer | printed date, and "Powered by VoxLMS" with the logo on basic | 18 pt |
| Free | room kept for behaviour and skills ratings (#14) | about 90 pt |

Subject table column widths (539 points in all): Subject 118, each part 30 (5 parts use 150; fewer parts give their width to Subject and Remark), Total 34, Grade 28, Position 34, Class average 38, Highest 30, Lowest 30, Remark the rest (77 with 5 parts). Remark text that doesn't fit one line wraps to two at 7.5 point. Table lines: a 1 point rule under the header row and 0.5 point rules between rows and columns.

**Card model** (pure, `src/lib/report-card.ts`; every string ready to print, so the PDF component does no formatting or maths):
- `ReportCardModel`: `school` (name, address, contact line, motto, `logo` bytes and format or null, `poweredBy` true on basic), `title`, `printedOn`, `student` (name parts, id, class, gender, subjects taken, number in class, position, total, average, class average, next term), `columns` (part labels with maximums, total maximum), `rows[]` (subject, parts as text, total, grade, position, class average, highest, lowest, remark), `gradeKey` (text or null), `teacherComment` (heading, text or null, form master name or null), `headComment` (heading, text), `signer` (name, title, `signature` bytes and format or null).
- `reportCardReadiness(input)`: `{ ready: true, count, missingTeacherComments }` or `{ ready: false, reason }`, where `reason` is one of `no_split`, `no_students`, `no_subjects`, `no_signer`, `incomplete` (with the students and `missingLabel` text). The Report cards section and the route both call it.
- `buildReportCards(input)`: the models in register order (AC-3).
- `reportCardFileName(schoolCode, className, termNumber, sessionName)`.
- `gradeKeyLine(bands)`: high to low; each band's top is the next band's lowest score less 0.1, the highest band ends at the split's full maximum.

**Rendering** (`src/components/report-card/`, server only):
- `fonts.ts` registers Atkinson Hyperlegible Next Regular and Bold from `src/assets/fonts/` with an absolute path built from `process.cwd()`, once per process, and calls `Font.registerHyphenationCallback((word) => [word])` (the react-pdf skill's rule for custom fonts).
- `ReportCardDocument({ cards })` renders a `Document` with one `Page size="A4"` per card. It takes a list, so #15 passes one card and #21 passes one card.
- The logo and signature are passed as `{ data: Buffer, format: "png" | "jpg" }`, the same Buffer object on every page. AC-13 checks they embed once. If react-pdf embeds them once per page, pass the same data URI string on every page instead, and keep the AC-13 test.
- The black VoxLMS logo is drawn with react-pdf `Svg` paths copied from `public/brand/voxlms-logo-black.svg` (react-pdf can't use an SVG file as an image), at least 6 mm tall (design.md).
- `@react-pdf/renderer` is already in Next's built in `serverExternalPackages` list, so it needs no config. The font files reach the serverless bundle through `outputFileTracingIncludes` for the route, in `next.config.ts`.

**State transitions**: none stored. A class's report cards are ready or not ready, worked out on every read from the readiness rules (AC-2). They move as results turn final or provisional (spec 0010).

**API surface** (pages call `requireSchoolContext`; data functions take a `SchoolContext`):

| Surface | Kind | Key inputs | Key outputs | Who | Key errors |
|---|---|---|---|---|---|
| `reportCardReadiness`, `buildReportCards`, `reportCardFileName`, `gradeKeyLine` (new, `src/lib/report-card.ts`) | pure | the loader's output, today's date | readiness, card models, file name, key line | any caller | none |
| `loadReportCards` (new, `src/server/data/report-cards.ts`) | data, runs on the given `ctx.db`, opens no transaction | `classId`, `termId` (optional, default current) | `{ results, remarks, school, cls, teacherTitle, formMaster, signer, gradeBands, nextTermBeginsOn, logo, signature }` | form master of the class this session, our team | `NotFound`, `NoCurrentTerm` |
| `getReportCards` (new, same file) | data | same | `readSnapshot(ctx, (s) => loadReportCards(s, input))` | same | same |
| `GET /{school}/classes/[classId]/report-cards?term=` (new, `src/app/[school]/classes/[classId]/report-cards/route.ts`) | route handler, Node runtime, `maxDuration = 60` | `term` (optional) | `200 application/pdf`, `Content-Disposition: attachment`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` | as above | `404` not found or bad id; `303` to `/login` without a session; `303` to the class page `?term=…#report-cards` when not ready; `500` page with the AC-10 message when the page count is wrong |
| `ReportCardsSection` (new, `src/app/[school]/classes/[classId]/report-cards-section.tsx`) | server component | readiness, school slug, class id, term id | AC-1 and AC-2 states, the button as a plain link to the route with `download` | | |
| `/{school}/classes/[classId]` (changed) | page | `?term` | adds the Report cards section after Remarks; readiness from the results and remarks it already reads, plus the signer (one more read added to `getClassRemarks`, or a small `getReportCardReadiness`) | form master, our team | not found |
| `GET /design/report-card?plan=&parts=` (new, `src/app/design/report-card/route.ts`) | route handler | plan, parts (1 to 5) | inline PDF of the worst case made up class | anyone, development only | 404 in production unless `SHOW_DESIGN_PREVIEWS=1` |

Route steps: check the class and term ids are UUIDs (else 404) → `getViewer()`; none means a `303` to `/login` → `schoolContextFor(viewer, slug)`; null means 404 → `getReportCards` (`NotFound` and `NoCurrentTerm` mean 404) → `reportCardReadiness`; not ready means a `303` to the class page → `buildReportCards` with today's Lagos date → `renderToBuffer(ReportCardDocument)` outside the transaction → count pages (`/Type /Page` objects, not `/Pages`) and compare with the cards (AC-10) → send. One log line per download: school, class, term, cards, bytes, milliseconds. The route uses `schoolContextFor` instead of `requireSchoolContext` so that it can answer with a response instead of a page's not found.

**Key invariants**:
- A card never shows a figure, grade, position or comment that `loadClassResults` and `loadClassRemarks` didn't produce in the same snapshot as every other card in the file.
- No provisional, partial or spilled file is ever sent. Ready means final results, a split, students, subjects and a signer.
- One page per open enrolment, in register order; withdrawn students never appear.
- Signatures leave the server only inside a card, never through a route of their own (spec 0005).
- Nothing is stored: every download is rendered fresh from the database.
- The render runs after the read only transaction has closed, so a slow render never holds a database connection.

**Security model**:
- The file holds children's personal data (names, scores, comments) under the Nigeria Data Protection Act (spec 0003). It is made per request, sent with `private, no-store`, and never stored or cached by the app.
- Access is exactly Results' rule: `loadClassResults` calls `assertClassAccess`, so a teacher reaches only their form classes this session and our team any class. Every id from the address is looked up within `ctx.schoolId`.
- `loadReportCards` reads the signer through `getSignerForSection` with a system actor, as `loadClassRemarks` does, and reads signature bytes only by the id that signer returns, within the school. No new route serves images.
- Viewing as can download: nothing is written.
- Comments and names are drawn as react-pdf `Text`, never interpreted as markup.
- `src/proxy.ts` needs no change: the download address has no file extension, so the sign in redirect covers it, and the route checks the session itself anyway.

**Configuration required**: none new. `next.config.ts` gains `outputFileTracingIncludes` for the route's font files.

**Critical test scenarios**:
- Happy path (database, in `inRollback`): the demo class with every score in gives one card per open enrolment in register order, and each card's total, average, position, subject figures and comments equal `getClassRemarks` for the same class and term; verifies **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-11**.
- Readiness (pure): one missing Exam gives `incomplete` naming the student and "Mathematics: Exam"; no split, no students, no subjects and no signer each give their reason; 12 incomplete students list 10 and "and 2 more"; verifies **AC-2**.
- Model (pure): the file name for "2026/2027" uses `2026-2027`; a student with no admission number shows `GHS-0123`; an empty teacher's comment gives null (blank lines); "Next term begins" appears only when set; the grade key reads "A 70 to 100 … F 0 to 39.9"; no grade scale gives dashes and no key; basic plan has no logo and `poweredBy`; verifies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**.
- Fit (render): the worst case class renders 45 pages for 45 cards with 1, 3 and 5 parts on both plans; a card made to overflow on purpose makes the page count check fail, so the route sends no file; verifies **AC-10**.
- Size (render): the 45 student file is under 2 MB, and 46 students add less than 30 KB over 45; verifies **AC-13**.
- Auth/permission (route and data): a teacher gets 404 for another class and for a class id from another school; a term from another session is 404; no session redirects to sign in; our team gets the file for any class; viewing as gets the file; verifies **AC-12**.
- Race: a student added after the page loaded makes the class provisional, and the route redirects to the class page instead of sending a file; verifies **AC-2**.
- Section (component test, `createElement`, jsdom): ready with a missing comments warning, each not ready reason, and the button linking to the route with the term; verifies **AC-1**, **AC-2**.
- Visual and print (by hand, `verify.md` at build): render the preview and the demo class to PNG and check every block at 100% zoom; print one page in black and white, photocopy it, and confirm every figure, the grade key and both comments still read; verifies **AC-4** to **AC-9**, **AC-14**.

## Build plan

Skateboard: the thinnest whole first, a real PDF of the demo class a form master can download and print. Then the guards that make it safe on results day (fit, size, races), then the preview and the checks. There is no migration, so the font and the pure model come first.

1. [x] Set up the PDF: install `@react-pdf/renderer`; add the Atkinson Hyperlegible Next Regular and Bold static TTF files and their OFL licence in `src/assets/fonts/`; `fonts.ts` with the hyphenation callback; `outputFileTracingIncludes` for the route; a render smoke test in Vitest (node environment) that makes a one page PDF with the font; satisfies **AC-9**.
2. [x] Pure model in `src/lib/report-card.ts`: `reportCardReadiness`, `buildReportCards`, `reportCardFileName`, `gradeKeyLine`, with unit tests for every readiness reason, register order, ids, blank comments, the key line and the plan rules; satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**.
3. [x] Data: `loadReportCards` and `getReportCards` in `src/server/data/report-cards.ts` (results, remarks, school, form master, signer, grade bands, next term, logo and signature bytes in one snapshot), exported from `src/server/data/index.ts`; database tests in `inRollback` for the figures matching `getClassRemarks` and for access; satisfies **AC-11**, **AC-12**.
4. [x] Thinnest usable whole: `ReportCardDocument` drawing every block of the layout table; the download route with its checks, readiness redirect and headers; the Report cards section on the class page with its ready and not ready states; satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-12**.
5. [x] Results day guards: the page count check and its error page and log; the worst case fit tests with 1, 3 and 5 parts on both plans; the size test with images embedded once; the race test; satisfies **AC-10**, **AC-13**, **AC-2**.
6. [x] Preview and checks: `/design/report-card`; component tests for the section; render the preview and the demo class to PNG and review every block; write `verify.md` with the black and white print and photocopy check; satisfies **AC-14**, **AC-1**, and **AC-1** to **AC-14** overall.

## Consequences

**Positive**:
- Release 1's promise is met: a form master enters scores and comments, then prints the whole class's cards from a phone.
- A card can't disagree with the Results section, the Remarks sheet, or another card in the same file.
- A provisional or spilled card can't reach a parent.
- #15 and #21 reuse the same document, model and loader; only the number of cards changes.

**Negative / tradeoffs**:
- One missing score blocks the whole class's cards, including students who are complete. The form master must chase the score, have our team withdraw the student, or type 0 (no "Absent" mark yet, spec 0010).
- The layout is fixed for every school. A school that wants its own layout, a photo, an age, attendance or a stamp can't have it yet.
- Rendering runs on every download (a few seconds for a class). Fine at pilot size; measure before caching.
- react-pdf has its own layout rules, not full CSS, so the card's design can't reuse the app's Tailwind components; a change to design.md colours or type doesn't flow through by itself.
- The fixed layout and its budgets must be checked again when #14 adds ratings and when attendance comes back.
- An earlier term's reprint uses today's split, scale and comment bands, so it can differ from the paper already handed out (spec 0010).

**Neutral**:
- The class page grows again: Scores, Results, Remarks, Report cards, then Students.
- The pilot school is set to the school logo plan (spec 0005: its cards carry its logo and signatures).
- `term_report.days_present`, `term.days_opened` and the school's `show_attendance` switch stay unused; the card has no attendance box.

## Follow-up

- [ ] Behaviour and skills ratings (#14): add the ratings block in the free space at the bottom of the card (about 90 points), and rerun the AC-10 fit tests.
- [ ] Single student reprint (#15): call `getReportCards` and pass one card to `ReportCardDocument`; decide whether one student can print while the class is provisional.
- [ ] Result PIN checker (#21): serve one student's card through the same document and model.
- [ ] Attendance (deferred): when built, add the attendance box for schools with `show_attendance` on, and rerun the fit tests.
- [x] Add to the scope's Deferred list: "Student photo on the report card" and "School stamp on the report card" (from spec 0012).
- [ ] Spec 0001 follow up "Choose a report card font": settled here (Atkinson Hyperlegible Next, SIL Open Font License). `/sync` should tick it, and tick the report card follow ups in specs 0005, 0006, 0007, 0010 and 0011.
- [ ] Before building, confirm the static TTF files: the Atkinson Hyperlegible Next project ships static Regular and Bold TTFs alongside the variable font. If only a variable file is available, use the original Atkinson Hyperlegible static TTFs (same designers, same licence) and note it in `docs/design.md`.
- [ ] `/sync`: add conventions that every report card (class file, reprint, PIN page) is drawn only by `ReportCardDocument` from `buildReportCards`, with data only from `loadReportCards` inside one snapshot; and that the `react-pdf` skill's rules apply in `src/components/report-card/` (a nested `AGENTS.md` there, since root `AGENTS.md` lists no installed skills yet).
