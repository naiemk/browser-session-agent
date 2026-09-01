import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  closeV1,
  login,
  register,
  startV1Api,
  uniqueUser,
  type V1World,
} from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  delete process.env.BSA_REGISTER_OPEN;
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("PRE-02-T02 registration lock", () => {
  it("rejects new signups when BSA_REGISTER_OPEN=0 and still allows login", async () => {
    const world = await startV1Api({ requirePaid: false });
    worlds.push(world);
    const first = await uniqueUser();
    const { cookie } = await register(world.origin, first.email, first.password);
    assert.ok(cookie);

    process.env.BSA_REGISTER_OPEN = "0";
    const second = await uniqueUser();
    const denied = await fetch(`${world.origin}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: second.email, password: second.password }),
    });
    const body = (await denied.json()) as { code?: string };
    assert.equal(denied.status, 403);
    assert.equal(body.code, "registration_closed");

    const loggedIn = await login(world.origin, first.email, first.password);
    assert.equal(loggedIn.status, 200);
    assert.ok(loggedIn.cookie);
  });
});
