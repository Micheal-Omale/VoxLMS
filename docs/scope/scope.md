# Scope: VoxLMS (school results system)

A results and report card system for Nigerian primary and secondary schools. Teachers enter scores for their class, the system computes results, and the school prints standard Nigerian report cards. Our team onboards each school. Built for many schools from day one, starting with one pilot school (under 200 students).

**Build approach:** Skateboard (ship the smallest report card tool a real school would use, then grow it release by release).
**Weight profile:** data model, logins and access, results computation, and parent result links are full (children's records, correctness parents will check); everything else lean or medium.
**Deadline:** the pilot school uses it for real for First Term 2026/2027 results (exams end around early December 2026). Releases 1 and 2 must be live by then.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | in-progress |
| 2 | Coding standards & tooling | Foundation | planned |
| 3 | Data model | Foundation | in-progress |
| 4 | Design system & UI foundation | Foundation | in-progress |
| 5 | Logins & access | Release 1 | in-progress |
| 6 | School & term setup | Release 1 | in-progress |
| 7 | Classes, subjects & grading rules | Release 1 | in-progress |
| 8 | Enrol teachers & students | Release 1 | in-progress |
| 9 | Score entry | Release 1 | done |
| 10 | Results computation | Release 1 | done |
| 11 | Remarks | Release 1 | in-progress |
| 22 | School principal and section heads | Release 1 | done |
| 12 | Report card PDF | Release 1 | in-progress |
| 13 | Excel import | Release 2 | in-progress |
| 14 | Behaviour & skills ratings | Release 2 | planned |
| 15 | Single student reprint | Release 2 | planned |
| 16 | Class broadsheet | Release 2 | planned |
| 17 | Launch readiness | Release 2 | planned |
| 21 | Result PIN checker | Release 3 | in-progress |
| 18 | Third term cumulative & promotion | Release 4 | planned |
| 19 | Send results on WhatsApp | Release 5 | planned |
| 20 | Onboard more schools | Release 6 | planned |

## Foundations

### 1. Stack & architecture · in-progress
Record the stack already agreed in planning and scaffold a runnable project that every release builds on.
**Done when:** the stack is recorded in a spec and the empty project starts locally and builds clean.
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [ ] Smoke check it runs: `/test`
Spec [0001](../specs/0001-stack-architecture/index.md) · code in `./` (database client in `src/db/`)

### 2. Coding standards & tooling
Capture conventions from the real scaffolded project, then install lint, format, and commit checks.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format, and commit checks run clean.
- [ ] Capture conventions + tooling choices: `/audit`

### 3. Data model · in-progress · full
The core records every release depends on: schools, sections, sessions and terms, classes, subjects, teachers, students, scores, remarks, ratings. Every record belongs to one school. Students are records now, with room for a login later (for the future learning platform). School subjects and classes map to a shared standard list (for example "General Mathematics" maps to Mathematics, "JSS1 Gold" maps to JSS1) so past questions can link across schools later.
**Done when:** one school's data can never be read by another school; the model supports term results, third term cumulative results, and later student logins and shared learning content without a breaking change.
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model`
  - [x] Dev database branch, schema and first migration (AC-1, AC-2, AC-11, AC-12)
  - [x] Seed data: standard lists and the demo school (AC-9, AC-12)
  - [x] School scoped data layer and the score save path (AC-3, AC-4, AC-5, AC-8, AC-10)
  - [x] Session results and grade bands, with tests (AC-6, AC-7, all ACs tested)
- [ ] Verify it: `/check verify data model`
- [ ] Test it: `/test data model`
Spec [0003](../specs/0003-data-model/index.md) · code in `src/db/schema/`, `src/server/data/`

### 4. Design system & UI foundation · in-progress
A simple, clear look and base components that work well on a teacher's phone and a staffroom computer.
**Done when:** `design.md` covers type, colour, spacing, and base components; forms and tables are usable on a small phone screen and by keyboard.
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] Tokens, type and thumb-sized base components
  - [x] Score sheet and red pen, sign in and design previews
- [ ] Verify it: `/check verify`
- [ ] Test it: `/test`
Spec [0002](../specs/0002-design-system/index.md) · rules in [design.md](../design.md) · code in `src/components/`, tokens in `src/app/globals.css`

## Release 1: Smallest usable report card tool

The pilot school can enter one class's scores and print every report card for that class.

### 5. Logins & access · in-progress · full
Our team and teachers sign in. No public sign up: our team creates every account, gives a temporary password, and resets forgotten ones. A teacher only ever reaches their own class in their own school.
**Done when:** a teacher signs in with a phone number or username, must change the temporary password on first sign in, and the server refuses any read or write outside the teacher's assigned class, even if the address is changed by hand.
- [x] Design it (spec): `/architect logins & access`
- [x] Build it: `/develop logins & access`
  - [x] Better Auth, auth tables, throttle and audit log, no public auth endpoints (AC-1, AC-4, AC-6, AC-11, AC-12)
  - [x] Viewer, school and class access checks in the data layer, sign in and school pages (AC-2, AC-5, AC-7, AC-8, AC-10)
  - [x] Setup links by QR and WhatsApp, minimal admin area with read only view as (AC-3, AC-9, AC-13)
  - [x] Tests and demo logins (all ACs)
- [ ] Verify it: `/check verify logins & access`
- [x] Test it: `/test logins & access`
Spec [0004](../specs/0004-logins-access/index.md) · code in `src/server/auth/`, `src/app/login/`, `src/app/setup/`, `src/app/[school]/`, `src/app/admin/`

### 6. School & term setup · in-progress
Our team sets up a school: name, logo, address, motto, principal's signature or stamp, sections (primary, secondary) with the right teacher title (class teacher, form master), the current session and term, and the school's plan (our branding or the school's own logo).
**Done when:** our team can create the pilot school and set its current term, and every page shows the right school and term.
- [x] Design it (spec): `/architect school & term setup`
- [x] Build it: `/develop school & term setup`
  - [x] School details, web name and the setup checklist (AC-1, AC-2, AC-3, AC-8)
  - [x] Logo and signature uploads (AC-4)
  - [x] Sections, sessions, terms and the current term switch (AC-5, AC-6, AC-7)
- [ ] Verify it: `/check verify school & term setup`
- [x] Test it: `/test school & term setup`
Spec [0005](../specs/0005-school-term-setup/index.md) · code in `src/app/admin/schools/`, `src/server/data/setup.ts`, `src/app/school-logo/`

### 7. Classes, subjects & grading rules · in-progress
Our team adds classes and arms, the subjects each class offers (marking which are electives; each senior student's electives are registered in #8), the score split (for example CA1 20, CA2 20, Exam 60), and the grade scale for each section (JSS A to F, SS A1 to F9).
**Done when:** a class has its subjects and rules set, and changing the grade scale changes the grades shown without anyone entering scores again.
- [x] Design it (spec): `/architect classes, subjects & grading rules`
- [x] Build it: `/develop classes, subjects & grading rules`
  - [x] Subject order migration, and the data rules for subjects, classes, offers, splits and scales (AC-1 to AC-8, AC-11)
  - [x] Subjects page and Classes page with each level's subject offer (AC-1 to AC-4, AC-8)
  - [x] Score split and grades page (AC-5, AC-6, AC-7)
  - [x] Session switcher, copy from last session, checklist items, and tests (AC-9, AC-10, all ACs tested)
- [x] Verify it: `/check verify classes, subjects & grading rules`
- [ ] Test it: `/test classes, subjects & grading rules`
Spec [0006](../specs/0006-classes-subjects-grading/index.md) · code in `src/server/data/curriculum.ts`, `src/server/data/grading.ts`, `src/app/admin/schools/[schoolId]/subjects/`, `classes/`, `grading/`

### 8. Enrol teachers & students · in-progress
Our team adds teachers and students one at a time, assigns each class its form master or class teacher, and records each parent's name and phone number. WhatsApp consent waits for #19 (spec 0008); parents check results by PIN first (#21).
**Done when:** our team can enrol a class of students and its teacher, and that teacher sees exactly that class after signing in.
- [x] Design it (spec): `/architect enrol teachers & students`
- [x] Build it: `/develop enrol teachers & students`
  - [x] Admission number migration, and the Staff page with login in the same step (AC-1, AC-2, AC-3, AC-6, AC-16)
  - [x] Students page, class list with form master and quick add, and the teacher's class page (AC-4, AC-5, AC-6, AC-14)
  - [x] Student panel: details, photo, parents with sibling linking (AC-7, AC-8)
  - [x] Move, left and remove; electives grid; carry forward on term switch (AC-9 to AC-13)
  - [x] Checklist items and tests (AC-15, all ACs tested)
- [ ] Verify it: `/check verify enrol teachers & students`
- [x] Test it: `/test enrol teachers & students`
Spec [0008](../specs/0008-enrol-teachers-students/index.md) · code in `src/server/data/staff.ts`, `src/server/data/students.ts`, `src/server/data/guardians.ts`, `src/app/admin/schools/[schoolId]/staff/`, `students/`, `src/app/[school]/classes/`

### 9. Score entry · done
The teacher enters CA1, CA2, and Exam scores for every student in every subject of their class, quickly, on a phone or computer.
**Done when:** a teacher can fill a whole class's scores without losing work; a score above its maximum is refused with a clear message; saved scores survive a page refresh.
- [x] Design it (spec): `/architect score entry`
- [x] Build it: `/develop score entry`
  - [x] Data: closed term refusal, progress, sheet additions and history (AC-1, AC-6, AC-11 to AC-13)
  - [x] Subject list and score sheet on real data with save, 1 to 5 parts and empty states (AC-1, AC-3 to AC-5, AC-13, AC-14)
  - [x] Protect typed work: term picker and read only sheets, stale drafts, conflicts, out of date reloads (AC-2, AC-5 to AC-9)
  - [x] Paste a column, score history, and our team's Scores page (AC-10 to AC-12)
  - [x] Component tests and visual check at 390px and 1280px (all ACs)
- [x] Verify it: `/check verify score entry`
- [x] Test it: `/test score entry`
Spec [0009](../specs/0009-score-entry/index.md) · code in `src/server/data/scores.ts`, `src/components/score-sheet/`, `src/app/[school]/classes/`, `src/app/admin/schools/[schoolId]/scores/`

### 10. Results computation · done · full
The system works out each subject's total and grade, each subject's position, the class average, highest and lowest per subject, each student's overall total and average, and position in class (for example 5th of 32).
**Done when:** results match a hand calculation for a sample class, ties share a position the way Nigerian schools expect (two students 3rd, next is 5th), and a missing score is handled clearly, never silently counted as zero.
- [x] Design it (spec): `/architect results computation`
- [x] Build it: `/develop results computation`
  - [x] Pure rules and the hand calculated sample class tests (AC-1 to AC-7, AC-12)
  - [x] Class results loader in one snapshot, with access and database tests (AC-4, AC-7, AC-10, AC-11)
  - [x] Results section on the class page and the student breakdown panel (AC-8, AC-9)
  - [x] Component tests and visual check at 390px and 1280px (all ACs)
- [x] Verify it: `/check verify results computation`
- [x] Test it: `/test results computation`
Spec [0010](../specs/0010-results-computation/index.md) · code in `src/lib/results.ts`, `src/server/data/results.ts`, `src/app/[school]/classes/[classId]/` (results section and panel), preview `/design/results`

### 11. Remarks · in-progress
The teacher adds a comment per student; the principal's comment fills itself in from the student's average and can be typed over. Attendance is deferred (spec 0011).
**Done when:** remarks save per student per term and appear on the report card.
- [x] Design it (spec): `/architect remarks & attendance`
- [x] Build it: `/develop remarks`
  - [x] Comment bands migration and the pure rules: tidy text, automatic comment by average (AC-3, AC-4, AC-10)
  - [x] Data: load in one snapshot with results, save with closed term, conflict and stale checks (AC-5 to AC-8, AC-11, AC-12)
  - [x] Remarks sheet and the class page Remarks section, then draft, conflicts and read only terms (AC-1 to AC-9, AC-12)
  - [x] Our team's comment bands editor on the Grading page (AC-10)
  - [x] Component tests and visual check at 390px and 1280px (all ACs)
- [ ] Verify it: `/check verify remarks`
- [ ] Test it: `/test remarks`
Spec [0011](../specs/0011-remarks/index.md) · code in `src/lib/remarks.ts`, `src/server/data/remarks.ts`, `src/components/remarks-sheet/`, `src/app/[school]/classes/[classId]/remarks/`

### 22. School principal and section heads · done
Each school has one principal (title, name, signature), set once on School details. A section may have its own head (for example a primary head teacher), who then signs that section's report cards instead. Names and signatures are fixed in place, with no history for now. Comes before #12, which prints the signature. From spec 0007.
**Done when:** our team sets the principal once, gives Primary its own head, and `getSignerForSection` returns the right signer for every section.
- [x] Design it (spec): `/architect school principal and section heads`
- [x] Build it: `/develop school principal and section heads`
  - [x] Remove the earlier 0007 build, then the migration and seed for the principal (AC-1, AC-10)
  - [x] Data rules: save principal, own head switch, signature owner, signer, checklist (AC-1, AC-3, AC-4, AC-6 to AC-9)
  - [x] Screens: Principal block, section switch, signer line on each card, the confirms (AC-1 to AC-5)
  - [x] Tests for the signer, switch, fixes, uploads, checklist and access (AC-1 to AC-10)
- [x] Verify it: `/check verify school principal and section heads`
- [x] Test it: `/test school principal and section heads`
Spec [0007](../specs/0007-school-principal-section-heads/index.md) · code in `src/server/data/setup.ts`, `src/app/admin/schools/[schoolId]/details/`, `src/app/admin/schools/[schoolId]/sections/`

### 12. Report card PDF · in-progress
The standard Nigerian report card for the whole class as one file, ready to print. Shows the school logo and signature on the school logo plan, or our branding ("Powered by") on the basic plan.
**Done when:** the teacher downloads one PDF with exactly one A4 page per student; it reads clearly when printed in black and white and photocopied; nothing spills onto a second page even with the most subjects any class takes.
- [x] Design it (spec): `/architect report card PDF`
- [x] Build it: `/develop report card PDF`
  - [x] Font, react-pdf setup and the pure card model: readiness, register order, every printed string (AC-2 to AC-7, AC-9)
  - [x] Data: one snapshot loader for results, remarks, school, signer and images, with access tests (AC-11, AC-12)
  - [x] The card document, the download route and the Report cards section on the class page (AC-1 to AC-8, AC-12)
  - [x] Results day guards: page count check, worst case fit, file size and race tests (AC-2, AC-10, AC-13)
  - [x] Preview, component tests, and the black and white print and photocopy check (AC-1, AC-14, all ACs)
- [ ] Verify it: `/check verify report card PDF`
- [ ] Test it: `/test report card PDF`
Spec [0012](../specs/0012-report-card-pdf/index.md) · code in `src/lib/report-card.ts`, `src/server/data/report-cards.ts`, `src/components/report-card/`, `src/app/[school]/classes/[classId]/report-cards/`

## Release 2: Ready for results day

Everything the pilot school needs to use it for real at the end of First Term.

### 13. Excel import · in-progress
Our team uploads the school's student and teacher lists from Excel instead of typing them in, with a check before anything is saved.
**Done when:** our team uploads a sheet, sees a preview listing rows with problems (missing class, repeated admission number, bad phone number), fixes them, confirms, and every valid row is saved.
- [x] Design it (spec): `/architect excel import`
- [ ] Build it: `/develop excel import`
  - [x] Import run migration and the pure import core (headers, cells, CSV, names, classes, shared field checks) (AC-2 to AC-5, AC-11, AC-13)
  - [x] Student import end to end: read, preview, confirm, result, on the Students page (AC-2 to AC-10, AC-16)
  - [ ] Templates, recent imports and undo for student runs (AC-1, AC-13, AC-14)
  - [ ] Teacher import with logins and form classes, and its undo (AC-1, AC-11, AC-12, AC-15)
  - [ ] Tests for every scenario (AC-1 to AC-16)
- [ ] Verify it: `/check verify excel import`
- [ ] Test it: `/test excel import`
Spec [0013](../specs/0013-excel-import/index.md) · code in `src/lib/import/`, `src/server/import/`, `src/server/data/imports.ts`, `src/app/admin/schools/[schoolId]/import/`, `students/import/`, `staff/import/`

### 14. Behaviour & skills ratings
The teacher rates each student 1 to 5 on behaviour (punctuality, neatness, politeness and similar) and skills (handwriting, sports, crafts and similar), on one quick screen for the class.
**Done when:** a teacher can rate a whole class on one screen, and the ratings appear on the report card.
- [ ] Build it: `/develop behaviour & skills ratings`

### 15. Single student reprint
After fixing a score, the teacher downloads just that student's report card instead of the whole class.
**Done when:** a corrected score shows on a single student PDF, and the student's position and the class figures update for everyone affected.
- [ ] Build it: `/develop single student reprint`

### 16. Class broadsheet · needs a decision
The full class score sheet (every student, every subject) as a spreadsheet and as a printable file, as principals expect.
**Done when:** the teacher downloads the broadsheet for their class and its figures match the report cards exactly.
- [ ] Design it (spec): `/architect class broadsheet`

### 17. Launch readiness · needs a decision
What must be true before the school pays and uses it: hosting that allows commercial use, error alerts that email our team, an end of term routine to export every broadsheet and report card as an offline copy, and a short privacy notice for the school (children's records, Nigeria Data Protection Act).
**Done when:** an error a teacher hits emails our team; the app runs on a plan that allows paid use; the end of term export works; the school has received the privacy notice.
- [ ] Design it (spec): `/architect launch readiness`

## Release 3: Results online with PINs

Parents check results online from Second Term 2026/2027 (around April 2027). First Term results go out on paper as planned.

### 21. Result PIN checker · full
Each student gets one PIN per term, printed on a slip the school hands out (for example, only once fees are paid). A parent types the 12 digit PIN on one public result page and sees that child's result for that term, as often as they like, and can download the report card. No admission number or account is needed. PINs are never stored readable, guessing is throttled, results show only once the school releases them, and a lost slip is replaced with a new PIN that kills the old one. The school can see which slips were issued and used.
**Done when:** a parent with a valid PIN sees exactly one child's released result for one term and nothing else; an unreleased term, a wrong PIN, or a replaced PIN shows a clear message; repeated wrong guesses are slowed down; the school prints PIN slips for a whole class and replaces a lost one.
- [x] Design it (spec): `/architect result PIN checker`
- [x] Build it: `/develop result PIN checker`
  - [x] Migration and PIN core: keyed hash, check digit, signed cookie, atomic throttle counts (AC-7, AC-9, AC-14, AC-15, AC-19, AC-20)
  - [x] Thinnest whole: Results online page with release, withdraw and class slip printing, then `/result` with its answers, result view and card download (AC-1 to AC-3, AC-5, AC-6, AC-8, AC-12 to AC-18)
  - [x] Lost slips: class slip page, replace one, remake a print run (AC-10, AC-11, AC-19)
  - [x] Release lock across every term and session writer (AC-4, AC-19)
  - [x] Results day guards, previews and checks (AC-7, AC-8, AC-20 to AC-22)
- [x] Verify it: `/check verify result PIN checker`
- [x] Test it: `/test result PIN checker`
Spec [0014](../specs/0014-result-pin-checker/index.md) · code in `src/lib/result-pin.ts`, `src/server/result-pin/`, `src/server/data/result-pins.ts`, `src/server/data/pin-results.ts`, `src/components/pin-slips/`, `src/app/admin/schools/[schoolId]/results/`, `src/app/result/`

## Release 4: Full school year

### 18. Third term cumulative & promotion · needs a decision
The third term report card shows first, second, and third term totals, the cumulative average, and the promotion decision (promoted, repeat, on probation). Needed before Third Term results (around July 2027).
**Done when:** the third term card shows all three terms correctly, including students who joined mid year, and the promotion rule follows the school's setting.
- [ ] Design it (spec): `/architect third term cumulative & promotion`

## Release 5: Results straight to parents (Phase 2)

### 19. Send results on WhatsApp · needs a decision · full
Next to each student, the teacher taps "Send on WhatsApp"; their own WhatsApp opens with the parent's number and a message with a private link to that child's result. Free, no business registration needed. Links use the school's short name in the address (for example `/gracehigh`).
**Done when:** only parents who gave consent are offered; the link opens only that child's result and cannot be guessed; the school can switch a link off; each student shows as sent once tapped.
- [ ] Design it (spec): `/architect send results on whatsapp`

## Release 6: Grow to more schools

### 20. Onboard more schools · needs a decision
Our team adds and switches between schools from one admin area, so a new school can be onboarded in about an hour with no new code.
**Done when:** our team onboards a second school end to end, and neither school ever sees the other's data.
- [ ] Design it (spec): `/architect onboard more schools`

## Deferred
Out of scope for now, kept so the plan stays honest.
- **Automatic WhatsApp sending**: one button sends every parent the PDF with read receipts. Needs business registration (CAC) first · needs a decision
- **School fees**: fee lists, payments, receipts, who owes what · needs a decision · full weight
- **Parent portal**: parents sign in to see results and history (the Result PIN checker covers checking one term's result without an account) · needs a decision
- **Principal approval**: the principal checks and locks results before printing or sending · needs a decision
- **Subject teachers**: each subject of a class gets its own teacher who enters its scores; the sheet and save stay the same, only access changes (from spec 0009) · needs a decision
- **Absent and Exempt marks**: per student per subject, "ABS" counting as 0 and "Exempt" leaving the subject out of the average; until then the teacher types 0 or the subject is made an elective (from spec 0010) · needs a decision
- **Rank across all arms of a level**: positions out of every JSS 2 arm, not one arm (from spec 0010) · needs a decision
- **Re-admit a student who left in an earlier term**: a "Left the school" list with "Re-admit into class" (from spec 0008) · needs a decision
- **Attendance**: days present per student and the attendance box on the report card. The columns (`term_report.days_present`, `term.days_opened`) and the school's switch already exist (from spec 0011) · needs a decision
- **Student photo on the report card**: a passport photo box on each card; `student.photo_asset_id` already exists (from spec 0012) · needs a decision
- **School stamp on the report card**: the `stamp` asset kind exists, nothing uploads or prints it (from spec 0012) · needs a decision
- **Principal history**: keep who signed which term, so reprints of old terms keep the earlier principal after a change (from spec 0007) · needs a decision
- **School admin or bursar login for PIN slips**: the school prints, replaces and tracks its own slips instead of asking our team (from spec 0014) · needs a decision
- **Bulk update students from a sheet**: import fixing names, classes, parents or electives of students already in the school; import only adds for now (from spec 0013) · needs a decision
- **Schools sign themselves up and pay online** · needs a decision · full weight
- **Own domain and school subdomains** (for example `gracehigh.ourapp.com`) · needs a decision
- **Learning platform**: student logins, past questions and practice, maybe online exams. WAEC, NECO, and JAMB own their past papers, so get permission or write original practice questions first · needs a decision · full weight

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones rolled up from the spec**; `Verify it` + `Test it` boxes; any surfaced follow up enrolled |
| `in-progress` (building) | `/develop` | milestone sub boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | `/test`, then `/sync` | all boxes ticked; `/sync` captures the slice's conventions into `AGENTS.md` |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (before this workflow) and `dropped` (taken out of scope, kept for history).
- **Approach tag** beside a heading (for example `· Facade`) overrides the project default for that feature; no tag means it inherits.
- **Weight tag** `· full` = a fresh model `/check review` is warranted; `lean` and `medium` get no tag.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
