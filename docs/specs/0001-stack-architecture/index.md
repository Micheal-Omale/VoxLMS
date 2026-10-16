# 0001. Stack and architecture for the school results system

**Date**: 2026-10-16
**Status**: In Progress

## Summary

The whole product is one TypeScript web app built with Next.js, running on Vercel, with its data in a Neon Postgres database. One app and one database serve every school, and every school's records are kept apart in code. Logins, PDF report cards, and Excel files are all handled inside the same app, so there is no second server or extra service to run. Everything is free while we build; the first paid cost is moving to hosting that allows commercial use before the pilot school pays.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Decision

**Chosen option**: Option 1: Next.js monolith on Vercel with Neon Postgres and Better Auth.

Build one Next.js app (a monolith: a single app that holds all pages and server logic) in TypeScript, store all data in Neon Postgres through Drizzle, handle logins with Better Auth inside the app, make PDFs and Excel files on the server, and deploy from a private GitHub repo to Vercel.

**Implementation skills**: `neon`, `neon-postgres`, `neon-postgres-branches` (`neondatabase/agent-skills`, `.claude/skills/`) · `neon-drizzle`, `neon-serverless` (`neondatabase/ai-rules`, `.claude/skills/`) · `better-auth-best-practices`, `better-auth-security-best-practices`, `create-auth` (`better-auth/skills`, `.claude/skills/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `vercel-react-best-practices`, `deploy-to-vercel` (`vercel-labs/agent-skills`, `.claude/skills/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.claude/skills/sentry-nextjs-sdk/`) · `react-pdf` (`molefrog/skills`, `.claude/skills/react-pdf/`)

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture pattern | One Next.js app (monolith), one database, all schools in it | A solo or tiny team on a 7 week deadline; one thing to build, deploy, and debug. |
| Language | TypeScript in strict mode | One language for pages, server code, PDFs, and tests; the compiler catches mistakes in score maths early. |
| Runtime | Node.js, the current active LTS (long term support) release at scaffold time | PDF and Excel libraries need full Node, not the lighter Edge runtime. |
| Framework | Next.js, App Router, latest stable at scaffold time | Pages and server logic together; server rendering keeps pages light on cheap phones. |
| UI | Tailwind CSS + shadcn/ui | Ready made accessible forms, tables, and dialogs we own as code; fast to build score entry screens. |
| Validation | Zod | One set of rules checks a score both in the form and on the server (runner up: Valibot, smaller but less known). |
| Primary DB | Neon Postgres | Relational data (schools, classes, scores); wakes itself after idle holidays; a short restore window on the free plan. |
| DB access | Drizzle ORM with the Neon serverless driver in WebSocket Pool mode (`drizzle-orm/neon-serverless`), over the pooled URL; migrations with drizzle-kit, SQL files committed | Typed queries with real transactions (the HTTP mode has none, and saving a class's scores needs them); plain SQL stays possible for ranking and broadsheet queries. |
| Backups | Nightly `pg_dump` (a full copy of the database) by a scheduled GitHub Actions job, encrypted, kept as a private workflow file for 30 days; plus a Neon branch snapshot before every Excel import | Neon's free restore window is only hours, so a mistake found the next morning or after a holiday needs a real copy. Free, and GitHub emails us if the job fails. |
| Tenancy (keeping schools apart) | One shared database, a `school_id` on every school owned table, enforced in one data access layer on the server | Simple to build and reason about; the data model spec defines the details. Database row level security is the runner up, deferred. |
| Auth | Better Auth, hosted inside the app, its tables in Neon | Free, open source, no outside service; username login (phone number as username), admin tools, no public sign up. The logins spec defines the rules. |
| Report card PDFs | @react-pdf/renderer, generated on the server in a Node route handler and streamed to the browser | Same file on every device; the same code later serves parent result links. Static TTF or OTF fonts (not woff2, not variable fonts) ship with the app so every PDF looks identical. |
| Excel import and broadsheet export | ExcelJS, on the server; imports accept `.xlsx` and CSV only | Reads uploaded lists and writes styled broadsheets (bold headers, borders) for free. Old `.xls` files are refused with a clear "save as .xlsx" message; our team does the imports, so converting is easy. |
| Images (logos, signatures) | Stored in Postgres as binary, shrunk in the browser before upload (about 600px wide, under 100 KB), served by a route handler with caching | A few small images per school; no extra storage service; small images keep a whole class PDF well under Vercel's 4.5 MB response limit. |
| Background jobs | None | Every action finishes within a normal request; nothing needs a queue yet. |
| Email | None in this phase | Teachers sign in with a phone number; password resets go through our team. |
| Testing | Vitest now; Playwright browser tests later | Results maths (totals, positions, ties) gets fast tests from day one. |
| Error tracking | Sentry free plan with its Next.js integration, with sending personal data turned off and student names and scores scrubbed from events | Emails our team the exact error and page when a teacher hits a problem, without sending children's records abroad. The free plan has one user, so alerts go to one inbox. |
| Hosting | Vercel: free Hobby plan while building and demoing; a plan that allows commercial use before the first paid term | Push to deploy; preview links for every branch. The paid move is owned by the Launch readiness feature. |
| Regions | Neon in `aws-eu-west-2` (London); Vercel functions pinned to `lhr1` (London) in `vercel.json` | Vercel's default region is in the US, so it must be pinned. London is the closest practical pair for Lagos, and keeping both together avoids a slow round trip on every query. |
| Code home | Private GitHub repo, connected to Vercel | Free history and backup of the code; every push deploys. |
| Package manager | npm | Ships with Node; nothing extra to install on Windows. |

### How the app is organised (rules the build must follow)

- **Reads** happen in Server Components (pages rendered on the server). **Saves** go through Server Actions (server functions called from forms). **File downloads** (PDF, Excel, images) go through Route Handlers (plain server URLs).
- **School in the address**: school pages live under `/{school}/...` (the school's short name, for example `/gracehigh`). Our team's pages live under `/admin/...`. The short name is for display only: the server always takes the school from the signed in user's account and refuses a short name that does not match. Reserved names (`admin`, `api`, `login`, and similar) cannot be used as a school's short name.
- **One data access layer**: every database read or write for school data goes through server functions that require the current school and user, and filter by `school_id`. Pages never query the database directly.
- **Transactions**: every write that touches more than one row (saving a class's scores, an import, recomputing positions) runs in one database transaction, so it either fully saves or not at all.
- **Teachers never lose typed scores**: score entry keeps an unsaved draft in the browser (local storage) until the server confirms the save; saves are upserts (insert or update, safe to repeat) and retry on a flaky connection. No deploys during term end score entry weeks (Vercel's protection against a deploy breaking open pages is a paid feature).
- **File uploads** (Excel lists, images) go through Route Handlers, not Server Actions (which accept only 1 MB by default). Vercel caps any request at 4.5 MB; images are shrunk in the browser first.
- **PDF size**: a whole class PDF must stay well under 4.5 MB. Test a 45 student class early, and check the file grows only a little per extra student (images must not be copied into every page).
- **Login safety on serverless**: Better Auth's rate limit (slowing repeated wrong passwords) is stored in the database, because each serverless copy of the app has its own memory. Full rules live in the logins spec.
- **Time**: store every timestamp in UTC; show dates in Africa/Lagos time.
- **Environments and migrations**:
  - Production uses Neon's main branch. Local development and Vercel previews use separate Neon branches built from the schema plus made up seed data, never copies of real children's records (Nigeria Data Protection Act).
  - `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `BETTER_AUTH_SECRET` are set separately per Vercel environment, so production values are never visible to previews.
  - Migrations never run inside `next build`. They run as a deliberate step with `drizzle-kit migrate` on the unpooled URL, and only add tables or columns while an older deploy may still be live (no renames or drops in the same release).
- **Bundling**: `@react-pdf/renderer` and ExcelJS stay server only. Font files are included in the serverless bundle (`outputFileTracingIncludes`), and `@react-pdf/renderer` goes in `serverExternalPackages` if bundling breaks.

### Configuration required

- `DATABASE_URL`: pooled Neon connection string, used by the app
- `DATABASE_URL_UNPOOLED`: direct Neon connection string, used only for migrations
- `BETTER_AUTH_SECRET`: secret key that signs login sessions
- `BETTER_AUTH_URL`: the app's public address
- `SENTRY_DSN`: where Sentry receives errors
- `SENTRY_AUTH_TOKEN`: lets the build upload source maps so Sentry shows readable errors
- `BACKUP_ENCRYPTION_KEY` (GitHub Actions secret, not Vercel): encrypts the nightly database copy
- `BACKUP_DATABASE_URL` (GitHub Actions secret): direct read connection used only by the nightly backup

## Consequences

**Positive**:
- ₦0 running cost while building and demoing; one app, one database, one deploy.
- The database survives idle holidays without any keep awake job; mistakes from the last few hours can be rewound, and older ones restored from the nightly copy.
- Adding a second school needs no new code or servers.
- The same server PDF code serves printing now and parent links in Phase 2.

**Negative / tradeoffs**:
- Vercel Hobby is not allowed for commercial use: hosting must move (Vercel Pro about $20 a month, billed in dollars) before the pilot school pays. Many naira cards limit or block foreign charges, so the paying card must be tested early.
- The nightly backup is one scheduled job we must keep healthy, and a restore must be practised once before launch.
- A deploy while a teacher has the page open can break their next save, hence the no deploy rule during score entry weeks.
- Data lives in Europe, so every page has a small extra delay for users in Nigeria (roughly a tenth of a second).
- Serverless functions can start slowly after idle time (a cold start), so the first page after a quiet spell is slower.
- The Neon free plan caps monthly compute hours; fine for one school, to be watched as schools are added.
- We own the security of the login system (library updates, settings), since it runs inside our app.
- react-pdf layouts use its own layout rules, not full web CSS, so the report card design must be built for it.
- ExcelJS releases are slow; if it stops being maintained we swap it in one module.
- Images in the database make the database a little bigger; fine for logos, not for the future LMS (which will need file storage).

**Neutral**:
- The folder is not yet a git repo; the scaffold step starts with `git init` and the GitHub repo.
- Exact folder layout and scaffold steps are derived by `/develop stack & architecture`, not written here.

## Follow-up

- [ ] `/audit` should record in root `AGENTS.md` `## Agent skills`: the installed skills above (project wide: neon, neon-drizzle, neon-serverless, shadcn, vercel-react-best-practices; area specific: better-auth skills under the auth area, react-pdf under the report card area, sentry-nextjs-sdk and deploy-to-vercel under launch readiness). `MCP servers:` Vercel MCP (chosen), Neon MCP (configured, needs reconnect). `Declined:` Vitest skill (antfu/skills), Next.js DevTools MCP, Sentry MCP, shadcn MCP, community TypeScript, Tailwind, Drizzle, and ExcelJS skills.
- [ ] Connect the Vercel MCP server (a user config step): `claude mcp add --transport http vercel https://mcp.vercel.com`
- [ ] Reconnect the Neon MCP server in Claude Code (currently failing to connect) before building.
- [ ] Check the current Neon free plan limits (storage, monthly compute hours, restore window) and the regions offered, then pick the region at scaffold.
- [ ] Choose a report card font with a licence that allows embedding (for example an open font), decided in the report card PDF spec.
- [ ] Launch readiness feature: pick the commercial hosting plan and set Sentry alert emails before the first paid term. Confirm now that a card can pay Vercel in dollars (for example a dollar virtual card), and name a fallback host that allows commercial use (for example Netlify).
- [ ] Launch readiness feature: set up the nightly backup job and practise one full restore before the first paid term.
- [ ] Logins spec: set `trustedOrigins` for preview addresses, or turn sign in off on previews.
- [ ] Run `/audit` after the scaffold so root `AGENTS.md` records this stack and its conventions.
