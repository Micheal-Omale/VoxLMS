# 0013. Excel import of students, parents and teachers

**Date**: 2026-10-18
**Status**: In Progress

## Summary

Our team uploads a school's student list (with parents) or teacher list as an Excel or CSV file. The app checks every row and shows a preview before anything is saved. Valid rows are saved, and problem rows are skipped and listed by their Excel row number, so the team fixes them in Excel and uploads the same file again. Uploading again is safe, because students and teachers already in the school are skipped. Each upload is recorded as an import run that can be undone in one click while nothing it added has results, which replaces the database snapshot spec 0001 planned before every import.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As our team, I want to upload a school's whole student register with parents in one file, so that onboarding a 200 student school takes minutes, not an afternoon of typing.
- As our team, I want to see every problem before anything is saved, so that a bad file never puts wrong records into a school.
- As our team, I want to fix problems in Excel and upload the same file again, so that I never have to work out which rows already went in.
- As our team, I want to upload the teacher list with their form classes, so that every teacher has a login and every class has its form master in one step.
- As our team, I want to undo a whole import, so that a wrong file (or the right file in the wrong school) is a one click fix.

**Acceptance criteria** (the contract):
- **AC-1**: The Students page and the Staff page each have "Import from Excel", which opens an import screen (`/admin/schools/[schoolId]/students/import`, `/admin/schools/[schoolId]/staff/import`). Each screen offers "Download template": an `.xlsx` made for this school, with the right headers, the school's active class names as a dropdown in the Class (or Form class) column, dropdowns for Gender and Relationship (each list kept on a hidden sheet, since an inline list is capped at 255 characters), phone and admission number columns formatted as text for the whole column (so a leading 0 stays), and a second sheet "How to fill" that explains each column. The data sheet has no example row.
- **AC-2**: The import accepts `.xlsx` and `.csv` files of up to 2 MB and up to 1,500 data rows (blank rows don't count). An old `.xls` file is refused with "This is an old Excel file. Open it in Excel and save it as .xlsx." A CSV that isn't valid UTF-8 (Excel's plain "CSV" save) is refused with "Save it as CSV UTF-8 (comma delimited)". CSV may use commas or semicolons, with or without a byte order mark, and every CSV cell is read as text (never turned into a number or a date). Anything else is refused as "not an Excel or CSV file". A larger file is refused with "Split it by section and upload each part." The file is read as shown in Excel: a formula gives its cached result (a formula with no result, or an error such as `#N/A`, makes that cell a row problem), rich text and links give their text, a number gives its digits (no `.0`, no scientific notation; padded when the cell's number format pads it, like `00000`), a date or true/false cell in a text field is a row problem, merged cells give their value once, non breaking and zero width spaces become plain spaces, spaces are trimmed and inner spaces collapsed, and blank rows are skipped. An admission number that Excel stored as a number gets a note ("stored as a number in Excel; leading zeros may be lost"). Row numbers shown are the real Excel row numbers.
- **AC-3**: The app reads the first sheet (in tab order) that has a header row within its first 10 rows. Title rows above the header ("GRACE HIGH SCHOOL 2026/2027 REGISTER") are skipped. Columns are found by header name in any order, comparing only letters and digits, ignoring case and a trailing "s" (on both sides), using the aliases in *Feature design*. A file missing a required column is refused, naming it ("No Gender column found. The headers we read were: …"). Two columns that both match one field are refused, naming them ("Columns C and F both look like Phone. Rename one."). Surname with Other names wins over Name when both exist. Unknown columns are ignored and listed. The preview says which sheet and header row were read and which column became which field.
- **AC-4**: A student row needs a surname and other names (from Surname plus Other names columns, or from one Name column split at the first comma, else at the first space, so "OKAFOR Chinedu Emmanuel" gives surname OKAFOR), a gender (M, F, Male, Female, Boy or Girl, any case) and a class. Admission number and house (up to 30 characters) are optional. The class is matched to one of the school's classes by the algorithm in *Feature design* ("jss2 gold" and "J.S.S 2 Gold" match "JSS 2 Gold"; "JSS 2G" matches it when Gold is the only JSS 2 arm starting with G). Names, gender, admission number and house follow exactly the same rules as a typed student (spec 0008, AC-5 to AC-7).
- **AC-5**: A student row carries up to two parents, from Parent 1 and Parent 2 columns (name, phone, relationship) or from Father's and Mother's name and phone columns (relationship taken from the header). Relationship accepts mother, father or guardian (also mum, mom, dad), any case, and is guardian when not given. A parent needs both a name (3 to 80 characters) and a Nigerian mobile number (stored as +234). All parent blocks on the row are read (Parent 1, Parent 2, Father, Mother, in that order). A parent with only a name or only a phone, a phone that isn't a Nigerian mobile, or more than two different parents filled in makes the row a problem. Two blocks with the same phone and the same name (compared as in AC-7) count as one parent, with a note. The first parent is primary.
- **AC-6**: Each student row has exactly one outcome:
  - **Will add**: everything checks out.
  - **Already here**: its admission number (compared ignoring case and spaces, as in spec 0008, AC-6) belongs to a student already in the school. The row is skipped entirely, parents included, and that student is not changed. When that student is in another class this term, or has left, the note says so ("is in JSS 2 Blue; not moved").
  - **Probably here**: it has no admission number, and its surname and other names (ignoring case and spaces) match a student enrolled this term in any class of the school (open or withdrawn), or an earlier row of the file (whatever that row's outcome) for the same class. The note names the match ("OKAFOR Chinedu in JSS 2 Blue" or "same as row 12"). It comes with an "Add anyway" tick, unticked by default.
  - **Problem**: any rule in AC-4 or AC-5 fails, the class is missing, unknown or switched off, or the same admission number appears on more than one row of the file (all those rows are problems). The reason is in plain words ("Row 14: SS 3 Blue is not a class at this school").

  A row with an admission number that is new, but whose name matches someone in the class, is added with a note.
- **AC-7**: Parents are matched by phone and name together (the name compared ignoring case, spaces and a leading title such as Mrs or Mr). The same phone and name on several rows of the file makes one new parent linked to all those children (siblings). The same phone and name as a parent already in the school links that parent (when several old parents match, the oldest). The same phone with a different name makes a separate parent, with the note "Same phone as Mrs Ngozi Okafor (parent of OKAFOR Chidi)".
- **AC-8**: Uploading shows the preview and saves nothing. The preview shows counts on top ("Will add 182 · already here 6 · probably here 2 · problems 4"), then the problem rows (Excel row number and reason), then every row as it will be saved: surname, other names, gender, matched class, admission number, house and parents (new, linked or shared within the file), with notes and "Add anyway" ticks inline. Confirm is offered only when the import would write something (a row added, or a form master set, AC-12), and is disabled while a Confirm is running.
- **AC-9**: Confirm posts the same file again, with the ticks, the term the preview was made for, and the preview's file fingerprint (SHA-256 of the bytes) and plan fingerprint (a hash of every row's number and outcome). The server reads and checks the whole file again inside one transaction. It refuses, saving nothing, when the file fingerprint differs ("The file changed. Upload it again."), when the current term changed ("The current term changed. Upload the file again."), or when the plan fingerprint differs because records changed meanwhile ("Records changed since the preview. Check the new preview."); each refusal carries a `code` the screen acts on and shows the fresh preview where it can. Otherwise it saves every "Will add" row and every ticked "Probably here" row: the student with the next student number, an enrolment in the current term's matched class, and their parents (created or linked as in AC-7). It is all or nothing: if anything fails, nothing is saved. A commit that would write nothing records no run. The result screen shows what was added, and lists every skipped row (already here, unticked probably here, problem) with its reason. Uploading the same file again after fixing problems adds only the fixed rows.
- **AC-10**: Without a current term, the student import screen says to set one first and offers no upload (as the class list does, spec 0008, AC-5).
- **AC-11**: A teacher row needs a full name (3 to 80 characters) and a Nigerian mobile number. Title and Form class are optional. Without a Title column, a leading title in the name (Mr, Mrs, Miss, Ms, Dr, Prof, Rev, Pastor, Alhaji, Alhaja, Mallam, Chief, Engr, Barr) becomes the title. Outcomes:
  - **Will add**: the staff record and its login are created as "Add teacher" does (spec 0008, AC-1, `teacher` role). Setup links are shared later from the Staff page menu.
  - **Already here**: the phone belongs to active staff in this school. They are not changed, but their Form class still applies (AC-12).
  - **Has left**: the phone belongs to staff here who left. Note: "Mark as active again first". Nothing applies.
  - **Same person?**: the phone already has a login (matched on the login itself, as "Add teacher" does, so a login with no staff record counts too). It comes with a "Same person as Mrs Ngozi Okafor (Grace High School)?" tick, unticked by default (with "login switched off" when it is). Unticked rows are skipped.
  - **Problem**: a bad name or phone, or the same phone on more than one row of the file (all those rows).

  Preview, confirm, all or nothing and the result screen work as in AC-8 and AC-9. A teacher import works without a current term.
- **AC-12**: Form class sets the teacher as form master (or class teacher) of that class for the current term's session, only when the class has no form master yet. If it already has a different one, the note reads "JSS 1 Gold already has Mr Bello; not changed". If it already has this teacher, the note reads "already form master" and it isn't counted as set. If two rows of the file name the same form class, neither is applied (note on both). If the class is unknown or switched off, or there is no current term, it is a note and the teacher is still added. Class names are matched as in AC-4.
- **AC-13**: Every confirmed import is recorded as an import run: kind, file name, who, when, the term, and its counts. Each import screen lists its kind's recent runs below the upload box (newest first, 20 at a time): date, who, file name, counts, and "Undo this import", or "Undone on …" for an undone run. The uploaded file itself is never stored.
- **AC-14**: "Undo this import" for a student run asks to confirm, naming the counts and what is lost ("Remove 182 students and 150 parents added by this import? Changes made to them since, such as photos, houses and electives, go too."). It is refused as a whole, naming who blocks it ("OKAFOR Chinedu and 2 others have scores"), while any student the run added has a record that blocks "Remove, added by mistake" (the same check, `studentsWithRecords`: score, score history, remark or rating, in any term). Otherwise, in one transaction, it removes what the run added, the way "Remove, added by mistake" does (spec 0008, AC-12): each student's enrolments, electives, parent links and photo, then the students, then any parent left with no children. Parents who are still linked to other children stay. The run stays listed, marked undone. A run can be undone once.
- **AC-15**: "Undo this import" for a teacher run is refused as a whole, naming who blocks it, while any login the run created has a password (that teacher finished setup) or has since been linked to another staff record, or any teacher it added is still referred to elsewhere (for example a section head, spec 0007). Otherwise, in one transaction, it removes the form master rows that still carry this run (also those of teachers it did not add), every form master row of the teachers it added (any session), those staff records, and only the logins this run created (recorded on the run; a reused login is never removed). A removed login is first logged as an auth event (spec 0004), then its sessions, accounts and setup links go, then the login.
- **AC-16**: Only our team can import, download templates or undo. Anyone else gets not found, and while viewing as someone every write is refused (spec 0004). Every id (school, class, run, guardian) is checked within the school. Server logs carry the run id, kind, counts and time taken, never names or phone numbers (database error `detail`, which echoes values, is dropped before logging). The upload Route Handler checks the team session and that the request's Origin matches the app before reading the body.

## Decision

**Chosen option**: Option 1: a stateless upload, check, confirm flow over shared row rules, with an import run record and undo.

Upload and Confirm both send the file to one Route Handler, which reads it with ExcelJS and runs the same pure planner. Preview returns the plan, and Confirm runs the plan again inside one transaction and writes the "add" rows in batches. Each run is recorded so it can be undone.

**Implementation skills**: `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

## Feature design

**Data model sketch** (one migration, the next drizzle number, `0010_import_run` at the time of writing):

| Table | Change | Fields | Rules |
|---|---|---|---|
| `import_run` | new | `id` uuid PK; `school_id` (req); `kind` enum `import_kind` (`students`, `teachers`) (req); `file_name` text (req, at most 200 chars); `term_id` (null: a teacher import may have no current term); `created_by` → `user.id` (req); `created_at` (req); `counts` jsonb (req); `created_logins` uuid[] (req, default empty: the logins this run made new, never reused ones); `undone_at` (null); `undone_by` → `user.id` (null) | `unique (school_id, id)`; composite FK `(school_id, term_id)` → `term`; index `(school_id, kind, created_at desc)` for the list. Never deleted (so `created_by` keeps that user from being deleted, as intended for an audit record). `counts` is `{ added, alreadyHere, probablyHereSkipped, problems, parentsCreated, parentsLinked, formMastersSet, needsConfirmSkipped }` |
| `student` | add column | `import_run_id` (null) | composite FK `(school_id, import_run_id)` → `import_run (school_id, id)`; partial index where not null |
| `guardian` | add column | `import_run_id` (null): only parents the run created | same FK and index |
| `staff` | add column | `import_run_id` (null) | same FK and index |
| `class_teacher` | add column | `import_run_id` (null): only form masters the run set | same FK and index. `setFormTeacher`'s upsert (spec 0008) now also sets `import_run_id = null`, so a form master changed by hand is never removed by an undo |

Relationships: school 1:N import runs; an import run 1:N students, parents, staff and form master rows it added. Enrolments and parent links carry no pointer, because undo removes them with their student. Logins are listed on the run (`created_logins`), because a reused login (another school's, or a team member's with no staff record) must never be removed.

**Column aliases** (compared on letters and digits only, lower cased, a trailing "s" dropped on both sides):

| Field | Headers accepted |
|---|---|
| Surname | Surname, Last name, Family name |
| Other names | Other names, First name, Given names, Forenames (a separate Middle name column is appended) |
| Name (split) | Name, Full name, Student name, Name of student (used only when Surname is absent) |
| Gender | Gender, Sex |
| Class | Class, Class name (a separate Arm column is appended) |
| Admission number | Admission number, Admission no, Adm no, Reg no, Registration number |
| House | House |
| Parent 1 | Parent name, Parent/Guardian name, Guardian name, Parent 1 name · Parent phone, Guardian phone, Phone, GSM, Parent 1 phone · Relationship, Parent 1 relationship |
| Parent 2 | Parent 2 name · Parent 2 phone · Parent 2 relationship |
| Father / Mother | Father name, Father phone · Mother name, Mother phone (relationship fixed) |
| Teacher title | Title |
| Teacher name | Full name, Name, Teacher name, Staff name |
| Teacher phone | Phone, Phone number, GSM, Mobile |
| Form class | Form class, Class, Form master of, Class teacher of |

Required: students need Surname plus Other names, or Name, and Gender and Class. Teachers need a name and Phone. Each file kind has its own alias table, so "Class" means Class in a student file and Form class in a teacher file.

**Class matching** (`src/lib/import/classes.ts`, pure): reduce both the cell and each class name to a key of upper case letters and digits only ("J.S.S 2 Gold" → `JSS2GOLD`). Matches are looked for among all classes, active or not (an inactive match is a "switched off" problem, not "unknown").
1. Exactly one class with the same key: that class.
2. Else split the cell key into its level part (up to and including the last digit) and the rest. If exactly one class has that level part and an arm whose key starts with the rest (`JSS2` + `G` → Gold), that class. The level part must match whole, so `SS1` never matches `SS11`.
3. Else (none, or more than one): unknown, and the problem lists the school's classes. Two classes whose names reduce to the same key are both unmatchable by step 1, and the problem says so.

**State transitions**:
- import run: confirmed (created with its rows, in one transaction) → undone (`undone_at` set; can't be undone twice). There is no draft state: a preview stores nothing.
- student row (in a plan): will add · already here · probably here (→ added when ticked) · problem.
- teacher row (in a plan): will add · already here · has left · same person? (→ added when ticked) · problem.

**API surface** (pages call `requireTeamSchoolContext`; data functions take a `SchoolContext`, start with `assertTeam`, and add `assertWritable` for writes):

| Surface | Method / kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/admin/schools/[schoolId]/students/import`, `/staff/import` | page | none | template link, upload box, preview, result, recent runs | our team | not found; no current term (students) |
| `/admin/schools/[schoolId]/import/[kind]/template` | GET route handler | `kind`: `students` \| `teachers` | `.xlsx` named `{CODE}-students-template.xlsx` / `{CODE}-teachers-template.xlsx` | our team | not found |
| `/admin/schools/[schoolId]/import/[kind]` | POST route handler, multipart, `maxDuration = 60` | `file` (req); `mode`: `preview` \| `commit` (req); commit also: `termId` (students), `fileHash`, `planHash`, `addAnyway`: row numbers (opt), `samePerson`: row numbers (opt) | preview: `{ sheet, headerRow, columns, ignored, counts, rows[], termId, fileHash, planHash }`; commit: `{ runId, counts, skipped[] }` | our team (Origin checked), writable for commit | every error is `{ ok: false, code, error }`: 413 `too_large`; 400 `not_spreadsheet`, `old_excel`, `not_utf8`, `missing_column`, `duplicate_column`, `too_many_rows`; 409 `file_changed`, `term_changed`, `plan_changed` (with the fresh preview), `clash` ("upload again") |
| `planStudentImport(ctx, grid, ticks)` / `planTeacherImport` (new, `src/server/data/imports.ts`) | data | parsed grid, ticks | the plan: every row with outcome, fields, parents, notes | our team | `NoCurrentTerm` (students) |
| `commitStudentImport(ctx, input, by)` / `commitTeacherImport` (new) | data | grid, ticks, `termId`, `fileName` | `{ runId, counts, skipped }` | our team, writable | `TermChanged`; unique clash → refused, nothing saved |
| `listImportRuns(ctx, { kind, before? })` (new) | data | kind, cursor | 20 runs with who, counts, undone | our team | none |
| `undoImport(ctx, { runId }, by)` + `undoImportAction` (new, `src/app/admin/schools/import-actions.ts`) | data + server action | runId | `{ ok: true, removed: counts }` | our team, writable | blocked (names who); already undone; not found |
| `readWorkbook(bytes, fileName)` (new, `src/server/import/read-workbook.ts`) | server only | bytes | `{ sheets: { name, rows: Cell[][] }[] }` | n/a | `OldExcel`, `NotSpreadsheet`, `NotUtf8`, `TooManyRows` |

`readWorkbook` picks the reader by the file's first bytes: a zip (`PK`) goes to ExcelJS's streaming `WorkbookReader`, the old Excel signature (`D0 CF 11 E0`) is refused, and anything else must decode as UTF-8 and goes to our own small CSV parser (`src/lib/import/csv.ts`, quoted fields, comma or semicolon found from the header line), because ExcelJS's CSV reader turns text like `00123` into numbers and dates. The streaming reader reads at most 10 sheets and 40 columns, and stops after the header row plus 1,500 non blank rows (more is `TooManyRows`), so a sheet formatted down to row 1,048,576 costs nothing. The body is size checked from `content-length` when present and again while reading it.

Pure, ExcelJS free modules in `src/lib/import/`: `columns.ts` (aliases, header row search), `cells.ts` (every ExcelJS value shape to text or a cell problem, per AC-2), `csv.ts`, `students.ts` and `teachers.ts` (row parsing and checks within the file: name split, gender, relationship, title split, repeated admission numbers or phones), `classes.ts` (class name matching). The planners in `src/server/data/imports.ts` add the database lookups (classes, admission numbers, this term's names per class, parents by phone, staff and logins by phone) in a few set based queries, never one per row.

**Key invariants**:
- One planner decides every outcome. Preview and Confirm call the same `plan…Import`, and Confirm calls it inside its transaction after taking the locks. Confirm saves only when its plan fingerprint equals the preview's, so what is saved is exactly what the team saw.
- A typed row and an imported row obey the same rules. The checks in `readStudent`, `teacherProblem`, `guardianProblem`, `normaliseAdmissionNo` and `normaliseNigerianPhone` are exported from (or moved beside) their modules and called by both paths. The parent limit and primary rule become one pure function that `linkGuardian` and the planner both call. No second copy of a rule.
- Text is cleaned once, in `cells.ts` (non breaking and zero width spaces become spaces), before any compare, so the app's admission number compare and the database index (`\s`) always agree.
- Import only adds. It never changes or deletes an existing student, parent, staff record or form master. Undo therefore removes exactly what the run added; hand edits made since to those rows go with them, and student numbers it used are not handed out again.
- Commit is one transaction: `lockCurrentTerm` (share lock), refuse when the term is not the previewed `termId`, lock the matched classes and the matched existing parents `for share`, plan and compare fingerprints, then write. Parents and links are planned in memory (new students have no links yet, so the two parent limit is the row's own) and inserted in bulk, never one `linkGuardian` call per row. `allocateStudentNumbers({ ...ctx, db: tx }, { count })` runs once, as late as possible, since it holds the school row lock to the end. Inserts go in batches of at most 500 rows. Before commit, one check query asserts every student touched has at most two parents and exactly one primary. Budget: a 1,500 row file commits in well under 60 seconds, a few dozen queries in all.
- A unique clash at the database (admission number `student_school_admission_norm_key`, staff phone `staff_school_phone_key`, form master `(session_id, class_id)`, parent link `(student_id, guardian_id)`) rolls back everything and returns `clash`: "Someone changed this school's records while you were importing. Upload the file again."
- Teacher logins are made with `createLoginForStaff(authOn(tx), …)` after all staff rows are inserted, inside the commit's transaction (`authOn` binds Better Auth's adapter to the transaction, as `addTeacher` already does), so a failed import leaves no login behind. Results with `reused: false` are stored in `import_run.created_logins`.
- Undo locks the run row `for update` and refuses when `undone_at` is set. It locks the run's students (and their enrolments) or staff `for update` before checking for blockers, so a score saved meanwhile cannot slip past. A foreign key error during undo is reported as "still used elsewhere", and nothing is removed.
- The uploaded bytes live only in memory for the request: never written to disk, the database, logs or error reports.

**Security model**:
- Children's personal data (names, parents' names and phones) under the Nigeria Data Protection Act, as in spec 0008. The import keeps no copy of the file, and the run stores only counts and the ids of logins it created. Data stays in the Neon project in London (spec 0003).
- Our team only (`assertTeam`). Writes (commit, undo) refused while viewing as someone (`assertWritable`). Teachers get not found on the pages, the template and the route handler.
- Every lookup filters by `school_id = ctx.schoolId`. Composite foreign keys refuse cross school rows if a check is missed. A run id from another school is not found.
- The template lists only this school's class names.
- Logins created or removed by import are logged with `logAuthEvent` (spec 0004), with the run id in the event details.
- The Route Handler gets no Server Action protection, so it checks the team session and that `Origin` matches the app's host before reading the body (`src/proxy.ts` does not list `/admin` as public). Files are size checked before and while reading. ExcelJS runs on the server only, and the reader refuses anything that is not a zip based `.xlsx` (by its first bytes) or UTF-8 CSV text.

**Configuration required**: none new. Add the `exceljs` dependency (chosen in spec 0001), kept server only.

**Critical test scenarios**:
- Happy path, students: a file with a title row, headers in a different order, a Name column, 5 students in 2 classes, siblings sharing a mother, and a parent already in the school gives 5 "will add" rows. Confirm adds 5 students with numbers, 5 enrolments, the shared mother once with 2 children, and links the existing parent. Verifies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-7**, **AC-9**.
- Upload again: after Confirm, the same file gives 5 "already here" (or "probably here" without admission numbers), and Confirm adds nothing. A fixed problem row is the only addition. Verifies **AC-6**, **AC-9**.
- Problems: an unknown class, a switched off class, gender "X", a bad parent phone, a parent name without a phone, and a repeated admission number on two rows each give a problem with the right Excel row number. None is saved, the valid rows are. Verifies **AC-4**, **AC-5**, **AC-6**.
- Probably here: a name matching an open enrolment is skipped unless ticked. Two same name rows in one class: the second needs a tick. Verifies **AC-6**.
- Reader: `.xls` bytes refused with the save as message, a Windows-1252 CSV refused, a semicolon CSV with a byte order mark read with `00123` kept as text, a phone saved as the number 8031234567 read as +2348031234567, a formula cell read as its result, a `#N/A` cell a row problem, a non breaking space inside an admission number matched as a plain one, a header row plus 1,501 rows refused, two Phone columns refused. Verifies **AC-2**, **AC-3**.
- Class matching: "jss2 gold", "J.S.S 2 Gold" and "JSS 2G" match JSS 2 Gold; "JSS 2G" with both Gold and Green is unknown; "SS 1A" never matches SS 11 A. Verifies **AC-4**.
- Parents on one row: "Mrs Ngozi Okafor" in Parent 1 and "Ngozi Okafor" as Mother with the same phone become one parent, not a link error. Verifies **AC-5**, **AC-7**.
- Concurrency: the term made current between preview and Confirm gives `term_changed`; a file swapped between preview and Confirm gives `file_changed`; a student typed meanwhile that turns a row into "probably here" gives `plan_changed` with the new preview. A typed student taking an admission number during Confirm rolls the whole import back. Each saves nothing. Verifies **AC-9**.
- Teachers: a new teacher gets a staff record and a waiting login. A known phone is "already here" and its Form class applies. A left teacher gets the note. A login in another school is skipped unless ticked. A class with a form master is unchanged with the note. Two rows with one form class apply neither. Verifies **AC-11**, **AC-12**.
- Undo: a student run is removed fully (no student, enrolment, link, orphan parent or photo left, while an earlier parent linked to an imported sibling stays). It is refused once one imported student has a `score_change` row. A teacher run is refused once a teacher set a password. A teacher run that reused a team member's login (no staff record) removes the staff record and keeps the login. A form master changed by hand after the import is not removed by undo. Undoing twice is refused. Verifies **AC-13**, **AC-14**, **AC-15**.
- Template: the download lists the school's active classes in the dropdown, and uploading it untouched gives "no rows to add". Verifies **AC-1**.
- Auth/permission: a teacher gets not found on the pages, the template, the route handler and `undoImportAction`. A view as session's commit and undo are refused. A run id from another school is not found. Verifies **AC-16**.

## Build plan

Skateboard: first the thinnest whole that loads a real school's students (upload, preview, confirm), then what makes it comfortable (template, history, undo), then teachers.

1. [x] Migration `0010_import_run`: the `import_kind` enum, the `import_run` table, with `created_logins` and its list index, and `import_run_id` with composite foreign keys and partial indexes on `student`, `guardian`, `staff` and `class_teacher`; schema in `src/db/schema/` and the data layer `index.ts` exports; `setFormTeacher` clears `import_run_id` in its upsert. Satisfies **AC-13**, **AC-15**.
2. [x] Pure import core in `src/lib/import/` (header search and aliases, every ExcelJS cell shape to text, the UTF-8 CSV parser, name split, gender, relationship, title split, class matching, repeats within the file), and the student, teacher and parent field checks (with the parent limit and primary rule) shared with spec 0008 by exporting them from their modules. Unit tests. Satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-11**.
3. [x] Student import end to end: add `exceljs` (server only, check that it bundles), `readWorkbook` (streaming `.xlsx`, own CSV), `planStudentImport`, `commitStudentImport` (one transaction, fingerprints, bulk parent links, batch inserts, run record), the POST route handler with the Origin check and error codes, and the Students import screen with preview, Add anyway ticks, Confirm and the result screen; "Import from Excel" on the Students page. Satisfies **AC-2**, **AC-4** to **AC-10**, **AC-16**.
4. [ ] Student template download (route handler, class dropdown from a hidden list sheet, How to fill sheet). Satisfies **AC-1**.
5. [ ] Recent imports list and undo for student runs (`listImportRuns`, `undoImport`, `undoImportAction`, confirm dialog). Satisfies **AC-13**, **AC-14**, **AC-16**.
6. [ ] Teacher import: `planTeacherImport` and `commitTeacherImport` with logins and form classes, the Staff import screen with Same person ticks, the teacher template, and undo for teacher runs that removes only the logins in `created_logins`, with auth events. Satisfies **AC-1**, **AC-11**, **AC-12**, **AC-13**, **AC-15**, **AC-16**.
7. [ ] Tests for every scenario above (database tests in `inRollback`, small `.xlsx` and CSV fixtures built in the test with ExcelJS, component tests for the preview table and ticks). Satisfies **AC-1** to **AC-16**.

## Consequences

**Positive**:
- A school's whole register, with parents and teachers, goes in from the files it already keeps, in a few uploads.
- Uploading again is always safe, so the fix loop is simply "edit in Excel, upload again".
- An imported row and a typed row obey one set of rules, so the two can never drift apart.
- A wrong file is undone in one click, with no database restore.

**Negative / tradeoffs**:
- The preview is read only. Every fix, even one typo, means editing in Excel and uploading again.
- Import never updates existing students, so a sheet can't bulk fix names, classes or parents. Those are fixed one by one in the student panel.
- A student without an admission number whose name matches can be skipped as "probably here" when they are really new (the tick is the way out), and a misspelled name in a later upload can add a duplicate that "Remove, added by mistake" then has to clear.
- The name split guesses the surname from the first word. A school that writes first names first must use separate columns (the preview shows the split so it is caught).
- Undo stops being possible once results exist. A wrong import found after scores are in is fixed student by student.
- A teacher undo is blocked as soon as one teacher finishes their login setup.
- Confirm reads and checks the file twice, about a second more for a big school. That's accepted to avoid a staging table.
- Confirm is refused when anything changed since the preview (file, term, or any row's outcome), so a busy school can need a second preview. That's the price of saving exactly what was shown.
- ExcelJS is slow to release (spec 0001). The reader is one module, so it can be swapped.

**Neutral**:
- Spec 0001's Backups row ("a Neon branch snapshot before every Excel import") is replaced by import run undo. The nightly `pg_dump` stays.
- Spec 0008's follow up (import reuses the typed rules) is met by the shared checks, rather than by calling `addStudent` per row (one transaction and batched inserts instead of hundreds of small ones).
- Four tables gain a nullable `import_run_id` that typed rows leave empty, and `setFormTeacher` (spec 0008) now clears it.
- CSV is read by a small parser of our own, not ExcelJS (whose CSV reader changes text into numbers and dates). ExcelJS still reads every `.xlsx`, as spec 0001 chose.

## Follow-up

- [ ] `/sync` should update spec 0001's Backups row to say the snapshot before imports is replaced by spec 0013's undo.
- [ ] Broadsheet export (#16) can reuse the ExcelJS setup and template styling from this feature.
- [ ] If schools often send registers with first names first, add a "Name order" choice on the import screen instead of guessing.
- [ ] An "Electives" column, and bulk updates of existing students, were left out on purpose. Revisit only if onboarding shows a need.
