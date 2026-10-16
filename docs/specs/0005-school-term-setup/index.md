# 0005. School and term setup by our team

**Date**: 2026-10-16
**Status**: In Progress

## Summary

Our team sets up each school in the team area as a short checklist: the school's details and web name, its logo, its sections (with the right teacher title and head's name and signature), and its sessions and terms, then switches the current term when the school resumes. Images are shrunk in the browser before upload; the logo may be shown publicly, but signatures are never served on the web, only placed into report cards on the server. Every school page already shows the school and current term, so once this is done a teacher signs in to the right school and term.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As our team, I want to create a school with only its essentials, then finish setup from a checklist, so that onboarding is quick and nothing is forgotten.
- As our team, I want to upload the logo and signatures from a phone photo or scan, so that report cards look like the school's own.
- As our team, I want to add a session with its three terms and switch the current term in one click, so that teachers always work in the right term.

**Acceptance criteria** (the contract):
- **AC-1**: Our team creates a school with name, web name, code and address (the web name and code are suggested from the name). The web name is 3 to 30 lowercase letters or digits, unique, and not a reserved word (`admin`, `api`, `login`, `setup`, `design`, `account`, `choose-school`, `result`, `brand`, and the app's other top level paths); the code is 2 to 6 capital letters. Problems are shown next to the field in plain words.
- **AC-2**: A school's page in the team area shows a setup checklist (Details, Logo, Sections, Session and terms) with each item done or not done, and links to each part.
- **AC-3**: Our team edits the school's details: name, web name, code, address, motto, phone, email, plan (basic or school logo), and "Report card shows attendance" (off by default). Changing the web name shows a warning that old links and bookmarks stop working, and needs a second confirmation.
- **AC-4**: Our team uploads a logo, and a signature per section, from JPG, PNG or WebP files (including phone photos). The browser shrinks each image to at most 600 pixels wide before upload; the server refuses files over 300 KB or that aren't real images, and stores them in the database (spec 0001). A new upload replaces the old one. Logos are served from a public address with long caching; signatures are never served publicly and are only previewed to our team.
- **AC-5**: Our team adds the school's sections from Primary, Junior Secondary and Senior Secondary (each at most once), with the teacher title (Class teacher or Form master, or custom), the head's title (Head teacher or Principal, or custom), the head's name, and the head's signature. A section can be removed only while it has no classes.
- **AC-6**: Our team adds a session (for example "2026/2027") with dates for its three terms (start, end, next term begins) and, if the school shows attendance, the number of times school opened per term. Dates must run in order (each term ends after it starts; terms don't overlap; next term begins after the term ends), with a clear message otherwise. Dates can be corrected later.
- **AC-7**: Our team makes any term the current term in one click, after confirming. Exactly one term per school is current, and every school page (team and teachers) shows it at once.
- **AC-8**: Every setup action is for our team only (anyone else gets not found), and our team's changes keep the school boundary (spec 0003): nothing set up for one school can touch another.

## Decision

**Chosen option**: Option 1: a setup checklist with small forms in the team area, server actions for every change, a route handler for image uploads, and a route handler that serves logos only.

**Implementation skills**: `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

## Feature design

**Data model sketch** (one add only migration):
- `school`: add `show_attendance` boolean, default false.
- Everything else already exists (spec 0003): `school` (name, slug, code, address, motto, phone, email, plan, logo_asset_id), `asset` (kind, mime_type, bytes, width, height), `section` (stage, name, teacher_title, head_title, head_name, head_signature_asset_id), `academic_session`, `term` (number, dates, next_term_begins_on, days_opened, is_current).
- Reserved web names live in `src/lib/reserved-slugs.ts`.

**State transitions**:
- term: not current → current (switching clears the previous one in the same transaction, spec 0003).
- asset: a new upload creates a new row and repoints the school or section; the old row is deleted in the same transaction if nothing else uses it.

**API surface**:

| Surface | Kind | Key inputs | Result | Who | Key errors |
|---|---|---|---|---|---|
| `/admin/schools/new` | page + action `createSchool` | name, web name, code, address | school created, go to its checklist | our team | web name taken or reserved; code format |
| `/admin/schools/[id]` | page | none | checklist with status and links (staff logins below it) | our team | not found |
| `/admin/schools/[id]/details` | page + action `updateSchoolDetails` | details, plan, show attendance, confirm web name change | saved | our team | as above; web name change not confirmed |
| `POST /admin/schools/[id]/images` | route handler | `kind` (logo or signature), `sectionId` for a signature, one image file | asset saved and linked | our team | not an image; over 300 KB; section not in this school |
| `GET /school-logo/[assetId]` | route handler | none | the logo, `Cache-Control: public, max-age=31536000, immutable` | anyone | not found for anything that isn't a logo |
| `GET /admin/schools/[id]/images/[assetId]` | route handler | none | image for preview, `Cache-Control: private, no-store` | our team | not found |
| `/admin/schools/[id]/sections` | page + actions `saveSection`, `removeSection` | stage, titles, head name | saved | our team | stage already used; section has classes |
| `/admin/schools/[id]/terms` | page + actions `saveSession`, `setCurrentTerm` | session name, three terms' dates, days opened | saved; current term switched | our team | dates out of order; name taken |

**Key invariants**:
- Web names are unique, lowercase, and never a reserved word.
- One section per stage per school; at most one current term per school (spec 0003).
- Term dates within a session run in order and don't overlap.
- Signatures are only ever read by our team's preview route and by server side PDF code.
- Images are at most 300 KB and real images (checked by reading their header, not trusting the file name).

**Security model**:
- Every page and action calls `requireTeam()`; route handlers check the session too. Anyone else gets not found.
- Every write includes the school id from the address and is checked against that school (composite keys, spec 0003).
- Uploads: type checked from the file's bytes, size capped, stored in Postgres, never written to disk, never executed.

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: create "Grace High School" (`gracehigh`, `GHS`), upload a logo, add the three sections with signatures, add 2026/2027 with three terms, make First Term current; the teacher's school page shows "First Term, 2026/2027"; verifies **AC-1** to **AC-7**.
- Failure case: web name `admin`, `Grace High` and an existing one are refused with a message; term dates out of order are refused; a 2 MB file or a renamed PDF is refused; verifies **AC-1**, **AC-4**, **AC-6**.
- Auth/permission: a teacher posting to the image route or opening a setup page gets not found; a signature's asset id is not found at `/school-logo/…`; verifies **AC-4**, **AC-8**.

## Build plan

Skateboard: the shortest path to a set up pilot school first, then the polish.

1. [x] Migration: `school.show_attendance`; reserved web names list; satisfies **AC-1**, **AC-3**.
2. [x] Data functions for school details, sections, sessions and terms, and images (school scoped, team only, with the validation rules); satisfies **AC-1**, **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-8**.
3. [x] "New school" page and the school checklist page (logins move below it); satisfies **AC-1**, **AC-2**.
4. [x] Details page with the web name change warning; satisfies **AC-3**.
5. [x] Image upload (browser shrink, route handler, logo route, private preview route) on the details and sections pages; satisfies **AC-4**.
6. [x] Sections page; sessions and terms page with current term switch; satisfies **AC-5**, **AC-6**, **AC-7**.
7. [x] Tests for the data rules and access; satisfies **AC-1** to **AC-8**.

## Consequences

**Positive**:
- The pilot can be set up by our team without code, and later schools follow the same checklist.
- Report cards get the school's own logo and signatures without exposing signatures online.

**Negative / tradeoffs**:
- More small pages than a single settings form.
- Images in Postgres grow the database a little (a few small images per school; fine at this size, spec 0001).
- Changing a web name breaks old links; we only warn.

**Neutral**:
- Score split, grade scales, classes and subjects are feature #7; teachers and students are #8. They join the checklist when built.
- Feature #11 (Remarks and attendance) can leave out attendance for the pilot; the setting from this spec decides whether a school's report cards show it.

## Follow-up

- [ ] Remarks and attendance (#11): attendance only for schools with "Report card shows attendance" on.
- [ ] Report card PDF (#12): read the logo and signatures from the database by id; never fetch them over HTTP.
- [ ] Watch for intermittent failures when a page runs several database queries at the same moment on a cold connection (seen in tests, fixed there by running them one at a time; not seen in the app so far).
