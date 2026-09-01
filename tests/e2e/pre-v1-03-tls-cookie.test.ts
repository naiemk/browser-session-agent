import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { closeV1, cookieFromResponse, startV1Api, uniqueUser, type V1World } from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  delete process.env.BSA_COOKIE_SECURE;
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("PRE-03-T02 Secure cookie on HTTPS", () => {
  it("sets Secure when X-Forwarded-Proto is https and omits it on plain HTTP", async () => {
    const world = await startV1Api({ requirePaid: false });
    worlds.push(world);
    const user = await uniqueUser();

    const httpRes = await fetch(`${world.origin}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    assert.equal(httpRes.status, 201);
    const httpCookie = httpRes.headers.get("set-cookie") ?? "";
    assert.match(httpCookie, /bsa_session=/);
    assert.match(httpCookie, /HttpOnly/i);
    assert.match(httpCookie, /SameSite=Lax/i);
    assert.doesNotMatch(httpCookie, /;\s*Secure/i);
    assert.ok(cookieFromResponse(httpRes));

    const loginUser = await uniqueUser();
    await fetch(`${world.origin}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: loginUser.email, password: loginUser.password }),
    });
    const httpsRes = await fetch(`${world.origin}/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ email: loginUser.email, password: loginUser.password }),
    });
    assert.equal(httpsRes.status, 200);
    const httpsCookie = httpsRes.headers.get("set-cookie") ?? "";
    assert.match(httpsCookie, /Secure/i);
    assert.match(httpsCookie, /HttpOnly/i);
  });
});
