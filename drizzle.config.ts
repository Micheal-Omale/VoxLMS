import { defineConfig } from "drizzle-kit";

process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED is missing from .env.local");

// Migrations use the direct (unpooled) URL and run as a deliberate step,
// never inside `next build` (spec 0001).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
});
