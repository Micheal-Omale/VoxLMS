import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { school, session, staff, user, verification } from "@/db/schema";
import { formatNigerianPhone, normaliseNigerianPhone } from "@/lib/phone";
import type { Executor } from "@/server/data/context";

import { logAuthEvent, type RequestMeta } from "./audit";
import { type Auth, FIRST_SETUP_LINK_HOURS, RESET_LINK_HOURS } from "./config";
import { passwordProblem } from "./password-rules";
import { clearDeviceFailures, recordFailure, secondsToWait, signInRules } from "./throttle";

// Login operations (spec 0004). Server actions call these; nothing here is
// reachable over HTTP. Kept free of Next.js so tests can drive it directly.

export type AuthDeps = { auth: Auth; db: Executor };

export const phoneDigits = (phone: string) => normaliseNigerianPhone(phone)?.slice(1) ?? null;

const placeholderEmail = () => `${randomUUID()}@users.voxlms.invalid`;

// ---------- Sign in ----------

export type SignInResult =
  | { ok: true; userId: string; isTeam: boolean }
  | { ok: false; reason: "wrong" }
  | { ok: false; reason: "throttled"; waitSeconds: number };

export async function signInWithPhone(
  deps: AuthDeps,
  input: { phone: string; password: string; sharedDevice: boolean; meta: RequestMeta; headers: Headers },
): Promise<SignInResult> {
  // Unknown or malformed phones are throttled and answered exactly like real ones.
  const digits = phoneDigits(input.phone) ?? `invalid:${input.phone.replace(/\D/g, "").slice(0, 20)}`;
  const [account] = await deps.db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.username, digits));
  const isTeam = account?.role === "admin";
  const rules = signInRules(digits, input.meta.ip, isTeam ? account.id : undefined);

  const wait = await secondsToWait(deps.db, rules);
  if (wait > 0) return { ok: false, reason: "throttled", waitSeconds: wait };

  let signedIn: { token: string; user: { id: string } } | null = null;
  try {
    signedIn = await deps.auth.api.signInUsername({
      body: { username: digits, password: input.password, rememberMe: !input.sharedDevice },
      headers: input.headers,
    });
  } catch {
    signedIn = null;
  }
  if (!signedIn) {
    await recordFailure(deps.db, rules);
    await logAuthEvent(deps.db, { kind: "sign_in_failed", userId: account?.id ?? null, meta: input.meta });
    return { ok: false, reason: "wrong" };
  }

  await clearDeviceFailures(deps.db, digits, input.meta.ip);
  await deps.db
    .update(session)
    .set({ sharedDevice: input.sharedDevice, passwordConfirmedAt: new Date() })
    .where(eq(session.token, signedIn.token));
  await logAuthEvent(deps.db, {
    kind: "sign_in",
    userId: signedIn.user.id,
    meta: input.meta,
    detail: { sharedDevice: input.sharedDevice },
  });
  return { ok: true, userId: signedIn.user.id, isTeam };
}

// ---------- Setup links ----------

/** Same hashing Better Auth uses for `storeIdentifier: "hashed"`. */
const hashedIdentifier = (token: string) =>
  createHash("sha256").update(`reset-password:${token}`).digest("base64url");

export type SetupLink = { url: string; token: string; expiresAt: Date; whatsappUrl: string; message: string };

/** Makes a one time setup link and cancels every older one for this person (AC-3). */
export async function makeSetupLink(
  deps: AuthDeps,
  input: { userId: string; kind: "first" | "reset"; actorUserId: string | null; meta?: RequestMeta },
): Promise<SetupLink> {
  const [person] = await deps.db.select().from(user).where(eq(user.id, input.userId));
  if (!person?.username) throw new Error("This person has no login yet");

  const token = randomBytes(18).toString("base64url");
  const hours = input.kind === "first" ? FIRST_SETUP_LINK_HOURS : RESET_LINK_HOURS;
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
  const ctx = await deps.auth.$context;
  await deps.db.delete(verification).where(eq(verification.value, person.id));
  await ctx.internalAdapter.createVerificationValue({
    identifier: `reset-password:${token}`,
    value: person.id,
    expiresAt,
  });
  await logAuthEvent(deps.db, {
    kind: "setup_link_created",
    userId: person.id,
    actorUserId: input.actorUserId,
    meta: input.meta,
    detail: { kind: input.kind, expiresAt: expiresAt.toISOString() },
  });

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const url = `${base}/setup/${token}`;
  const firstName = person.name.split(" ")[0];
  const message =
    input.kind === "first"
      ? `Hello ${firstName}, welcome to VoxLMS. Open this link to choose your password (it works once, for 7 days): ${url}`
      : `Hello ${firstName}, open this link to choose a new VoxLMS password (it works once, for 48 hours): ${url}`;
  // The message goes to the phone on the login itself, never a separately editable number.
  const whatsappUrl = `https://wa.me/${person.username}?text=${encodeURIComponent(message)}`;
  return { url, token, expiresAt, whatsappUrl, message };
}

