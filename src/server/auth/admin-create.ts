// Creates a VoxLMS team (platform admin) account (spec 0004, AC-12).
// Never possible through the web. Run on a machine with the database URL:
//   npm run admin:create -- --name "Ada Obi" --phone "0803 000 0000"
// The password is asked for without showing it, or read from VOXLMS_ADMIN_PASSWORD.
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";

import { eq } from "drizzle-orm";

import { user } from "@/db/schema";
import { createSeedDb } from "@/db/seed/client";
import { formatNigerianPhone } from "@/lib/phone";

import { logAuthEvent } from "./audit";
import { createAuth } from "./config";
import { passwordProblem } from "./password-rules";
import { phoneDigits } from "./service";

process.loadEnvFile(".env.local");

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function askHidden(question: string): Promise<string> {
  if (process.env.VOXLMS_ADMIN_PASSWORD) return process.env.VOXLMS_ADMIN_PASSWORD;
  if (!process.stdin.isTTY) throw new Error("Set VOXLMS_ADMIN_PASSWORD, or run this in a terminal.");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const output = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  output._writeToOutput = (s: string) => {
    if (s.includes(question)) output.output.write(s);
  };
  const answer = await rl.question(question);
  rl.close();
  process.stdout.write("\n");
  return answer;
}

async function main() {
  const name = arg("name");
  const phone = arg("phone");
  if (!name || !phone) throw new Error('Usage: npm run admin:create -- --name "Full Name" --phone "0803 000 0000"');
  const digits = phoneDigits(phone);
  if (!digits) throw new Error("That isn't a Nigerian mobile number.");

  const password = await askHidden("Password (12+ characters): ");
  const problem = passwordProblem(password, { phoneDigits: digits, isTeam: true });
  if (problem) throw new Error(problem);

  const { db, pool } = createSeedDb();
  try {
    const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.username, digits));
    if (taken) throw new Error("That phone number already has a login.");
    const auth = createAuth(db, { withNextCookies: false });
    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createUser(
      {
        name,
        email: `${randomUUID()}@users.voxlms.invalid`,
        emailVerified: false,
        username: digits,
        displayUsername: formatNigerianPhone(`+${digits}`),
        role: "admin",
      },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: await ctx.password.hash(password),
    });
    await logAuthEvent(db, { kind: "login_created", userId: created.id, detail: { team: true, via: "command" } });
    console.log(`Team account created for ${name} (${formatNigerianPhone(`+${digits}`)}). Sign in at /login.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
