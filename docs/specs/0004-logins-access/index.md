# 0004. Logins and access for teachers and our team

**Date**: 2026-10-16
**Status**: In Progress

## Summary

Teachers sign in with their phone number and a password they choose themselves; nobody else, including our team, ever sees or sets it. Our team adds each teacher, then the teacher sets their password by scanning a QR code during onboarding or by opening a one time link we send on WhatsApp (the same kind of link fixes a forgotten password). One login works across every VoxLMS school a teacher works at, and a teacher only ever reaches their own class: the server refuses anything else, even if the address is changed by hand. It runs on Better Auth inside the app, with every sign in, setup and admin action going through our own server code (no public auth endpoints), and an audit log in Postgres.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a teacher, I want to sign in with my phone number and a password I chose, so that I can enter scores on my own phone without help.
- As a teacher who forgot my password or lost my phone, I want our team to send me a new link or sign me out everywhere, so that my account stays mine.
- As a teacher at two schools, I want one login and both schools available, so that I don't juggle two passwords.
- As our team, I want to add logins, help teachers set passwords in person or remotely, see what a teacher sees, change a teacher's number, and switch a login off, so that support is quick and safe.
- As a school, I want each teacher to reach only their own class, so that one teacher can't read or change another class's scores.

**Acceptance criteria** (the contract):
- **AC-1**: There is no public sign up, and no Better Auth endpoint is reachable from the internet: every sign in, sign out, password and admin operation runs as our own server action calling Better Auth on the server. Requests to `/api/auth/*` return not found.
- **AC-2**: A teacher signs in with their phone number in any usual format (`0803 123 4567`, `+234…`) and their password. Wrong details show one message, "That phone number or password is not right", whether or not the phone has a login.
- **AC-3**: Our team creates a setup link for a person with a login. It is shown as a QR code (in person) and as a ready WhatsApp message to the phone on that login. A first setup link lasts 7 days; a forgotten password link lasts 48 hours. A link works once; creating a new one cancels all older ones. Opening the link changes nothing; only submitting a new password uses it. After the password is set, the person is signed in and every other session of theirs ends. No temporary password exists at any point.
- **AC-4**: Teacher passwords are at least 6 characters; our team's at least 12. Common passwords (`123456`, `password`…) and the person's own phone number are refused, with a message saying why. Every way of setting a password goes through these checks (there is no other way in, see AC-1).
- **AC-5**: A teacher's sign in lasts 30 days of use. Ticking "This is a shared computer" ends the session when the browser closes and, whatever the browser does, after 8 hours. Our team's sessions always end after 12 hours.
- **AC-6**: Wrong passwords slow people down but never lock anyone out: after 5 wrong tries for one phone from one device in 15 minutes, that device waits until the 15 minutes pass; after 30 wrong tries for one phone from anywhere in an hour, that phone waits until the hour passes; after 50 wrong tries from one device across any phones in an hour, that device waits. Phones with no login are throttled and answered exactly like real ones. Our team's accounts also stop after 10 wrong tries in a day.
- **AC-7**: Every school page has the school's short name in its address. A person reaches a school's pages only while they have an active staff record there (checked on every request), or are on our team; otherwise the page is not found. A teacher active in one school goes straight to it after signing in; active in several, they pick one (the choice is remembered for next time) and can open any of them directly. A teacher marked as left loses that school on their next request; a person with no active school sees a clear message.
- **AC-8**: In Release 1 a teacher can open, read and save only the classes they are form teacher of in the current session. Any other class (a hand edited address, a direct action call, another school's class) is "not found", and no data from it is returned or changed. This is enforced in the data access layer, not only in pages.
- **AC-9**: Our team can open any school, create logins, make setup links, change a login's phone number, sign a person out everywhere, switch a login off or on, and "view as" a teacher for at most one hour. View as is read only: every save is refused while viewing as, and a banner shows on every page. Our team cannot view as another team member. Sensitive admin actions (view as, setup link, change phone, switch off) need our team member's password entered within the last 15 minutes.
- **AC-10**: Signing out ends the session on the server. A teacher changing their password enters the current one, and every other device is signed out.
- **AC-11**: Every sign in, failed sign in, sign out, setup link created or used, password set or changed, phone changed, sign out everywhere, login switched off or on, and view as start (with its end time) is recorded in an add only audit log with who, for whom, when, and the device's IP. The database refuses updates and deletes on the log.
- **AC-12**: Our team's first account is created with a command we run, never through the web.
- **AC-13**: Two people cannot share one phone number as a login. Creating a login for a staff member whose phone already belongs to a login shows that login's name and schools, and our team must confirm it is the same person before linking.

## Decision

**Chosen option**: Option 1: Better Auth inside the app (username and admin plugins, Drizzle adapter), reached only through our own server actions, with password setup through Better Auth's reset token delivered by QR code or WhatsApp, and access rules in the data access layer.

**Implementation skills**: `better-auth-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-best-practices/`) · `better-auth-security-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-security-best-practices/`) · `create-auth` (`better-auth/skills`, `.claude/skills/create-auth/`) · `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`)

