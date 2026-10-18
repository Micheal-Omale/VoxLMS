<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Stack

One Next.js App Router app in strict TypeScript, Neon Postgres through Drizzle (`drizzle-orm/neon-serverless`, pooled), Better Auth, Tailwind with shadcn/ui on Base UI, Vitest. The full table and reasons: [spec 0001](docs/specs/0001-stack-architecture/index.md).

## Build approach

Skateboard: ship the smallest report card tool a real school would use, then grow it release by release (from `docs/scope/scope.md`).

## Conventions

- A Base UI `Checkbox` or `Switch` inside a form with a server action must not carry `name`. Keep its value in React state and send it through `<input type="hidden" name=… value={on ? "on" : ""} />`. React resets the form after the action returns, and the control's own hidden checkbox resets to unticked while it still looks ticked.
- Who signs a section's report cards comes only from `getSignerForSection` in `src/server/data/setup.ts`: the section's own head if it has one, else the school's principal (spec 0007).
- A server action that must answer with a result the screen acts on (not redirect) finds the signed in person with `getActionViewer()` in `src/server/auth/viewer.ts`, never `getViewer()`. Inside an action any cookie Better Auth writes makes Next re-render the page, whose sign in check then redirects first. `src/proxy.ts` lets server action requests through for the same reason (spec 0009).
- Only the current term takes scores: `saveScores` refuses any other term with `TermClosed`, reading `term.is_current` under a share lock inside its transaction (spec 0009). Scores reach the database only through `saveScores`.
- Class results (totals, grades, positions, averages) come only from `loadClassResults` / `getClassResults` in `src/server/data/results.ts`, which run the pure `computeClassResults` in `src/lib/results.ts` in whole tenths and hundredths. Nothing computed is stored, and a part not entered is never 0. The report card, broadsheet and reprint call `loadClassResults` inside their own `readSnapshot`, never their own maths (spec 0010).

## Testing

- `npm test` runs every file in `test/`. Database tests run against the dev Neon branch inside a transaction that is rolled back (`inRollback` in `test/db.ts`).
- Component tests are `*.test.ts` files (the Vitest config only picks up `.ts`): they render with `createElement` instead of JSX and start with `// @vitest-environment jsdom`. Mock server actions with `vi.mock`.

## Agent skills

- Declined: Testing Library, jsdom (no Agent Skill or MCP search wanted)
