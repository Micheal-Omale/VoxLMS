import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "../schema";

// Seeds run outside Next.js, so they build their own client instead of importing
// src/db (which is server-only). Same driver and pooled URL as the app.

export function createSeedDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing from .env.local");
  const pool = new Pool({ connectionString: url });
  return { db: drizzle({ client: pool, schema }), pool };
}

export type SeedDb = ReturnType<typeof createSeedDb>["db"];