## Feature design

**How it fits together**:
- `src/server/auth/auth.ts`: the Better Auth server instance on the shared Neon pool via the Drizzle adapter. `emailAndPassword` with `disableSignUp: true`, `minPasswordLength: 6`, `revokeSessionsOnPasswordReset: true`, `resetPasswordTokenExpiresIn` 7 days, and a `sendResetPassword` that captures the link instead of sending mail. Plugins: `username` (the username is the phone as digits, `2348031234567`), `admin` (role `admin` is our team; impersonation lasts 1 hour), `nextCookies()` last. `session.cookieCache` stays off, so switching a login off or signing someone out takes effect on the next request.
- **No public endpoints**: no `/api/auth/[...all]` route is mounted (a stub returns 404). Our server actions call `auth.api.*` with the request headers. Better Auth's own HTTP rate limiter therefore does not apply; our `sign_in_throttle` does.
- Better Auth needs an email per user; users get `<random uuid>@users.voxlms.invalid`, which can never receive mail. No email is ever sent.
- `src/server/auth/viewer.ts`: `getViewer()` (server only, cached per request with React `cache`, never `'use cache'`) returns the user, role, whether this is a view as session, and their active staff memberships, or null. It enforces the shared computer and team session limits from the session's creation time. `requireSchoolContext(slug)` resolves the school from the address and requires an active staff row for this user there (or our team), returning a `SchoolContext` (spec 0003) that now carries an `actor`. `requireAdmin()` and `requireFreshAdmin()` (password within 15 minutes) guard admin actions.
- `actor` is `{ kind: "teacher", userId, staffId, readOnly }` or `{ kind: "admin", userId, readOnly }`, plus `{ kind: "system" }` for seeds and tests. `readOnly` is true while viewing as.
- `src/proxy.ts`: an optimistic redirect to `/login` when there is no session cookie on `/admin` and school paths. Not a security boundary.
- Pages read the session at request time inside `<Suspense>` (Cache Components). No data access result is cached with `'use cache'` unless the cache key includes the actor.
- IP addresses come from `x-real-ip`, else the first `x-forwarded-for` entry (Vercel sets both); a missing IP throttles under a shared `unknown` key rather than skipping.

**Data model sketch** (one add only migration; Better Auth tables generated by its CLI into `src/db/schema/auth.ts`):

| Table | Fields | Rules |
|---|---|---|
| `user` (Better Auth) | `id` text, `name`, `email` (placeholder), `email_verified`, `image`, `username` (phone digits), `display_username`, `role` (`user` or `admin`), `banned`, `ban_reason`, `ban_expires`, timestamps | `username` and `email` unique |
| `session` (Better Auth) | `id`, `token`, `user_id`, `expires_at`, `ip_address`, `user_agent`, `impersonated_by` (null), `shared_device` boolean (set on the server only, never from client input), timestamps | `token` unique |
| `account` (Better Auth) | `id`, `user_id`, `provider_id` (`credential`), `password` (hash), timestamps | Better Auth owns it |
| `verification` (Better Auth) | `id`, `identifier`, `value`, `expires_at` | Holds setup link tokens (`reset-password:<token>` → user id) |
| `staff` (changed) | add `user_id` text (null) | Links to `user`; `unique (school_id, user_id)` |
| `sign_in_throttle` | `key` text (`phone:<digits>`, `phone_ip:<digits>:<ip>`, `ip:<ip>`, `admin:<user id>`), `failures` int, `window_started_at` timestamptz | Primary key `key`; bumped with one atomic insert or update; an expired window starts again at 1 |
| `auth_event` | `id`, `kind` enum (`sign_in`, `sign_in_failed`, `sign_out`, `setup_link_created`, `password_set`, `password_changed`, `phone_changed`, `signed_out_everywhere`, `login_disabled`, `login_enabled`, `view_as_started`), `user_id` (null), `actor_user_id` (null), `school_id` (null), `ip_address` (null), `user_agent` (null), `detail` jsonb (null), `created_at` | A trigger rejects update and delete; indexes on `(user_id, created_at)` and `(created_at)`; `view_as_started` stores its end time in `detail` |

