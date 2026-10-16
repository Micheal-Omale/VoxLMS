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
| 5 | Logins & access | Release 1 | planned |
| 6 | School & term setup | Release 1 | planned |
| 7 | Classes, subjects & grading rules | Release 1 | planned |
| 8 | Enrol teachers & students | Release 1 | planned |
| 9 | Score entry | Release 1 | planned |
| 10 | Results computation | Release 1 | planned |
| 11 | Remarks & attendance | Release 1 | planned |
| 12 | Report card PDF | Release 1 | planned |
| 13 | Excel import | Release 2 | planned |
| 14 | Behaviour & skills ratings | Release 2 | planned |
| 15 | Single student reprint | Release 2 | planned |
| 16 | Class broadsheet | Release 2 | planned |
| 17 | Launch readiness | Release 2 | planned |
| 21 | Result PIN checker | Release 3 | planned |
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

### 5. Logins & access · needs a decision · full
Our team and teachers sign in. No public sign up: our team creates every account, gives a temporary password, and resets forgotten ones. A teacher only ever reaches their own class in their own school.
**Done when:** a teacher signs in with a phone number or username, must change the temporary password on first sign in, and the server refuses any read or write outside the teacher's assigned class, even if the address is changed by hand.
- [ ] Design it (spec): `/architect logins & access`

### 6. School & term setup · needs a decision
Our team sets up a school: name, logo, address, motto, principal's signature or stamp, sections (primary, secondary) with the right teacher title (class teacher, form master), the current session and term, and the school's plan (our branding or the school's own logo).
**Done when:** our team can create the pilot school and set its current term, and every page shows the right school and term.
- [ ] Design it (spec): `/architect school & term setup`

### 7. Classes, subjects & grading rules · needs a decision
Our team adds classes and arms, the subjects each class offers (and each senior student's electives), the score split (for example CA1 20, CA2 20, Exam 60), and the grade scale for each section (JSS A to F, SS A1 to F9).
**Done when:** a class has its subjects and rules set, and changing the grade scale changes the grades shown without anyone entering scores again.
- [ ] Design it (spec): `/architect classes, subjects & grading rules`

### 8. Enrol teachers & students · needs a decision
Our team adds teachers and students one at a time, assigns each class its form master or class teacher, and records each parent's name, phone number, and WhatsApp consent (collected now for Release 4).
**Done when:** our team can enrol a class of students and its teacher, and that teacher sees exactly that class after signing in.
- [ ] Design it (spec): `/architect enrol teachers & students`

### 9. Score entry · needs a decision
The teacher enters CA1, CA2, and Exam scores for every student in every subject of their class, quickly, on a phone or computer.
**Done when:** a teacher can fill a whole class's scores without losing work; a score above its maximum is refused with a clear message; saved scores survive a page refresh.
- [ ] Design it (spec): `/architect score entry`

### 10. Results computation · needs a decision · full
The system works out each subject's total and grade, each subject's position, the class average, highest and lowest per subject, each student's overall total and average, and position in class (for example 5th of 32).
**Done when:** results match a hand calculation for a sample class, ties share a position the way Nigerian schools expect (two students 3rd, next is 5th), and a missing score is handled clearly, never silently counted as zero.
- [ ] Design it (spec): `/architect results computation`

### 11. Remarks & attendance
The teacher adds a comment per student, the principal's comment, times school opened, and times present.
**Done when:** remarks and attendance save per student per term and appear on the report card.
- [ ] Build it: `/develop remarks & attendance`

### 12. Report card PDF · needs a decision
The standard Nigerian report card for the whole class as one file, ready to print. Shows the school logo and signature on the school logo plan, or our branding ("Powered by") on the basic plan.
**Done when:** the teacher downloads one PDF with exactly one A4 page per student; it reads clearly when printed in black and white and photocopied; nothing spills onto a second page even with the most subjects any class takes.
- [ ] Design it (spec): `/architect report card PDF`

## Release 2: Ready for results day

Everything the pilot school needs to use it for real at the end of First Term.

### 13. Excel import · needs a decision
Our team uploads the school's student and teacher lists from Excel instead of typing them in, with a check before anything is saved.
**Done when:** our team uploads a sheet, sees a preview listing rows with problems (missing class, repeated admission number, bad phone number), fixes them, confirms, and every valid row is saved.
- [ ] Design it (spec): `/architect excel import`

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

### 21. Result PIN checker · needs a decision · full
Each student gets one PIN per term, printed on a slip the school hands out (for example, only once fees are paid). A parent types the 12 digit PIN on one public result page and sees that child's result for that term, as often as they like, and can download the report card. No admission number or account is needed. PINs are never stored readable, guessing is throttled, results show only once the school releases them, and a lost slip is replaced with a new PIN that kills the old one. The school can see which slips were issued and used.
**Done when:** a parent with a valid PIN sees exactly one child's released result for one term and nothing else; an unreleased term, a wrong PIN, or a replaced PIN shows a clear message; repeated wrong guesses are slowed down; the school prints PIN slips for a whole class and replaces a lost one.
- [ ] Design it (spec): `/architect result PIN checker`

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
