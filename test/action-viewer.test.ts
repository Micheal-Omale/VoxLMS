import { createHmac, randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { getActionViewer, getViewer } from "@/server/auth/viewer";

// Spec 0009, AC-5: a save whose session ended on the server must answer
// "signed out", not jump to sign in. Inside a Server Action any cookie Better
// Auth writes through its next-cookies plugin makes Next re-render the page,
// and the page's sign in check then redirects. So the lookup the score
// actions use must never write cookies.
//
// Better Auth runs from node_modules, outside Vitest's mocks, so the real
// plugin can't be watched writing to next/headers. Our config imports the
// plugin, so it is swapped here for one that records every Set-Cookie its
// auth instance would hand to Next.

const written = vi.hoisted(() => ({ cookies: [] as string[], cookie: "" }));

vi.mock("better-auth/next-js", async () => {
  const { createAuthMiddleware } = await import("better-auth/api");
  return {
    nextCookies: () => ({
      id: "next-cookies",
      hooks: {
        after: [
          {
            matcher: () => true,
            handler: createAuthMiddleware(async (ctx) => {
              const setCookie = ctx.context.responseHeaders?.get("set-cookie");
              if (setCookie) written.cookies.push(setCookie);
            }),
          },
        ],
      },
    }),
  };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: written.cookie, "next-action": "abc123" }) }));

/** A correctly signed cookie for a session that does not exist (it ended on the server). */
function endedSessionCookie() {
  const token = randomUUID().replace(/-/g, "");
  const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

beforeEach(() => {
  written.cookies = [];
  written.cookie = endedSessionCookie();
});

afterAll(async () => {
  await db.$client.end();
});

describe("finding the viewer for a Server Action (AC-5)", () => {
  it("the page lookup hands Next a cookie clearing write for a dead session, the write that made the page redirect", async () => {
    expect(await getViewer()).toBeNull();
    expect(written.cookies.join("\n")).toMatch(/better-auth\.session_token=; .*Max-Age=0/);
  });

  it("the action lookup finds no viewer and hands Next no cookie, so the action can answer signed out", async () => {
    expect(await getActionViewer()).toBeNull();
    expect(written.cookies).toEqual([]);
  });

  it("finds no viewer and writes no cookie when there is no session cookie at all", async () => {
    written.cookie = "";
    expect(await getActionViewer()).toBeNull();
    expect(written.cookies).toEqual([]);
  });
});
