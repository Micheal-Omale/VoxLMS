# 0003. Core data model for schools, terms, students and scores

**Date**: 2026-10-16
**Status**: Proposed

## Summary

This is the shape of the database every release builds on: schools and their sections, sessions and terms, classes, subjects, staff, students, parents, and the scores teachers enter. Every record belongs to exactly one school, and the database itself refuses to link one school's records to another's, or a score to the wrong term, session or class. Results (totals, grades, positions) are worked out from the scores when needed, never stored, so they cannot drift. Building it means one first migration, seed data, and a small set of school scoped functions that all later features call.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As our onboarding team, I want to set up a school's sections, classes, subjects, score split and grade scale once per session, so that teachers can start entering scores.
- As a form teacher, I want my class list and each student's scores for this term, so that I can enter and correct them quickly.
- As a parent (indirectly, through the report card), I want my child's scores to be exactly what the teacher entered, with no blank silently turned into 0.
- As the school, I want one school's children's records never to be visible to another school.

**Acceptance criteria** (the contract):
- **AC-1**: The first migration creates every table in the data model below, and `drizzle-kit migrate` runs clean on a fresh Neon branch. Later changes are add only (new tables, new nullable columns, new constraints that existing data meets).
- **AC-2**: Every school owned table has a required `school_id`. Every link between school owned tables includes `school_id`, so a row linking school A's student to school B's class is refused by the database. A score whose subject belongs to a different class or session than the student's enrolment, or whose part belongs to a different session, is also refused by the database.
- **AC-3**: Every read and write of school data goes through the data access layer, which requires a school context. With school B's context, no function ever returns or changes school A's rows (tested for students, scores and reports).
- **AC-4**: A score is typed as up to three digits with at most one decimal place (`^\d{1,3}(\.\d)?$`), from 0 up to its part's maximum. Anything else (for example `12.35`, `-1`, `abc`) is refused, never rounded. A score above the maximum is refused with a message naming the part and its maximum. A missing score is the absence of a row, never 0. Clearing a score removes its row. The part must belong to the class's section and the subject's session.
- **AC-5**: Saving a class's scores for one subject is all or nothing. Each change carries the value the teacher last saw; if the stored value has changed since (another save got there first), the whole save is refused with a conflict listing the students affected, and nothing is written. Re-sending a save that already landed changes nothing and logs nothing. Each real change writes one `score_change` row (old value, new value, who, when, which save) in the same transaction. The change log is add only.
- **AC-6**: A student has at most one enrolment per term, and can be in a different class in another term. A student's results for the three terms of a session can be read together, and terms they were not enrolled in come back as absent, not zero.
- **AC-7**: The score split and the grade scale are set per section per session, where a section is exactly one stage (the pilot has three: Primary, Junior Secondary, Senior Secondary). Changing a grade band changes the grades shown for that section and session only, never another session.
- **AC-8**: A class offers subjects per session, each compulsory or elective. Electives are registered per student, per session, per subject (so they survive a change of arm). A score for an elective can only be saved for a student registered for that subject in that session.
- **AC-9**: A parent record can link to several children, a child has at most two parents and at most one primary parent, two parents may share one phone number, phone numbers are stored in one international format (`+234…`), and WhatsApp consent is stored with the date it was given.
- **AC-10**: Students are never deleted. A student who leaves mid term has that term's enrolment marked withdrawn with a date: they drop out of current class lists and position counts from then on, and their earlier terms still appear on past reports. The student's own status (active, left, graduated) is a summary for lists.
- **AC-11**: A school's short name is 3 to 30 lowercase letters or digits, unique, and not a reserved word (the list lives in app code). Admission numbers are unique within a school; staff phone numbers (normalised) are unique within a school; at most one term per school is current.
- **AC-12**: The standard levels (Creche to SS 3) and standard subjects are seeded on every branch. Made up demo school data can be seeded on development branches only; the seed refuses to run against the production branch.

## Decision

**Chosen option**: Option 2: one shared database, `school_id` on every school owned row, composite foreign keys, and a school scoped data access layer.

Use Postgres (Neon) through Drizzle with normalised tables (one row per score part), school ownership and term, session and class consistency enforced by composite foreign keys in the database, everything else by a data access layer that requires a school context, and results computed at read time.

