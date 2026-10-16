# 0003. Rationale: core data model

## Context

VoxLMS holds children's school records for many schools in one app (spec 0001: one Next.js app, one Neon Postgres database). The pilot school runs Primary 1 to 6, JSS 1 to 3 and SS 1 to 3, under 200 students. Every later feature reads or writes these records: setup, enrolment, score entry, results, report cards, broadsheets, WhatsApp result links, third term cumulative results, and later student logins and a learning platform.

The forces: the records are personal data about children under the Nigeria Data Protection Act, so one school seeing another's data would be the worst possible failure. Parents check report cards line by line, so a blank score must never quietly become 0, and a disputed score must be traceable. Nigerian schools vary: score splits differ between sections, senior students take electives, students join mid year or change arms, siblings share parents, and grade scales get corrected mid session. The team is tiny and the deadline is early December 2026, so the model must be simple to build against and must not need a breaking change in Release 3 or later.

Business rules confirmed with the engineer: the form teacher enters every subject in Release 1 (subject teachers later); the score split is configurable per section; the report card shows passport photo, gender, date of birth and house; students can change class between terms; seniors pick electives; parent records are shared between siblings; every score change is logged; a grade scale change affects only that session; only teachers and our team sign in during Release 1; students who leave are kept and marked as left.

## Options considered

### Option 1: Separate database (or schema) per school

Each school gets its own Postgres schema or Neon database; the app picks the connection from the school.

**Pros**:
- Strongest isolation; a query cannot reach another school by mistake.
- A school's data can be exported or deleted as one unit.

**Cons**:
- Every migration runs once per school; a failed run leaves schools on different versions.
- Neon's free plan limits projects and compute; many small databases waste both.
- Cross school features (shared standard subjects, our admin area, the future learning platform) become awkward.

### Option 2: Shared database, `school_id` everywhere, composite foreign keys, school scoped data layer (chosen)

One set of tables. Every school owned row carries `school_id`; links between rows include `school_id` so the database refuses cross school links; all reads and writes go through functions that require a school context.

**Pros**:
- One migration, one database, simple operations for a tiny team.
- The database itself blocks the most dangerous bug (linking or exposing another school's records), not just the code.
- Shared lists (standard levels and subjects) work naturally.

**Cons**:
- Reads are only safe if every query filters by `school_id`; the data layer must be the only door.
- Composite keys add a column to every link and make inserts more verbose.

### Option 3: Shared database with Postgres row level security

Same tables as Option 2, plus row level security policies that filter by a per request school setting.

**Pros**:
- Even a raw query that forgets the filter cannot read another school.

**Cons**:
- Requires setting the school on the connection for every request; easy to get wrong with pooled serverless connections.
- Harder to debug and test; adds friction for a solo developer on a deadline.
- Spec 0001 already chose application enforcement with row level security as the deferred runner up.

### Score storage alternative considered: one row per student and subject with fixed columns

`ca1`, `ca2`, `exam` columns on one row. Simpler queries, but schools use different splits per section (two to four parts), so columns would be wrong for some sections. One row per part handles any split, keeps "missing" as "no row", and makes the change log exact.

## Rationale

Option 2 fits the forces best. The school boundary is the one thing that must never fail, and composite foreign keys make the database enforce it on every insert without the per request connection setup that row level security needs on pooled serverless connections. Separate databases per school would buy isolation at the cost of migrations multiplied by every school, which a tiny team cannot afford, and would fight the shared standard lists the learning platform needs.

Per term enrolment (rather than a class on the student) is what makes mid year joiners, arm changes and third term cumulative results fall out naturally: a term without an enrolment is simply absent. Per section per session score splits and grade bands keep past report cards stable while letting a mistake in the current session be fixed instantly. Computing results at read time follows the rule that derived values go stale; at under 200 students per school there is no measured performance problem to justify storing them.

The score change log is required, not optional: scores are the records parents dispute, and an add only log is cheap to build now and painful to retrofit.

A same model cross check before acceptance found eight gaps, all fixed in the spec before the first migration (each was a column, a constraint or a lock, not a new design): scores could have linked a subject or part from another class, session or section (now refused by composite keys carrying `class_id`, `session_id` and `section_id`); electives keyed by class subject broke when a student changed arm (now keyed by subject and session); a section is now defined as exactly one stage, because JSS and SS need different grade scales; concurrent or retried saves could lose updates or log wrong old values (now locked rows, an expected value per change, and skipped no-op changes); parents sharing a phone would have been refused (phone no longer unique for parents, all phones normalised); leaving mid term is recorded on the enrolment so positions stay right; typed values are validated before Postgres could silently round them; and speculative columns for later features were removed in favour of add only changes when those features are designed.
