# 0008. Enrol teachers and students

**Date**: 2026-10-17
**Status**: In Progress

## Summary

Our team adds a school's teachers on a new Staff page, and each teacher's login is created in the same step. Students are typed in class by class on a new Students page: one quick row per student, then a side panel for house, photo and parents. Each class gets its form master from its own list, senior classes get a tick grid for electives, and class lists carry forward on their own when the next term in the session becomes current. The tables already exist from spec 0003, so the only migration is a stricter admission number check.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As our team, I want to add a teacher and hand them a setup link in one step, so that onboarding a staffroom takes minutes.
- As our team, I want to type a class register in quickly, row after row, so that a 40 student class is done in one sitting.
- As our team, I want to record each child's parents once, even for siblings, so that the school can reach the right parent. Parents check results with a PIN slip on the result page (#21, Release 3), which needs no parent record; sending results on WhatsApp comes much later (#19).
- As our team, I want to fix mistakes (wrong arm, duplicate entry, a student who left), so that class lists and positions stay correct.
- As a teacher, I want to see exactly my class's students after signing in, so that I can start score entry (#9).

**Acceptance criteria** (the contract):
- **AC-1**: A Staff page (`/admin/schools/[schoolId]/staff`) lists every staff member with title, name, phone, login status, last sign in and the classes they head this session. The "Staff logins" block moves there from the school overview. "Add teacher" takes a title (optional, for example Mrs), a full name (3 to 80 characters) and a Nigerian mobile number (required). Every new staff member gets the `teacher` role. Saving creates the staff record and its login together, then shows the setup link (QR and WhatsApp) as the existing menu does. If the phone already has a login in another school, the spec 0004 AC-13 "same person?" confirm appears first, before anything is saved. When that login is switched off, the confirm says so, and it stays off until our team switches it on from the menu. A phone that already belongs to staff in this school is refused; when that staff member has left, the message points to "Mark as active again".
- **AC-2**: Our team can fix a teacher's title and name. For a teacher with a login, the phone changes only through the existing "Change phone" (which updates the login and the staff record in every school of that login). It is refused, before anything changes, when the new number already belongs to other staff in any of those schools, and the update runs in one transaction. For a teacher without a login, the phone is edited directly, with the same rules as AC-1.
- **AC-3**: "Mark as left" shows a confirm that names the classes the teacher heads this session ("JSS 2 Gold will have no form master"). Saving sets the staff record to left and removes them as form master of this session's classes. Their login is switched off only if they have no active staff record in another school, and never when the login is the team member's own. Earlier sessions are unchanged. "Mark as active again" restores the staff record only: classes are not reassigned, and a switched off login is switched on from the existing menu.
- **AC-4**: A Students page (`/admin/schools/[schoolId]/students`) lists every active class, grouped by section, with its number of students this term and its form master. Each class opens its class list (`/admin/schools/[schoolId]/students/[classId]`). At the top of a class list, a picker sets the class's form master (or class teacher, using the section's teacher title) for the current session, from the school's active teachers, or "None yet". A class has at most one form master per session. A teacher may head several classes.
- **AC-5**: The class list always works on the current term. Without a current term, the page says to set one first and offers no add row. Under the list, a quick add row takes surname, other names, gender (all required) and admission number (optional). Enter saves. The row then clears and the cursor goes back to surname. Each new student gets the school's next student number (shown as the school code plus four digits, for example GHS-0123) and an enrolment in this class for the current term. A save that fails keeps the typed row.
- **AC-6**: Admission numbers are stored as typed (trimmed; empty means none) and are unique within a school, ignoring case and spaces: once GHS/24/015 exists, `ghs/24/ 015` is refused, naming the student who has it. Adding a student whose surname and other names match one already in this class this term (ignoring case) warns "There is already an OKAFOR Chinedu in JSS 2 Gold. Add anyway?" and saves only on yes.
- **AC-7**: Tapping a student opens a panel (a full screen sheet on a phone) showing their student number and these parts. Details: surname, other names, gender, admission number and house (optional, up to 30 characters), editable with the AC-6 rules. Photo: upload, replace or remove. The browser crops the photo to a 3 by 4 passport shape and shrinks it to about 300 by 400 pixels as a JPEG. The server accepts only a JPEG of at most 100 KB, saves it as a `student_photo` asset, and deletes the old one on replace or remove. Photos are shown only to our team. Parents (AC-8). Electives taken this session (read only, from AC-9). Class actions (AC-10 to AC-12).
- **AC-8**: A student has at most two parents and exactly one primary while they have any. The first parent added becomes primary, "Make primary" switches it, and unlinking the primary makes the other parent primary. A parent needs a full name (3 to 80 characters), a Nigerian mobile number (stored as +234) and a relationship (mother, father or guardian). No WhatsApp consent is asked for in this feature: `whatsapp_consent` stays false and unused until WhatsApp sending (#19) is designed. When the phone typed already belongs to a parent in this school, the form offers "Mrs Ngozi Okafor, parent of Okafor Chidi (JSS 1 Gold). Same person?". Yes links this child to that parent, No saves a new parent with the same phone. Editing a parent linked to several children shows "Also parent of …" and changes the parent for all of them. "Remove from this student" unlinks the parent. A parent left with no children is deleted. The class list marks students with no parent yet.
- **AC-9**: A class whose offer this session includes electives (spec 0006) has an Electives grid: its open students down the side, its elective subjects across the top, one tick per student per subject. Saving registers the ticked electives for this session and removes the unticked ones, touching only this class's elective subjects (an elective kept after a move, AC-10, is left alone). Unticking a subject the student has scores in this session, in any term, is refused, naming the student, subject and score count, and nothing in that save is applied. A student may take no electives.
- **AC-10**: "Move to another class" moves a student's current term enrolment to another active class of the school. It is allowed only while that enrolment has no scores. Otherwise it is refused with the number of scores. A move into a class of another section is also refused while the enrolment has ratings (traits can belong to a section, spec 0003). Remarks and attendance follow the enrolment. Electives the new class does not offer are removed, unless the student has scores in them this session, in which case they are kept.
- **AC-11**: "Mark as left" takes a date (today by default, not in the future, not before the current term starts). It sets the student to left with that date and withdraws their current term enrolment from that date. They drop off the class list, the teacher's list and later position counts, and earlier terms stay intact (spec 0003, AC-10). Students whose current term enrolment in this class is withdrawn appear in a collapsed "Left this term" group on the class list, with Undo, which restores the student and the enrolment. A student who left in an earlier term was not carried forward (AC-13) and does not appear here; bringing them back is a follow-up.
- **AC-12**: "Remove, added by mistake" is offered only while the student has no scores, score history, remarks or ratings in any term. It deletes the student's enrolments, electives, parent links, parents left with no children, and photo, then the student, all in one transaction. A student number is never handed out again. Any other student can only be marked as left.
- **AC-13**: Making a term current carries class lists forward inside the same transaction. When a term with an earlier term in the same session becomes current, the latest earlier term in that session with any enrolments is the source. Every open enrolment of an active student in a class that is still active is copied into the same class for the new term, skipping students who already have an enrolment in the new term. Running it twice copies nothing new. Making an earlier term, or a term of another session, current copies nothing (promotion to a new session is #18). The Terms page then says how many students were carried forward, and how many were not because their class is switched off. A student added while the term is switching is enrolled in whichever term is current when their save commits (the add reads the current term with a share lock inside its transaction).
- **AC-14**: A signed in teacher's class card on the school home opens `/{school}/classes/[classId]`, a read only list of that class's open students this term (admission number, name, gender), surname first. Only their own form classes this session open; any other class is not found. Teachers see no photos, no parents and no edit controls.
- **AC-15**: The setup checklist gains two items. Staff is done when every active class has a form master for the current term's session. Students is done when every active class has at least one open enrolment in the current term. Each item names the classes still missing (for example "JSS 1 Blue and SS 1 Arts still need a form master").
- **AC-16**: Every write here is for our team only. Anyone else gets not found, and while viewing as someone, every write is refused (spec 0004). Every id from a form (class, student, enrolment, parent, staff, subject, asset) is checked within the school. Parent phones and student photos are never served publicly.

## Decision

**Chosen option**: Option 1: class by class admin screens over the existing tables, with carry forward inside the term switch.

Our team works one class at a time: a quick add row for speed, a side panel for everything else, and an electives grid for senior classes. Teachers get their own Staff page with the login made in the same step. The existing spec 0003 tables hold everything, and one migration makes the admission number check ignore case and spaces.

**Implementation skills**: `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

## Feature design

**Data model sketch** (existing tables from spec 0003 and 0004; one migration):

| Table | Fields this feature writes | Rules |
|---|---|---|
| `staff` | `title` (null), `full_name`, `phone` (+234), `role` = `teacher`, `status`, `user_id` | `unique (school_id, phone)` exists. Created by `addTeacher`, login linked by `createLoginForStaff` (spec 0004) |
| `class_teacher` | `session_id`, `class_id`, `staff_id` | `unique (session_id, class_id)` exists. Upsert on that key; "None yet" deletes the row. Only active staff can be chosen |
| `student` | `student_no`, `admission_no` (null), `surname`, `other_names`, `gender`, `house` (null), `photo_asset_id` (null), `status`, `left_on` | **Migration**: drop `student_school_admission_key`, add unique index `student_school_admission_norm_key` on `(school_id, upper(regexp_replace(admission_no, '\s', '', 'g')))` where `admission_no is not null`. Names and house trimmed, inner spaces collapsed |
| `asset` | `kind` = `student_photo`, `mime_type` = `image/jpeg`, `bytes`, `width`, `height` | One per student at most. JPEG only for this kind, at most 100 KB, 120 to 800 pixels per side |
| `guardian` | `full_name`, `phone` (+234) | `whatsapp_consent` and `consent_recorded_at` are left at their defaults (false, null). Deleted when its last `student_guardian` link goes |
| `student_guardian` | `relationship`, `is_primary` | At most two per student (`linkGuardian` lock), one primary (partial unique index exists) |
| `enrolment` | `term_id`, `session_id`, `class_id`, `section_id`, `withdrawn_on` (null) | `unique (student_id, term_id)` exists. Class may change only while it has no `score` rows |
| `student_elective` | `student_id`, `session_id`, `subject_id` | `unique (student_id, session_id, subject_id)` exists. Subject must be an elective `class_subject` of the student's class this session |

Relationships (unchanged): school 1:N staff, students, parents; class 1:1 form master per session, staff 1:N classes; student 1:N enrolments (one per term); student N:M parents (at most two per student); student 1:N electives per session; student 0..1 photo.

**State transitions**:
- staff: active → left (unassigned from this session's classes; login off if no other active school) → active (no classes restored).
- student: active → left (with date; current enrolment withdrawn) → active (Undo). Active with no records → deleted ("added by mistake").
- enrolment: open → moved (class changed, only without scores) · open → withdrawn → open.
- guardian: linked to 1 or 2 children → unlinked from its last child → deleted.
- term made current: enrolments copied forward from the latest earlier term of the same session (AC-13).

**API surface** (admin pages call `requireTeamSchoolContext`; data functions take a `SchoolContext`, start with `assertTeam` plus `assertWritable` for writes, and return `FormResult`; server actions in `src/app/admin/schools/enrol-actions.ts`):

| Surface | Kind | Key inputs | Result | Who | Key errors |
|---|---|---|---|---|---|
| `/admin/schools/[schoolId]/staff` (new) | page | none | staff list with login status and classes this session; add form | our team | not found |
| `addTeacher` (new, `staff.ts`) | data + action | title?, fullName, phone, confirmSamePerson | staff row, then `createLoginForStaff`; returns staff id and setup link data | our team | phone not Nigerian; already staff here; needs same person confirm |
| `saveTeacher` (new) | data + action | staffId, title?, fullName, phone? (only without a login) | saved | our team | name length; phone taken in school |
| `setStaffLeft` (new) | data + action | staffId, left: boolean | status set; this session's `class_teacher` rows removed; login switched off when no other active school | our team | not found |
| `/admin/schools/[schoolId]/students` (new) | page | none | classes by section with count and form master | our team | not found |
| `/admin/schools/[schoolId]/students/[classId]` (new) | page | none | form master picker, roster, quick add, left group, electives grid, student panel | our team | not found; no current term |
| `setFormTeacher` (new) | data + action | classId, staffId or null | `class_teacher` upserted or deleted for the current session | our team | staff left or not in school |
| `getClassRoster` (new, `students.ts`) | data | classId | current term open and left enrolments with student, parent count, photo flag, electives | our team | not found; `NoCurrentTerm` |
| `addStudent` (new) | data + action | classId, surname, otherNames, gender, admissionNo?, confirmDuplicate | student with next number, enrolment in current term | our team | admission number taken (names holder); same name warning; no current term |
| `saveStudent` (new) | data + action | studentId, names, gender, admissionNo?, house? | saved | our team | admission number taken; lengths |
| `saveStudentPhoto` / `removeStudentPhoto` (new) | route handler `POST /admin/schools/[id]/images` with `kind=student_photo&studentId` / action | JPEG bytes | asset saved, old one deleted | our team | not a JPEG; over 100 KB; size out of range |
| `findGuardiansByPhone` (new, `guardians.ts`) | data | phone | parents in this school with that phone, each with their children and classes | our team | phone not Nigerian |
| `addGuardian` (new) | data + action | studentId, fullName, phone, relationship, linkTo? (existing guardian id) | new parent linked, or existing parent linked (via `linkGuardian`) | our team | two parents already; lengths |
| `saveGuardian` / `unlinkGuardian` / `makePrimaryGuardian` (new) | data + action | guardianId (+ studentId) | saved for all children / unlinked (orphan deleted) / primary switched | our team | not found |
| `moveStudent` (new) | data + action | enrolmentId, toClassId | class and section changed; electives pruned (AC-10) | our team | has N scores; class inactive |
| `setStudentLeft` (new) | data + action | studentId, leftOn or null (Undo) | student status and enrolment withdrawal set or cleared | our team | date in future or before term |
| `removeStudent` (new) | data + action | studentId | everything in AC-12 deleted | our team | has records |
| `saveClassElectives` (new) | data + action | classId, ticks: `{ studentId, subjectId }[]` | the class's electives for this session replaced | our team | unticked elective has scores |
| `setCurrentTerm` (changed, `terms.ts`) | data | termId | flag moved; enrolments carried forward; returns `{ carried: number }` | our team | not found |
| `/{school}/classes/[classId]` (new) | page | none | read only list from `listClassStudents` | form master, our team | not found |
| `getSchoolSetup` / overview (changed) | data + page | none | Staff and Students checklist items (AC-15) | our team | none |

The duplicate name warning (AC-6) and the sibling offer (AC-8) come back from the server as a result the form turns into a confirm; the second call carries `confirmDuplicate` or `linkTo`. The leave and remove confirms are shown in the browser only, as in spec 0007.

**Key invariants**:
- Student numbers come only from `allocateStudentNumbers`, called with a context bound to the transaction that inserts the student (`{ ...ctx, db: tx }`), so two people adding at once never clash and a number is never reused.
- One enrolment per student per term; carry forward uses `on conflict (student_id, term_id) do nothing`, so it is safe to repeat.
- An enrolment with scores never changes class. `moveStudent` locks the enrolment (`for update`), counts `score` rows on it, and sets `class_id` and `section_id` in one update (the class link is composite), so a score saved meanwhile cannot slip past.
- A student with any `score`, `score_change`, `term_report` or `rating` row is never deleted. `removeStudent` locks the student and their enrolments (`for update`), checks all four, then deletes in order: parent links (and orphaned parents), electives, enrolments, the student, then the photo asset. A foreign key error during the delete is reported as "has records".
- At most two parents per student and exactly one primary while any. Adding a parent (new or linked) is one transaction: lock the student, lock the existing parent when linking, count links, set primary when the count is 0, insert. `linkGuardian` is refactored to run inside a caller's transaction and decide primary itself, so no parent row is left behind when the limit refuses. "Make primary" clears the old primary before setting the new one (the partial unique index is not deferrable). Unlinking locks the parent row, promotes the other parent when the primary goes, and deletes the parent when it has no children left.
- A teacher marked left can't be picked as form master: `setStaffLeft` locks the staff row `for update`, `setFormTeacher` locks it `for share` and checks the status after the lock.
- `addTeacher` saves nothing until the phone checks pass: refuse a phone already used by staff in this school, then look up an existing login for that phone and return the same person confirm, and only then insert the staff row and link or create the login.
- Admission number clashes caught by the database (a unique violation, code 23505, from two saves at once) are turned into the same message as the app check, naming the holder. An admission number of only spaces is saved as none.
- An elective registration always matches an elective the student's class offers this session, except one kept after a move because it has scores (AC-10). The database has no link from `student_elective` to `class_subject`, so this holds in app code only and is covered by a test.
- A teacher who has left heads no class in the current session.
- The admission number index normalises the same way the app compares (upper case, no whitespace), so the database is the final judge.

**Security model**:
- Children's personal data (names, photos, parents' names and phones) under the Nigeria Data Protection Act. It stays in the Neon project in London (spec 0003). Photos and parent phones are team only, never served on a public route or shown to teachers in this release.
- Writes: our team only (`assertTeam`), refused while viewing as (`assertWritable`). Teachers get not found for every admin page and action.
- Teacher reads: `listClassStudents` already calls `assertClassAccess` (spec 0004), so a teacher opens only their form classes this session.
- Every id is looked up with `school_id = ctx.schoolId`; composite foreign keys (spec 0003) refuse cross school rows if a check is missed.
- Login creation and its audit events reuse spec 0004 (`createLoginForStaff`, `logAuthEvent`). Switching off a leaving teacher's login is logged the same way.

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: add a teacher (login created, setup link returned), make them form master of JSS 2 Gold, quick add three students, and the teacher's class page lists exactly those three; verifies **AC-1**, **AC-4**, **AC-5**, **AC-14**.
- Admission number: `GHS/24/015` then `ghs/24/ 015` refused naming the first student; same name in class returns the warning and saves on confirm; verifies **AC-6**.
- Siblings: a second child's parent with the same phone offers the existing parent; linking makes one record with two children; unlinking from both deletes it; a third parent is refused; verifies **AC-8**.
- Concurrency: two `addStudent` calls at once get different student numbers; a move racing a score save is refused once the score exists; verifies **AC-5**, **AC-10**.
- Remove: refused for a student with one `score_change` row; allowed otherwise and leaves no enrolment, link, orphan parent or photo; verifies **AC-12**.
- Leaving: marking a student left drops them from `listClassStudents` and Undo restores them; marking a teacher left clears this session's `class_teacher` rows and switches the login off only without another active school; verifies **AC-3**, **AC-11**.
- Electives: unticking an elective with scores refuses the whole save; a move to a class without that elective keeps it only when it has scores; verifies **AC-9**, **AC-10**.
- Carry forward: making Second Term current copies First Term's open enrolments of active students into the same classes, skips one already enrolled, copies nothing on a second run or for an earlier term; verifies **AC-13**.
- Checklist: Staff unfinished while one active class lacks a form master, Students unfinished while one active class is empty, each naming the class; verifies **AC-15**.
- Auth/permission: a teacher gets not found for every admin action and for another class's page; a view as session's writes are refused; a student id from another school is not found; verifies **AC-14**, **AC-16**.

## Build plan

Skateboard: first the thinnest whole that lets a teacher see their class (teacher, form master, quick add), then the tools for fixing records, then electives and the next term.

1. [x] Migration `0008_admission_number_norm` (`alter table student drop constraint student_school_admission_key`, then add the normalised unique index) and the schema change in `src/db/schema/students.ts`; a JPEG check (start marker, size from the frame header) beside `readPngSize`; satisfies **AC-6**, **AC-7**.
2. [x] Staff page: `addTeacher` (phone checks and same person confirm before any insert, then login and setup link), `saveTeacher`, `setStaffLeft`; make `changePhone` (spec 0004) check every affected school for a clash first and run in one transaction; move the Staff logins block and `StaffActions` from the overview; satisfies **AC-1**, **AC-2**, **AC-3**, **AC-16**.
3. [x] Students page and class list: classes by section, `setFormTeacher` picker, `getClassRoster`, quick add with `addStudent` (number, enrolment, duplicate warning); teacher class page `/{school}/classes/[classId]` linked from the home card; satisfies **AC-4**, **AC-5**, **AC-6**, **AC-14**, **AC-16**.
4. [x] Student panel: details with `saveStudent`, photo crop and upload (route `kind=student_photo`), parents with `findGuardiansByPhone`, `linkGuardian` refactored to run in a caller's transaction, `addGuardian`, `saveGuardian`, `unlinkGuardian`, `makePrimaryGuardian`; "no parent yet" mark; satisfies **AC-7**, **AC-8**.
5. [x] Fixes: `moveStudent`, `setStudentLeft` with the "Left this term" group and Undo, `removeStudent`; satisfies **AC-10**, **AC-11**, **AC-12**.
6. [x] Electives grid with `saveClassElectives`; carry forward inside `setCurrentTerm` and the count on the Terms page; satisfies **AC-9**, **AC-13**.
7. [x] Checklist items for Staff and Students on the overview; tests for every scenario above (database tests in `inRollback`, component tests for the quick add row and panel forms); satisfies **AC-15** and **AC-1** to **AC-16**.

## Consequences

**Positive**:
- The pilot school can be fully enrolled by our team in a few sittings, and each teacher sees their class right away.
- Second Term needs no retyping: lists carry forward when the term switches.
- Siblings share one parent record, so a changed phone is fixed once.
- No new tables; the stricter admission check is enforced by the database itself.

**Negative / tradeoffs**:
- A student with scores can't change class in that term; a late arm change needs scores cleared first (a rare case accepted for now).
- Carry forward runs inside the term switch, so making a term current by mistake fills that term; switching back leaves the copied enrolments in place (harmless, they hold no scores, but they show if that term is made current again).
- Admin lists work only on the current term; enrolling ahead into a future term is not possible.
- An active class kept empty on purpose leaves the Students checklist item unfinished; the way out is switching that class off.
- In a new session (September 2027), form masters and class lists start empty until promotion (#18) exists; carry forward works only within a session.
- A student who left in an earlier term can't be brought back from these screens yet.
- Teachers can't fix a misspelled name themselves; every change goes through our team.
- Photos add up to about 30 KB per student to the database (about 6 MB per 200 students).
- No change log for student or parent edits beyond `updated_at`.
- When WhatsApp sending (#19) arrives, consent has to be collected for every parent then, in a second pass.

**Neutral**:
- The school overview loses its Staff logins block; it now lives on the Staff page.
- Spec 0003, AC-10 ("students are never deleted") is narrowed to "never deleted once they have any results record" (AC-12).
- Spec 0006's follow-up (register electives per student) is met by AC-9.
- Spec 0004's follow-up (create login in the same step as the staff member) is met by AC-1.

## Follow-up

- [ ] Excel import (#13) should reuse `addStudent`, `addGuardian` and the admission number rules, so a sheet and a typed row behave the same.
- [ ] Score entry (#9) builds on `/{school}/classes/[classId]` and must refuse scores for withdrawn enrolments and unregistered electives (spec 0003 already enforces both).
- [ ] WhatsApp sending (#19) designs how parents' consent is collected and proven (who recorded it, when) under the Nigeria Data Protection Act.
- [ ] Promotion into a new session (#18) decides how class lists move between sessions; carry forward here stays within one session.
- [ ] Re-admit a student who left in an earlier term (a "Left the school" list with "Re-admit into class"); not needed before First Term results.
- [ ] `/sync` should note in spec 0003 that AC-10 is narrowed by spec 0008, AC-12.
