# Verify: school and term setup · spec 0005 · updated 2026-10-16
_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Run against the `dev` Neon branch and the local dev server._

## Commands
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` → all pass → all
- [ ] `npx drizzle-kit migrate` → applied; `school.show_attendance` exists, default false → AC-3
- [ ] `npm test` → 55 tests pass (9 for school setup) → AC-1 to AC-8
- [ ] `curl -I /school-logo/<logo asset id>` → 200, `image/png`, `Cache-Control: public, max-age=31536000, immutable` → AC-4
- [ ] `curl -I /school-logo/<signature asset id>` → 404 → AC-4
- [ ] `curl -I /admin/schools/<id>/images/<signature id>` and `curl -X POST /admin/schools/<id>/images` with no session → 307 to `/login` → AC-4, AC-8

## UI / manual (signed in as our team)
- [ ] `/admin` → "New school" → type "Kings Model College" → web name `kingsmodel` and code `KMC` are suggested → add an address → Create school → lands on the school's checklist with steps left → AC-1, AC-2
- [ ] Try web names `admin`, `Grace High`, and an existing one → each refused with a message next to the field → AC-1
- [ ] Details → change the web name → a warning about old links appears and needs "Yes, change the web name" → AC-3
- [ ] Details → Logo → upload a phone photo → it appears; Sections → upload a signature photographed on white paper → the paper becomes see-through → AC-4
- [ ] Sections → add Junior Secondary with the head's name → saved; "Remove section" on a section with classes is refused → AC-5
- [ ] Session and terms → add 2026/2027 with Second Term starting before First Term ends → refused with "Second Term must start after First Term ends", and every date typed is still there → fix it → saved → AC-6
- [ ] "Make current" on First Term → confirm → "Current term" shows; the checklist says "Setup is complete" → AC-7
- [ ] As a teacher, open `/admin/schools/<id>/details` → not found → AC-8

## Acceptance-criteria coverage
- AC-1: tests "creating a school" + manual · AC-2: manual checklist · AC-3: test "asks before changing the web name" + manual · AC-4: tests "images" + curl + manual uploads · AC-5: test "sections" + manual · AC-6: tests "sessions and terms" + manual · AC-7: data model test for the current term + manual · AC-8: tests for team only and other schools' sections + curl