**State transitions**:
- login: none (staff without `user_id`) → created (password unknown to anyone) → active (password set through a setup link) → switched off (`banned`, sessions revoked, links cancelled) → active again.
- setup link: issued → used, or expired, or cancelled (newer link, switch off, phone change).
- session: signed in → signed out, expired (30 days, 8 hours shared, 12 hours team), or revoked (password set or changed, sign out everywhere, switch off, phone change).

**Routes and actions** (all actions are server actions that check the actor first):

| Surface | Key inputs | Result | Who | Key errors |
|---|---|---|---|---|
| `/login` + `signIn` | phone, password, shared computer tick | throttle check, then `auth.api.signInUsername`; redirect to the school, the picker, or `/admin` | public | one wrong details message; wait message when throttled |
| `/setup/[token]` (GET shows name and school only; POST `setPassword`) | new password, repeat | `auth.api.resetPassword`, then sign in | holder of the link | link used, expired or cancelled; password rule broken |
| `/choose-school` | school | remembered in a plain cookie, redirect | signed in, several schools | none (only their schools are listed) |
| `/{school}/…` layout | short name in address | school context | active staff there, or our team | not found |
| `/account/password` + `changePassword` | current password, new password | changed, other devices signed out | signed in, not viewing as | current password wrong; rule broken |
| `signOut` | none | session ended | signed in | none |
| `/admin` | none | schools, staff with login status and last sign in | our team | not found for anyone else |
| `createLogin` | staff id, confirm (when the phone already has a login) | user created or linked, setup link shown | our team | needs confirmation (shows the existing login's name and schools) |
| `makeSetupLink` | user id, kind (first or reset) | link, QR code, WhatsApp message to the login's phone | our team, fresh | no login |
| `changePhone` | user id, new phone | username changed, sessions revoked, links cancelled | our team, fresh | phone taken |
| `signOutEverywhere` | user id | all sessions revoked | our team, or the person themselves | none |
| `setLoginEnabled` | user id, on or off | unbanned, or banned with sessions revoked and links cancelled | our team, fresh | own login |
| `startViewAs` / `stopViewAs` | user id | read only impersonation for 1 hour, banner | our team, fresh | target is on our team |
| `npm run admin:create` | name, phone, password | first team account | us, on a machine with the database URL | password under 12 characters |

**Key invariants**:
- No route exposes Better Auth; every auth operation passes our checks (throttle, password rules, actor, audit).
- A password exists only as Better Auth's hash; no plain or temporary password is ever stored, logged, or shown, and full setup links are never logged.
- At most one unexpired setup link per user (older `verification` rows deleted in the same step as minting).
- A school's pages and data are reached only with an active staff row for that user in that school (checked every request) or as our team.
- Class level data functions (`getScoreSheet`, `saveScores`, `listClassStudents`, and later remarks and ratings) check that a teacher actor is form teacher of that class in the class subject's session.
- Every write in the data access layer refuses a `readOnly` actor.
- Audit rows are never updated or deleted (database trigger).

**Security model**:
- Roles: our team (`user.role = admin`: every school, admin actions, read only view as); teacher (Release 1: only their form classes, in schools where they are active staff). Principal and school admin roles exist in `staff.role` and are switched on by later features.
- Not found, never "forbidden", for anything outside a person's reach; login and throttle answers never reveal whether a phone has an account.
- `/setup` pages send `Referrer-Policy: no-referrer`, load no third party assets, and are safe to open by link preview bots (GET changes nothing).
- Our team signs in with a password only (engineer's choice, see Consequences), mitigated by 12 character passwords, 12 hour sessions, a daily failure cap, password re entry for sensitive actions, and last sign in shown on `/admin`.
- Cookies: secure, http only, same site lax. Server actions keep Next.js's built in origin check.
- Children's records are only reachable after these checks; the audit log holds no scores or children's details.

**Configuration required**:
- `BETTER_AUTH_SECRET`: signs sessions (32+ random characters; different per environment).
- `BETTER_AUTH_URL`: the app's public address (used to build setup links).

**Critical test scenarios**:
- Happy path: our team creates a login and a first setup link; the teacher opens it (no change), submits `kano26`, is signed in, signs in later with `0803 123 4567`, opens their class's score sheet; verifies **AC-2**, **AC-3**, **AC-7**.
- Failure case: the link is used twice, used after a newer link, used after 7 days, or a reset link after 48 hours; each is refused; verifies **AC-3**.
- Failure case: 6 wrong passwords from one device; the 6th waits, the right password from another device works; 51 wrong tries across many phones from one device are stopped; a phone with no login gets the same answers; verifies **AC-2**, **AC-6**.
- Auth/permission: a JSS 2 Gold teacher asks for SS 1 Science's sheet and saves to it through the action directly, and through school B's address; all not found, nothing changes; verifies **AC-7**, **AC-8**.
- Auth/permission: `/api/auth/sign-up/email`, `/api/auth/update-user` and `/api/auth/request-password-reset` all return 404; a password of `123456` or the teacher's own phone is refused; verifies **AC-1**, **AC-4**.
- Auth/permission: while viewing as, `saveScores` is refused and nothing is written; viewing as a team member is refused; verifies **AC-9**.
- Edge: a teacher at two schools opens school B's address directly; a teacher marked as left is refused on the next request; a shared computer session older than 8 hours is refused; verifies **AC-5**, **AC-7**.
- Edge: creating a login for a phone that already has one asks for confirmation; an update or delete on `auth_event` is refused by the database; verifies **AC-11**, **AC-13**.

## Build plan

Skateboard: a teacher who can really sign in and reach only their class first, then the setup and support tools around it.

1. Install Better Auth (check the installed version's behaviour on reset tokens, impersonation of admins, and `rememberMe`), generate its tables into `src/db/schema/auth.ts`, add `staff.user_id`, `sign_in_throttle`, `auth_event` and its trigger; migrate the dev branch; satisfies **AC-1**, **AC-11**.
2. Auth config, the 404 stub for `/api/auth/*`, password rules, throttle, audit helpers, `npm run admin:create`; satisfies **AC-1**, **AC-4**, **AC-6**, **AC-11**, **AC-12**.
3. `getViewer`, `requireSchoolContext`, `requireAdmin`, `requireFreshAdmin`, the actor in `SchoolContext`, form teacher and read only checks in the data access layer, `src/proxy.ts`; satisfies **AC-5**, **AC-7**, **AC-8**.
4. Pages and actions: `/login`, sign out, `/choose-school`, `/{school}` layout and a minimal school home listing the teacher's classes, `/account/password`; satisfies **AC-2**, **AC-5**, **AC-7**, **AC-10**.
5. Setup links: `makeSetupLink`, QR code and WhatsApp message, `/setup/[token]`; satisfies **AC-3**.
6. Minimal `/admin`: schools, staff with login status and last sign in, create login (with the same person confirmation), setup link, change phone, sign out everywhere, switch off or on, read only view as with banner; satisfies **AC-9**, **AC-13**.
7. Tests (Vitest against the dev branch) for every scenario above, and logins for the demo school's teachers in the seed; satisfies **AC-1** to **AC-13**.

## Consequences

**Positive**:
- Teachers own their passwords from day one; our team never handles one.
- One login per person across schools; adding a school for a teacher is just a staff row, and the address alone decides which school a page is about.
- Class level access and read only view as are enforced where data is read and written, so a missed check in a page cannot leak or change another class.
- No public auth surface: everything a request can do passes our throttle, rules and audit.

**Negative / tradeoffs**:
- Our team's accounts open every school with a password alone (the engineer chose no second step). A leaked team password exposes every school's children's records until it is changed; mitigations are listed in the security model, and an authenticator app can be added later without a data change.
- Teacher passwords may be 6 characters; throttling makes guessing slow, but a weak password is still the weakest point.
- Someone who knows a teacher's phone number can make that phone wait up to an hour by typing wrong passwords from many devices. Nobody is locked out for longer.
- A setup link forwarded within its life (7 days, or 48 hours for a reset) can be used by whoever has it; links are single use and sessions end when a password is set.
- Two people sharing one phone can't both have logins; the second must use their own number.
- Not using Better Auth's HTTP endpoints means writing a server action for each auth operation, and checking Better Auth upgrades for `auth.api` changes.

**Neutral**:
- Setup links reuse Better Auth's password reset tokens rather than a custom table.
- The design previews under `/design` stay; the real sign in page replaces the preview one in use.

## Follow-up

- [ ] Enrol teachers and students (#8): creating a staff member offers "create login" in the same step.
- [ ] Launch readiness (#17): `BETTER_AUTH_SECRET` per Vercel environment; previews get their own Neon branch and secret; consider an authenticator app for our team before more schools join.
- [ ] Principal and school admin roles: switched on by the features that need them.