export type SetupLinkInfo =
  | { valid: true; userId: string; name: string; phone: string; schools: string[]; isTeam: boolean }
  | { valid: false };

/** What a setup link is for. Reading it never uses it up (link preview bots are harmless). */
export async function readSetupLink(deps: AuthDeps, token: string): Promise<SetupLinkInfo> {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return { valid: false };
  const [row] = await deps.db
    .select({ userId: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, hashedIdentifier(token)));
  if (!row || row.expiresAt < new Date()) return { valid: false };
  const [person] = await deps.db.select().from(user).where(eq(user.id, row.userId));
  if (!person?.username || person.banned) return { valid: false };
  const schools = await deps.db
    .select({ name: school.name })
    .from(staff)
    .innerJoin(school, eq(school.id, staff.schoolId))
    .where(and(eq(staff.userId, person.id), eq(staff.status, "active")));
  return {
    valid: true,
    userId: person.id,
    name: person.name,
    phone: formatNigerianPhone(`+${person.username}`),
    schools: schools.map((s) => s.name),
    isTeam: person.role === "admin",
  };
}

export type SetPasswordResult =
  | { ok: true; userId: string; username: string }
  | { ok: false; reason: "link"; message: string }
  | { ok: false; reason: "rule"; message: string };

/** Uses a setup link to set the person's own password (AC-3, AC-4). */
export async function setPasswordWithLink(
  deps: AuthDeps,
  input: { token: string; password: string; meta?: RequestMeta },
): Promise<SetPasswordResult> {
  const info = await readSetupLink(deps, input.token);
  if (!info.valid) {
    return { ok: false, reason: "link", message: "This link has expired or was already used. Ask the VoxLMS team for a new one." };
  }
  const [person] = await deps.db.select({ username: user.username }).from(user).where(eq(user.id, info.userId));
  const problem = passwordProblem(input.password, { phoneDigits: person.username, isTeam: info.isTeam });
  if (problem) return { ok: false, reason: "rule", message: problem };

  try {
    await deps.auth.api.resetPassword({ body: { token: input.token, newPassword: input.password } });
  } catch {
    return { ok: false, reason: "link", message: "This link has expired or was already used. Ask the VoxLMS team for a new one." };
  }
  // Any other links for this person stop working too.
  await deps.db.delete(verification).where(eq(verification.value, info.userId));
  await logAuthEvent(deps.db, { kind: "password_set", userId: info.userId, meta: input.meta });
  return { ok: true, userId: info.userId, username: person.username! };
}

// ---------- Logins (our team) ----------

export type CreateLoginResult =
  | { ok: true; userId: string; reused: boolean }
  | { ok: false; reason: "confirm"; existing: { name: string; schools: string[] } }
  | { ok: false; reason: "already" }
  | { ok: false; reason: "phone" };

/** Gives a staff member a login, or links the login that already has their phone after confirmation (AC-13). */
export async function createLoginForStaff(
  deps: AuthDeps,
  input: { schoolId: string; staffId: string; confirmSamePerson: boolean; actorUserId: string | null; meta?: RequestMeta },
): Promise<CreateLoginResult> {
  const [member] = await deps.db
    .select()
    .from(staff)
    .where(and(eq(staff.schoolId, input.schoolId), eq(staff.id, input.staffId)));
  if (!member) throw new Error("Staff member not found");
  if (member.userId) return { ok: false, reason: "already" };
  const digits = phoneDigits(member.phone);
  if (!digits) return { ok: false, reason: "phone" };

  const [existing] = await deps.db.select().from(user).where(eq(user.username, digits));
  if (existing) {
    if (!input.confirmSamePerson) {
      const schools = await deps.db
        .select({ name: school.name })
        .from(staff)
        .innerJoin(school, eq(school.id, staff.schoolId))
        .where(eq(staff.userId, existing.id));
      return { ok: false, reason: "confirm", existing: { name: existing.name, schools: schools.map((s) => s.name) } };
    }
    await deps.db.update(staff).set({ userId: existing.id }).where(eq(staff.id, member.id));
    await logAuthEvent(deps.db, { kind: "login_created", userId: existing.id, actorUserId: input.actorUserId, schoolId: input.schoolId, meta: input.meta, detail: { reused: true } });
    return { ok: true, userId: existing.id, reused: true };
  }

  const ctx = await deps.auth.$context;
  const created = await ctx.internalAdapter.createUser({
    name: [member.title, member.fullName].filter(Boolean).join(" "),
    email: placeholderEmail(),
    emailVerified: false,
    username: digits,
    displayUsername: formatNigerianPhone(`+${digits}`),
    role: "user",
  }, { method: "admin" });
  await deps.db.update(staff).set({ userId: created.id }).where(eq(staff.id, member.id));
  await logAuthEvent(deps.db, { kind: "login_created", userId: created.id, actorUserId: input.actorUserId, schoolId: input.schoolId, meta: input.meta, detail: { reused: false } });
  return { ok: true, userId: created.id, reused: false };
}

