# Verify: data model · spec 0003 · updated 2026-10-16
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. All database steps run against the `dev` Neon branch, never `production`._

## Commands
- [ ] `grep NEON_BRANCH .env.local` → `NEON_BRANCH=dev` (local work never touches production) → AC-12
- [ ] `npm run typecheck` and `npm run lint` → no errors → all
- [ ] `npm run build` → passes → all
- [ ] `npx drizzle-kit migrate` → "migrations applied successfully" (or nothing to apply) → AC-1
- [ ] Query the dev branch: `information_schema.tables` (public) → 24 tables; `pg_constraint` → 56 foreign keys, 42 unique, 11 checks; `student.student_no` required, `student.admission_no` optional → AC-1, AC-2, AC-11
- [ ] `npm run db:seed -- --demo` twice → first creates `/gracehigh`, second says it already exists → AC-12
- [ ] `NEON_BRANCH=production npm run db:seed -- --demo` → refuses: "development branches only" → AC-12
- [ ] `npm test` → 33 tests pass; each database refusal names its exact constraint → AC-2 to AC-11

## Acceptance-criteria coverage
- AC-1: migrate + introspection · AC-2: tests "the database refuses mismatched links" (`score_class_subject_fk`, `score_component_fk`, `enrolment_class_fk`) · AC-3: test "returns NotFound … with school B's context" · AC-4: tests under "AC-4: scores" · AC-5: tests under "AC-5" (all or nothing, stale value conflict, repeat save) · AC-6: test "enrolment per term" · AC-7: test "grade scales belong to a section and session" · AC-8: test "electives" · AC-9: tests "parents" and phone normalising · AC-10: tests "students who leave" · AC-11: tests "uniqueness rules" and "gives every student a number, with or without an admission number" · AC-12: seed commands above

## Not covered automatically
- Two first saves of the same score at the same moment (unique violation reported as `Conflict`): handled in `saveScores`, needs a two connection test.
