// Seeds the database (spec 0003, AC-12).
//   npm run db:seed            standard levels and subjects (any branch)
//   npm run db:seed -- --demo  also the made-up demo school (development branches only)
//   npm run db:seed -- --reset-demo  remove the demo school, then seed it again
import { createSeedDb } from "./client";
import { DEMO_SLUG, removeSchoolBySlug, seedDemoSchool } from "./demo-school";
import { seedStandardLists } from "./standard-lists";

process.loadEnvFile(".env.local");

const args = new Set(process.argv.slice(2));
const wantsDemo = args.has("--demo") || args.has("--reset-demo");

function assertDemoAllowed() {
  if (process.env.NEON_BRANCH === "production") {
    throw new Error("Refusing to seed demo data: NEON_BRANCH is production. Demo data is for development branches only.");
  }
  if (process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Refusing to seed demo data: set ALLOW_DEMO_SEED=1 in .env.local on a development branch.");
  }
}

async function main() {
  if (wantsDemo) assertDemoAllowed();
  const { db, pool } = createSeedDb();
  try {
    const lists = await seedStandardLists(db);
    console.log(`Standard lists ready: ${lists.levels} levels, ${lists.subjects} subjects.`);
    if (args.has("--reset-demo")) {
      const removed = await removeSchoolBySlug(db, DEMO_SLUG);
      console.log(removed ? "Removed the demo school." : "No demo school to remove.");
    }
    if (wantsDemo) {
      const result = await seedDemoSchool(db);
      console.log(result.created ? "Demo school created: /gracehigh" : "Demo school already exists: /gracehigh");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
