import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";

import { account, session, user, verification } from "@/db/schema";
import type { Executor } from "@/server/data/context";

// Better Auth for VoxLMS (spec 0004). Reached only through our server actions:
// no /api/auth route is mounted, so every operation passes our own checks.

export const SESSION_DAYS = 30;
export const SHARED_DEVICE_HOURS = 8;
export const TEAM_SESSION_HOURS = 12;
export const FIRST_SETUP_LINK_HOURS = 7 * 24;
export const RESET_LINK_HOURS = 48;

/** `withNextCookies: false` for tests and command line scripts, which run outside a request. */
export function createAuth(db: Executor, options: { withNextCookies?: boolean } = {}) {
  return betterAuth({
    appName: "VoxLMS",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 6,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: FIRST_SETUP_LINK_HOURS * 3600,
      // Setup links are made by makeSetupLink and delivered by QR or WhatsApp; nothing is emailed.
      sendResetPassword: async () => {},
    },
    session: {
      expiresIn: SESSION_DAYS * 24 * 3600,
      updateAge: 24 * 3600,
      additionalFields: {
        sharedDevice: { type: "boolean", defaultValue: false, input: false },
      },
    },
    // Setup link tokens are stored as SHA-256 hashes, never readable.
    verification: { storeIdentifier: "hashed" },
    // No HTTP surface; our own throttle (sign_in_throttle) applies instead.
    rateLimit: { enabled: false },
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] },
    },
    plugins: [
      username({
        minUsernameLength: 13,
        maxUsernameLength: 13,
        usernameValidator: (value) => /^234[789][01]\d{8}$/.test(value),
      }),
      admin({ defaultRole: "user", adminRoles: ["admin"], impersonationSessionDuration: 3600 }),
      ...(options.withNextCookies === false ? [] : [nextCookies()]),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
