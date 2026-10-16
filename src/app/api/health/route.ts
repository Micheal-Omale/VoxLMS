import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";

// Proves the app reaches Neon and that transactions work.
export async function GET() {
  await connection();

  const started = Date.now();
  try {
    const now = await db.transaction(async (tx) => {
      const result = await tx.execute<{ now: string }>(sql`select now()::text as now`);
      return result.rows[0]?.now;
    });

    return Response.json({ ok: true, database: "up", dbTime: now, ms: Date.now() - started });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ ok: false, database: "down" }, { status: 503 });
  }
}