**Implementation skills**: `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `neon-postgres` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres/`) · `neon-postgres-branches` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres-branches/`)

## Feature design

**Conventions for every table**:
- Primary key `id uuid default gen_random_uuid()`. Timestamps `timestamptz`, stored in UTC; `created_at` on every table, `updated_at` where rows change.
- Every school owned table has `school_id uuid not null` and `unique (school_id, id)`, so children reference `(school_id, x_id)` as a composite foreign key. Tables that others must match on term, session or class also expose a wider unique key (listed below) for the same purpose.
- Foreign keys are `on delete restrict` everywhere. Nothing that holds children's records cascades. Nullable composite foreign keys are fine: Postgres skips the check while the column is null.
- Names in the database are `snake_case`; Drizzle fields are `camelCase`. Schema lives in `src/db/schema/` (one file per area) and is re exported from `src/db/schema.ts`.
- Phone numbers are normalised to `+234XXXXXXXXXX` before saving (a helper in `src/lib/phone.ts`).
- Columns are added when the feature that needs them is designed (no speculative columns): student logins, subject teachers and links to auth users arrive with their own specs as add only changes.
- Enums (Postgres enums): `stage` (`nursery`, `primary`, `junior_secondary`, `senior_secondary`), `plan` (`basic`, `school_logo`), `gender` (`male`, `female`), `student_status` (`active`, `left`, `graduated`), `staff_role` (`teacher`, `principal`, `school_admin`), `staff_status` (`active`, `left`), `guardian_relationship` (`mother`, `father`, `guardian`), `asset_kind` (`logo`, `signature`, `stamp`, `student_photo`), `rating_kind` (`behaviour`, `skill`).

**Data model sketch**:

Shared lists (no `school_id`):

| Table | Fields | Rules |
|---|---|---|
| `standard_level` | `code` text (e.g. `JSS2`), `name` text, `stage` enum, `sort_order` int | `code` unique. Seeded: CRECHE, NUR1, NUR2, KG, PRY1 to PRY6, JSS1 to JSS3, SS1 to SS3 |
| `standard_subject` | `code` text, `name` text | `code` and `name` unique. Seeded with the common Nigerian primary and secondary subjects |

School setup (all carry `school_id`):

| Table | Fields | Rules and links |
|---|---|---|
| `school` | `slug` text, `name`, `address`, `motto` (null), `phone` (null), `email` (null), `plan` enum default `basic`, `logo_asset_id` (null) | `slug` unique, `check (slug ~ '^[a-z0-9]{3,30}$')`; reserved words refused in app code. Its own `id` is the `school_id`. Logo link `(id, logo_asset_id)` to `asset (school_id, id)`; insert the school first, the logo after |
| `asset` | `kind` enum, `mime_type` text, `bytes` bytea, `width` int, `height` int | Images only, shrunk in the browser first (spec 0001). Every link to an asset is composite `(school_id, asset_id)` |
| `section` | `stage` enum, `name` text, `teacher_title` text (e.g. "Form master"), `head_title` text (e.g. "Principal"), `head_name` (null), `head_signature_asset_id` (null) | One section is exactly one stage. `unique (school_id, name)`; also `unique (school_id, id, stage)` |
| `academic_session` | `name` text (e.g. "2026/2027"), `starts_on` date, `ends_on` date | `unique (school_id, name)` |
| `term` | `session_id`, `number` smallint (1 to 3), `starts_on`, `ends_on`, `next_term_begins_on` (null), `days_opened` smallint (null), `is_current` boolean default false | `unique (session_id, number)`; `unique (school_id, id, session_id)`; partial unique index `(school_id) where is_current` |
| `class` | `section_id`, `stage` enum, `standard_level_id`, `arm` text (null), `name` text (e.g. "JSS 2 Gold"), `sort_order` int, `is_active` boolean | `unique (school_id, name)`; `(school_id, section_id, stage)` links to `section (school_id, id, stage)`; the standard level's stage must equal `stage` (data layer check); `unique (school_id, id, section_id)` |
| `school_subject` | `name` text, `short_name` text (for broadsheet columns), `standard_subject_id` (null) | `unique (school_id, name)` |
| `assessment_component` | `section_id`, `session_id`, `key` text (e.g. `ca1`), `label` text ("CA 1"), `max_score` numeric(5,1), `sort_order` int | `unique (section_id, session_id, key)`; `unique (school_id, id, section_id, session_id)`; maximums for a section and session total 100 (checked when configured); a maximum cannot be lowered below a score already saved |
| `grade_band` | `section_id`, `session_id`, `grade` text ("A1"), `min_score` numeric(5,1), `remark` text ("Excellent") | `unique (section_id, session_id, grade)` and `(section_id, session_id, min_score)` |
| `class_subject` | `session_id`, `class_id`, `section_id`, `subject_id`, `is_elective` boolean, `sort_order` int | `unique (session_id, class_id, subject_id)`; `(school_id, class_id, section_id)` links to `class`; `unique (school_id, id, class_id, session_id, section_id)` |
| `staff` | `title` text (null, "Mrs"), `full_name`, `phone` text (normalised), `role` enum, `status` enum | `unique (school_id, phone)` |
| `class_teacher` | `session_id`, `class_id`, `staff_id` | `unique (session_id, class_id)`: one form teacher per class per session |

Students and results (all carry `school_id`):

| Table | Fields | Rules and links |
|---|---|---|
| `student` | `admission_no` text, `surname`, `other_names`, `gender` enum, `date_of_birth` date (null), `house` text (null), `photo_asset_id` (null), `status` enum default `active`, `left_on` date (null) | `unique (school_id, admission_no)`; `check ((status = 'active') = (left_on is null))` |
| `guardian` | `full_name`, `phone` text (normalised, not unique: parents may share a phone), `whatsapp_consent` boolean default false, `consent_recorded_at` timestamptz (null) | `check (not whatsapp_consent or consent_recorded_at is not null)`; index `(school_id, phone)` for finding siblings' parents |
| `student_guardian` | `student_id`, `guardian_id`, `relationship` enum, `is_primary` boolean | Primary key `(student_id, guardian_id)`; partial unique index `(student_id) where is_primary`; at most two per student (data layer check, locking the student row) |
| `enrolment` | `student_id`, `term_id`, `session_id`, `class_id`, `section_id`, `withdrawn_on` date (null) | `unique (student_id, term_id)`; `(school_id, term_id, session_id)` links to `term`; `(school_id, class_id, section_id)` links to `class`; `unique (school_id, id, class_id, session_id, section_id)`; index `(term_id, class_id)` |
| `student_elective` | `student_id`, `session_id`, `subject_id` | `unique (student_id, session_id, subject_id)`; the subject must be offered as an elective to the student's class (data layer check) |
| `score` | `enrolment_id`, `class_subject_id`, `component_id`, `class_id`, `session_id`, `section_id`, `value` numeric(5,1), `updated_by` text (user id), `updated_at` | `unique (enrolment_id, class_subject_id, component_id)`; `(school_id, enrolment_id, class_id, session_id, section_id)` links to `enrolment`; `(school_id, class_subject_id, class_id, session_id, section_id)` links to `class_subject`; `(school_id, component_id, section_id, session_id)` links to `assessment_component`; `check (value >= 0 and value <= 100)`; no row means missing |
| `score_change` | `save_id` uuid, `enrolment_id`, `class_subject_id`, `component_id`, `old_value` (null), `new_value` (null), `changed_by` text, `changed_at` | Composite links to `enrolment`, `class_subject` and `assessment_component` (never deleted); no link to `score` (the score row may be removed). Add only: the data layer never updates or deletes it. `save_id` groups one save |
| `term_report` | `enrolment_id`, `teacher_remark` (null), `head_remark` (null), `days_present` smallint (null), `updated_by`, `updated_at` | `unique (enrolment_id)`; composite link to `enrolment` |
| `rating_trait` | `section_id` (null means all sections), `kind` enum, `name`, `sort_order`, `retired_at` (null) | `unique (school_id, kind, name)`; never renamed once used, retired instead |
| `rating` | `enrolment_id`, `trait_id`, `value` smallint | `unique (enrolment_id, trait_id)`; `check (value between 1 and 5)`; the trait's section (if set) must match the enrolment's section (data layer check) |

Relationships (all one to many unless stated): school to every school table; section to class, assessment_component, grade_band; academic_session to term, class_subject, assessment_component, grade_band, class_teacher, student_elective, enrolment; class to class_subject, class_teacher, enrolment; school_subject to class_subject and student_elective; student to enrolment and student_elective; student and guardian many to many through student_guardian; enrolment to score, term_report, rating; class_subject and assessment_component to score.

**State transitions**:
- student: `active` to `left` or `graduated` (sets `left_on`); `left` back to `active` when a student returns (clears `left_on`). Nothing is deleted.
- enrolment: open, then withdrawn (`withdrawn_on` set) when a student leaves mid term; withdrawn back to open if it was a mistake.
- staff: `active` to `left` and back.
- term: at most one `is_current` per school; making a term current clears the flag on the others in the same transaction.

**API surface** (server only functions in `src/server/data/`, each taking a `SchoolContext` first; pages and Server Actions call these, never `db` directly):

| Function | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|
| `getCurrentTerm(ctx)` | none | term with its session | school context | `NoCurrentTerm` |
| `listClassStudents(ctx, { termId, classId })` | term, class | enrolments not withdrawn, with student names, ordered by surname | school context | `NotFound` for a class outside the school |
| `getScoreSheet(ctx, { termId, classSubjectId })` | term, class subject | students taking the subject, the section's parts with maximums for that session, scores by student and part, grade bands | school context | `NotFound` |
| `saveScores(ctx, { termId, classSubjectId, saveId, changes })` | `saveId` uuid; changes: `{ studentId, componentKey, expected: string or null, value: string or null }[]` | changed count, `updatedAt` | school context with a user | `InvalidScore`, `ScoreAboveMaximum { componentLabel, max, value }`, `NotTakingSubject`, `Conflict { studentIds }`, `NotFound`; any error saves nothing |
| `getStudentSessionResults(ctx, { studentId, sessionId })` | student, session | per term: enrolment (or absent), scores by subject and part | school context | `NotFound` |
| `setCurrentTerm(ctx, { termId })` | term | none | our team (checked by the logins spec) | `NotFound` |
| `readSnapshot(ctx, fn)` | a function of reads | its result | school context | none |

`SchoolContext` is `{ schoolId, userId, db }`. `db` defaults to the shared client; tests pass a transaction that is rolled back. Until logins exist (#5), only seeds and tests build a context. `readSnapshot` runs its reads in one read only, repeatable read transaction, so a class PDF and its broadsheet see exactly the same scores (#12, #16).

**How `saveScores` works** (inside one transaction):
1. Check every value against `^\d{1,3}(\.\d)?$` (or null to clear) before any database work.
2. Resolve each `componentKey` through the class's section and the class subject's session; check each student is enrolled (not withdrawn) in that class and term, and registered if the subject is elective.
3. Lock the existing score rows for these students, subject and parts (`select … for update`).
4. For each change, compare the locked value with `expected`. Any mismatch: refuse the whole save with `Conflict`. A change whose new value equals the stored value is skipped (no write, no log), so a retry is harmless.
5. Insert, update or delete each changed score; a unique violation on insert (two first saves at once) is reported as `Conflict`. Write one `score_change` row per real change with the same `saveId`.

**Key invariants**:
- No row ever links records of two schools, and no score links a subject, part or enrolment from a different class, session or section (database, composite keys).
- A missing score is no row; totals and grades are only computed when every part is present (feature #10 owns the maths).
- `score.value` never exceeds its part's `max_score` and is never rounded from what was typed (data layer, inside the save transaction).
- Every score insert, update or removal has exactly one matching `score_change` row in the same transaction.
- At most one current term per school; at most two parents and one primary parent per student; one enrolment per student per term; one form teacher per class per session.
- Setting up a new session creates new parts and grade bands; past sessions' rows are never edited.

**Security model**:
- Children's records (names, dates of birth, photos, scores, parents' phone numbers) are personal data under the Nigeria Data Protection Act. They stay in the Neon project in London; demo and development branches hold only made up data.
- Isolation is enforced twice: composite foreign keys in the database, and the data access layer, which always filters by `ctx.schoolId`. Row level security in Postgres is the deferred runner up (spec 0001).
- Who may call which function (teacher only for their own class, our team for setup) is decided by the logins spec; this spec guarantees the school boundary and the audit trail for scores.
- Score changes are audited (`score_change`). No secrets are stored in the database.
- Transactions never wait on anything outside the database (no network calls inside a transaction); the shared pool is already attached to Vercel's lifecycle (`src/db/index.ts`).

**Configuration required**:
- `DATABASE_URL` and `DATABASE_URL_UNPOOLED` must point at a **development** Neon branch locally, not `production` (today `.env.local` points at production).
- `ALLOW_DEMO_SEED`: set to `1` to allow the demo school seed; the seed also refuses when `NEON_BRANCH` is `production`.

**Critical test scenarios**:
- Happy path: seed the demo school, save CA 1, CA 2 and Exam for a class subject, read the sheet back with the same values; verifies **AC-1**, **AC-4**, **AC-12**.
- Failure case: a save with one score above its maximum among valid ones saves nothing and names the part; `12.35` is refused, not rounded; verifies **AC-4**, **AC-5**.
- Failure case: two saves start from the same old value; the second gets `Conflict` and changes nothing; re-sending the first changes nothing; verifies **AC-5**.
- Failure case: insert a score whose subject belongs to SS 1 Science while the enrolment is JSS 2 Gold, and an enrolment joining school A's student to school B's class, directly in SQL; both refused; verifies **AC-2**.
- Auth/permission: with school B's context, `getScoreSheet` and `listClassStudents` for school A's class return `NotFound`; verifies **AC-3**.
- Edge: a student who joined in second term returns first term as absent; a student withdrawn mid term two drops out of the term two list but keeps term one; verifies **AC-6**, **AC-10**.
- Edge: changing a grade band in 2026/2027 leaves 2025/2026 grades unchanged; verifies **AC-7**.
- Edge: a senior student moved from SS 1 Science A to Science B keeps their elective and can be scored in it; an unregistered student cannot; verifies **AC-8**.
- Edge: two parents sharing one phone are both saved; a third parent for the same child is refused; verifies **AC-9**.

## Build plan

Skateboard: the smallest whole that a real save can run through first (tables, seed, one scoped save path), then the remaining helpers.

1. Create a `dev` Neon branch from `production`, point `.env.local` at it (keep production values out of the local file), and record the branch in `.neon`; satisfies **AC-12**.
2. Write the schema in `src/db/schema/` (shared lists, school setup, people, results) with enums, composite foreign keys, unique and check constraints, and the partial unique indexes; generate the first migration and apply it to the dev branch; satisfies **AC-1**, **AC-2**, **AC-11**.
3. Phone normaliser and seed script: standard levels and subjects (every branch); demo school (Grace High School: three sections, 2026/2027 with three terms, JSS 2 Gold and SS 1 Science, subjects, score split, grade bands, a teacher, 16 students with parents, two siblings sharing a parent) guarded by `ALLOW_DEMO_SEED` and the branch check; satisfies **AC-12**, **AC-9**.
4. Data access layer foundation: `SchoolContext`, typed errors, `readSnapshot`, `getCurrentTerm`, `listClassStudents`; satisfies **AC-3**, **AC-10**.
5. Score path: `getScoreSheet` and `saveScores` exactly as described above; satisfies **AC-4**, **AC-5**, **AC-8**.
6. `getStudentSessionResults` and per session grade band lookup; satisfies **AC-6**, **AC-7**.
7. Install Vitest and write the tests above against the dev branch, each inside a transaction that is rolled back; satisfies **AC-2** to **AC-11**.

## Consequences

**Positive**:
- The database itself enforces the school boundary and term, session and class consistency, so a bug in a later feature cannot leak one school's children to another or file a score under the wrong term.
- Every later feature (setup, enrolment, score entry, results, report card, broadsheet, WhatsApp links, third term) has its tables already; later changes are add only.
- Disputes about a score can be answered from the change log, grouped by save.
- Two teachers (or a flaky connection) can never silently overwrite each other's scores.

**Negative / tradeoffs**:
- Composite foreign keys make child tables carry extra copies of `school_id`, `class_id`, `session_id` and `section_id`, and make inserts more verbose.
- Computing results at read time costs some work on every report; fine for classes of 50, to be measured before adding any cache.
- Two enforcement layers (database and code) mean two places to keep in step when tables are added.
- Per session copies of the score split and grade scale mean our team must set them up each new session (a copy from last session helper is a follow up).
- A conflict makes the teacher reload the changed students before saving again; the score entry screen must explain this clearly.

**Neutral**:
- Better Auth tables, `staff.user_id`, student logins and subject teachers arrive as add only columns with their own specs.
- Third term promotion decisions become a new add only table in Release 3.

## Follow-up

- [ ] Logins spec (#5): add `staff.user_id` (link to the auth user) and decide who may call each data function; the platform admin role lives on the auth user.
- [ ] Results computation spec (#10): positions with ties, class averages, highest and lowest, built on `getScoreSheet`, `getStudentSessionResults` and `readSnapshot`; withdrawn enrolments are excluded from positions.
- [ ] Results computation (#10) or third term (#18): an add only way to mark a student exempt from a subject, so "missing" and "not taking" can be told apart.
- [ ] School and term setup (#6): a "copy last session's score split and grade scale" helper; refuse lowering a part's maximum below saved scores.
- [ ] Score entry (#9): send `expected` values and a `saveId` from the score sheet, and show conflicts clearly.
- [ ] Root `AGENTS.md` should record the data rules (school context everywhere, no direct `db` in pages, add only migrations); `/audit` or `/sync` owns that.
