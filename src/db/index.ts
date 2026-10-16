import "server-only";

import { Pool } from "@neondatabase/serverless";
import { parseEnv } from "@neon/env";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/neon-serverless";

import config from "../../neon";
import * as schema from "./schema";

// Pooled URL for app traffic. WebSocket Pool mode (not HTTP) so multi row
// writes can run in real transactions (spec 0001).
const { postgres } = parseEnv(config, ["DATABASE_URL"]);

const pool = new Pool({ connectionString: postgres.databaseUrl });

// Lets Vercel close idle connections cleanly before a function instance is suspended.
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });
