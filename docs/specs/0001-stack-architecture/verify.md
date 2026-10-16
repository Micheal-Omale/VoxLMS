# Verify: stack & architecture · spec 0001 · updated 2026-10-16
_Steps derived from the scope "Done when" line and spec 0001's Proposed stack (a decision spec, so no AC IDs). `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [ ] `npm run typecheck` → no errors
- [ ] `npm run lint` → no errors or warnings
- [ ] `npm run build` → passes; route list shows `ƒ /api/health` (dynamic)
- [ ] `npx drizzle-kit check` → "Everything's fine" (migrations config reaches Neon over the unpooled URL)
- [ ] `npx next start -p 3917`, then `curl http://localhost:3917/api/health` → HTTP 200 with `{"ok":true,"database":"up",...}` (pooled WebSocket connection plus a real transaction). Do not use port 3100, another local project uses it.
- [ ] `git check-ignore .env.local .neon` → both are ignored (no secrets in git)

## Config checks
- [ ] `vercel.json` pins functions to `lhr1`; the Neon project region is `aws-eu-west-2` (`neon projects get wandering-tooth-02697148`)
- [ ] `src/db/index.ts` uses `drizzle-orm/neon-serverless` with a `Pool` on `DATABASE_URL` (pooled), and imports `server-only`
- [ ] `drizzle.config.ts` uses `DATABASE_URL_UNPOOLED`, and no build script runs migrations

## Coverage
- Scope "Done when": the stack is recorded in a spec (spec 0001) · the empty project starts locally and builds clean (Commands above)
