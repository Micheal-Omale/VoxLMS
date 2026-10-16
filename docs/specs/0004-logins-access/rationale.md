# 0004. Rationale: logins and access

## Context

VoxLMS holds children's records for many schools (spec 0003). Teachers are the main users, mostly on their own Android phones, sometimes on shared staffroom computers. Most have no work email. The company is not registered with CAC yet, so paid SMS verification and official WhatsApp sending are not available; free WhatsApp click to chat links are. Spec 0001 already chose Better Auth hosted inside the app, with no public sign up and our team creating every account.

Rules confirmed with the engineer: one login per person across schools, picking the school after signing in; 30 day sessions, ending at browser close on a shared computer; resets only when the request comes from the phone on file; our team signs in with a password only (no second step); "view as teacher" allowed, logged and limited to an hour; teachers' passwords at least 6 characters; wrong passwords slow people down but never lock an account; teachers choose their own passwords (the engineer was clear that nobody else should set them), in person during onboarding or remotely.

The consequence of getting this wrong is a teacher reading or changing another class's scores, one school seeing another's children, or a teacher locked out the night before results are due.

## Options considered

### Option 1: Better Auth inside the app, setup links from its reset token flow (chosen)

Better Auth with the username plugin (phone digits as the username) and the admin plugin (our team's role, switching logins off, view as). A teacher's first password and every later reset use Better Auth's own reset token, delivered as a QR code or a WhatsApp link instead of an email.

**Pros**:
- Already the chosen library (spec 0001), free, data stays in our Postgres.
- Reset tokens are single use and expire, so no custom token table is needed.
- Admin plugin gives switch off and view as with little code.

**Cons**:
- Better Auth needs an email per user; we store a placeholder.
- Password rules and the per phone throttle need hooks, because its built in rules are global.

### Option 2: Temporary passwords given by our team

Our team creates each login with a temporary password and sends it; the teacher must change it at first sign in (the scope's original wording).

**Pros**:
- Very familiar pattern; no link handling.

**Cons**:
- Our team knows and sends a working password, against the engineer's rule that teachers set their own.
- A forgotten "change it now" step or a leaked message leaves a known password live.

### Option 3: Teacher claims their account by phone number alone

The teacher types their phone number; if our team pre registered it, they choose a password.

**Pros**:
- Simplest for the teacher.

**Cons**:
- Without SMS verification, anyone who knows a teacher's number can claim the account first. Not acceptable for children's records.

### Option 4: A hosted auth service

A third party sign in service with phone OTP.

**Pros**:
- Phone verification and security handled by a specialist.

**Cons**:
- Monthly cost and SMS charges in dollars; data leaves our database; contradicts spec 0001.

## Rationale

Option 1 is the only option that meets the engineer's core rule (teachers set their own password, nobody else knows it) without SMS, which the business can't use yet. Reusing Better Auth's reset token keeps the secret handling in a maintained library: tokens are random, single use and expiring, and we only change how the link reaches the teacher (a QR code on our screen during onboarding, or a WhatsApp message to the phone on file). The same path handles forgotten passwords, so there is one flow to build, test and explain.

Access rules live in the data access layer (spec 0003's school context gains an actor), because the scope requires refusal "even if the address is changed by hand": a check only in pages would let a direct Server Action call through. Not found instead of forbidden keeps addresses from being probed.

Throttling instead of locking follows the engineer's choice and the deadline reality: a locked account the night before results day is worse than a slower guesser, and database backed rate limits work across Vercel's serverless copies where memory limits would not.

A same model cross check before acceptance found that mounting Better Auth's catch all route would expose endpoints the design never accounted for: a signed in teacher could change their own username (phone) and be linked into another school's staff record, anyone could mint reset tokens and cancel real links, phone numbers with logins could be discovered, and sign in by email would skip the per phone throttle. The design therefore mounts no Better Auth route and runs every auth operation as our own server action, which also made password rules, throttling and auditing simpler (one place each). Other fixes from that pass: view as is read only (a teacher must never appear to have saved what our team typed); older setup links are deleted when a new one is made, because Better Auth does not cancel them itself; failed sign ins are logged and throttled in our action, since they write nothing to the database on their own; a per device cap across phones stops password spraying; the school comes from the address with membership checked on every request (simpler than storing an active school in the session, and a teacher marked as left loses access at once); and shared computer and team session limits are enforced in our own session check.

Our team signing in with a password only is the engineer's decision. It is recorded as the main tradeoff with mitigations, and an authenticator app can be added later without any data change.