/** Ends every session and cancels every setup link for a person. */
async function endEverything(db: Executor, userId: string) {
  await db.delete(session).where(eq(session.userId, userId));
  await db.delete(verification).where(eq(verification.value, userId));
}

export async function signOutEverywhere(deps: AuthDeps, input: { userId: string; actorUserId: string; meta?: RequestMeta }) {
  await deps.db.delete(session).where(eq(session.userId, input.userId));
  await logAuthEvent(deps.db, { kind: "signed_out_everywhere", userId: input.userId, actorUserId: input.actorUserId, meta: input.meta });
}

export type ChangePhoneResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "taken" }
  | { ok: false; reason: "staff"; staffName: string; schoolName: string };

/**
 * Moves a login to a new phone number, in every school it is staff of, and
 * ends everything open (spec 0004, AC-9). Refused before anything changes when
 * other staff in any of those schools already have the number (spec 0008, AC-2).
 */
export async function changePhone(
  deps: AuthDeps,
  input: { userId: string; newPhone: string; actorUserId: string; meta?: RequestMeta },
): Promise<ChangePhoneResult> {
  const digits = phoneDigits(input.newPhone);
  if (!digits) return { ok: false, reason: "invalid" };
  const phone = `+${digits}`;
  return deps.db.transaction(async (tx): Promise<ChangePhoneResult> => {
    const [taken] = await tx.select({ id: user.id }).from(user).where(eq(user.username, digits));
    if (taken && taken.id !== input.userId) return { ok: false, reason: "taken" };
    const schoolIds = (await tx.select({ schoolId: staff.schoolId }).from(staff).where(eq(staff.userId, input.userId))).map((r) => r.schoolId);
    if (schoolIds.length > 0) {
      const [clash] = await tx
        .select({ staffName: staff.fullName, schoolName: school.name })
        .from(staff)
        .innerJoin(school, eq(school.id, staff.schoolId))
        .where(and(inArray(staff.schoolId, schoolIds), eq(staff.phone, phone), or(isNull(staff.userId), ne(staff.userId, input.userId))));
      if (clash) return { ok: false, reason: "staff", ...clash };
    }
    await tx
      .update(user)
      .set({ username: digits, displayUsername: formatNigerianPhone(phone) })
      .where(eq(user.id, input.userId));
    await tx.update(staff).set({ phone }).where(eq(staff.userId, input.userId));
    await endEverything(tx, input.userId);
    await logAuthEvent(tx, { kind: "phone_changed", userId: input.userId, actorUserId: input.actorUserId, meta: input.meta });
    return { ok: true };
  });
}

/** Switches a login off (or back on). Off ends every session and link (AC-9). */
export async function setLoginEnabled(
  deps: AuthDeps,
  input: { userId: string; enabled: boolean; actorUserId: string; meta?: RequestMeta },
) {
  if (input.userId === input.actorUserId) throw new Error("You can't switch off your own login");
  await deps.db
    .update(user)
    .set(input.enabled ? { banned: false, banReason: null } : { banned: true, banReason: "Switched off by the VoxLMS team" })
    .where(eq(user.id, input.userId));
  if (!input.enabled) await endEverything(deps.db, input.userId);
  await logAuthEvent(deps.db, {
    kind: input.enabled ? "login_enabled" : "login_disabled",
    userId: input.userId,
    actorUserId: input.actorUserId,
    meta: input.meta,
  });
}

/** Active schools for a login, for the picker and the address check. */
export async function activeSchoolsFor(db: Executor, userId: string) {
  return db
    .select({
      schoolId: school.id,
      slug: school.slug,
      name: school.name,
      code: school.code,
      staffId: staff.id,
      role: staff.role,
    })
    .from(staff)
    .innerJoin(school, eq(school.id, staff.schoolId))
    .where(and(eq(staff.userId, userId), eq(staff.status, "active")));
}

export async function sessionsOf(db: Executor, userIds: string[]) {
  if (userIds.length === 0) return [];
  return db.select().from(session).where(inArray(session.userId, userIds));
}
