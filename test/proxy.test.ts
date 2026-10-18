import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

// The quick sign in redirect (spec 0004) must not catch Server Actions: a
// signed out save has to reach the action, which answers "signed out" so the
// sheet can say so and keep the typed scores (spec 0009, AC-5).

const SHEET = "http://localhost:3003/gracehigh/classes/c/scores/s";

describe("proxy", () => {
  it("sends a page request with no session cookie to sign in", () => {
    const res = proxy(new NextRequest(SHEET));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3003/login");
  });

  it("lets a Server Action with no session cookie through to answer for itself", () => {
    const res = proxy(new NextRequest(SHEET, { method: "POST", headers: { "next-action": "7f00aa" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
