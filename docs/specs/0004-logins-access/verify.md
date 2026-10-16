# Verify: logins and access · spec 0004 · updated 2026-10-16
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Run against the `dev` Neon branch and the local dev server, never production._

## Commands
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` → all pass → all
- [ ] `npx drizzle-kit migrate` → applied; tables `user`, `session`, `account`, `verification`, `sign_in_throttle`, `auth_event` exist; trigger `auth_event_no_update_or_delete` exists; `staff.user_id` exists → AC-1, AC-11
- [ ] `curl -X POST http://localhost:3003/api/auth/sign-up/email` (also `/update-user`, `/request-password-reset`) → 404 → AC-1
- [ ] `curl -I http://localhost:3003/gracehigh` with no cookie → 307 to `/login` → AC-7
- [ ] `npm run admin:create -- --name "…" --phone "…"` with a password under 12 characters → refused; with 12+ → "Team account created" → AC-4, AC-12
- [ ] `npm run db:seed -- --demo-logins` → prints one setup link per demo teacher; no password is printed or set → AC-3
- [ ] `npm test` → 46 tests pass (13 for logins) → AC-2 to AC-13

## UI / manual
- [ ] Our team signs in at `/login` → lands on `/admin` → opens Grace High School → "Create login" on a teacher → the setup link dialog shows a QR code and "Send on WhatsApp" to that teacher's own number → AC-3, AC-9
- [ ] Open the setup link on a phone twice (nothing changes), set `kano26` twice → signed in and on `/gracehigh` with only their own class listed → AC-3, AC-7, AC-8
- [ ] Open the same link again → "This link doesn't work any more" → AC-3
- [ ] As that teacher, open `/testschoola` and `/admin` → not found page → AC-7, AC-9
- [ ] Sign in with a wrong password → "That phone number or password is not right…"; six wrong tries from one device → "Too many tries. Wait …" → AC-2, AC-6
- [ ] Tick "This is a shared computer" when signing in → session row has `shared_device = true`; after 8 hours it no longer works → AC-5
- [ ] Our team: "View as" a teacher (asks for the password if the last one was over 15 minutes ago) → amber banner "Nothing can be saved" → "Stop viewing as" returns to `/admin` → AC-9
- [ ] Change password from the account menu → other devices signed out → AC-10
- [ ] `select kind from auth_event order by created_at desc limit 20` → the events above are there; `update auth_event …` → refused → AC-11

## Acceptance-criteria coverage
- AC-1: route stub + curl · AC-2, AC-6: tests "signing in and throttling" · AC-3: tests "setup links and passwords" + manual link steps · AC-4: password rules tests, admin command · AC-5: shared computer test + manual · AC-7, AC-8: tests "teachers reach only their class" + manual school addresses · AC-9: read only test + manual view as · AC-10: manual change password · AC-11: audit test · AC-12: admin command · AC-13: test "asks before linking a phone that already has a login"

## Not covered automatically
- The 8 hour shared computer and 12 hour team limits are enforced in `getViewer` (Next.js request code) and checked manually, not by a unit test.
- "Not found" pages return HTTP 200 while streaming (see spec 0004 Follow-up).
