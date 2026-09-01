import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { closeV1, login, register, startV1Api, uniqueUser, type V1World } from "../helpers/v1.ts";

const worlds: V1World[] = [];

afterEach(async () => {
  while (worlds.length) await closeV1(worlds.pop()!);
});

describe("V1-01-T01 register and session", () => {
  it("registers, logs in, reads /me, and logs out", async () => {
    const world = await startV1Api();
    worlds.push(world);
    const user = await uniqueUser();

    const created = await register(world.origin, user.email, user.password);
    assert.equal(created.account.email, user.email);
    assert.match(created.cookie, /^bsa_session=/);

    const me = await fetch(`${world.origin}/me`, { headers: { cookie: created.cookie } });
    assert.equal(me.status, 200);
    const meBody = (await me.json()) as { account: { email: string } };
    assert.equal(meBody.account.email, user.email);

    const logout = await fetch(`${world.origin}/auth/logout`, {
      method: "POST",
      headers: { cookie: created.cookie },
    });
    assert.equal(logout.status, 200);

    const after = await fetch(`${world.origin}/me`, { headers: { cookie: created.cookie } });
    assert.equal(after.status, 401);
  });

  it("rejects the wrong password", async () => {
    const world = await startV1Api();
    worlds.push(world);
    const user = await uniqueUser();
    await register(world.origin, user.email, user.password);
    const bad = await login(world.origin, user.email, "wrong-password");
    assert.equal(bad.status, 401);
  });
});
