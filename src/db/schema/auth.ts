import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { school } from "./school";

// Better Auth's tables (core, username and admin plugins) plus our own sign in
// throttle and audit log (spec 0004). Field keys match Better Auth's names.

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Placeholder `<uuid>@users.voxlms.invalid`; no email is ever sent. */
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  /** The phone number as digits, e.g. 2348031234567. */
  username: text("username").unique(),
  displayUsername: text("display_username"),
  /** `admin` is our team; everyone else is `user`. */
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: ts("ban_expires"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    /** Set on the server from the "shared computer" tick; never from client input. */
    sharedDevice: boolean("shared_device").notNull().default(false),
    /** When this person last typed their password (sign in or re-entry); gates sensitive team actions. */
    passwordConfirmedAt: ts("password_confirmed_at"),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

/** Holds setup link tokens, stored hashed (`reset-password:<token>` → user id). */
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier), index("verification_value_idx").on(t.value)],
);

/** Wrong password counters (spec 0004, AC-6). Keys: phone, phone+ip, ip, admin. */
export const signInThrottle = pgTable("sign_in_throttle", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull(),
  windowStartedAt: ts("window_started_at").notNull(),
});

export const authEventKind = pgEnum("auth_event_kind", [
  "sign_in",
  "sign_in_failed",
  "sign_out",
  "setup_link_created",
  "password_set",
  "password_changed",
  "phone_changed",
  "signed_out_everywhere",
  "login_created",
  "login_disabled",
  "login_enabled",
  "view_as_started",
  "view_as_ended",
]);

/** Add only audit log (spec 0004, AC-11). A trigger refuses updates and deletes. */
export const authEvent = pgTable(
  "auth_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: authEventKind("kind").notNull(),
    userId: text("user_id").references(() => user.id),
    actorUserId: text("actor_user_id").references(() => user.id),
    schoolId: uuid("school_id").references(() => school.id),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    detail: jsonb("detail"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("auth_event_user_idx").on(t.userId, t.createdAt), index("auth_event_created_idx").on(t.createdAt)],
);
