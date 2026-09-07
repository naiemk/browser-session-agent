/**
 * Exclusive directory leases. mkdir is atomic; a holder file records owner, token, and
 * expiry so a dead process can be displaced after TTL.
 */

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "./atomic.ts";
import { systemClock, type Clock } from "./clock.ts";
import { CoreError } from "./types.ts";

export interface LeaseHolder {
  owner: string;
  token: string;
  expiresAt: string;
}

export interface Lease {
  dir: string;
  owner: string;
  token: string;
  heartbeat: () => Promise<void>;
  release: () => Promise<void>;
}

export interface AcquireLeaseOptions {
  owner: string;
  ttlMs: number;
  clock?: Clock;
  token?: string;
}

function holderFile(dir: string): string {
  return path.join(dir, "holder.json");
}

async function readHolder(dir: string): Promise<LeaseHolder | undefined> {
  return readJsonFile<LeaseHolder>(holderFile(dir));
}

function expired(holder: LeaseHolder | undefined, clock: Clock): boolean {
  if (!holder?.expiresAt) return true;
  return Date.parse(holder.expiresAt) <= clock.nowMs();
}

async function stealExpired(dir: string, clock: Clock): Promise<boolean> {
  const holder = await readHolder(dir);
  if (!expired(holder, clock)) return false;
  await rm(dir, { recursive: true, force: true });
  return true;
}

export async function acquireLease(
  dir: string,
  options: AcquireLeaseOptions,
): Promise<Lease | undefined> {
  const clock = options.clock ?? systemClock;
  const token = options.token ?? `${options.owner}-${clock.nowMs().toString(36)}`;
  const ttlMs = options.ttlMs;

  const tryMkdir = async (): Promise<boolean> => {
    await mkdir(path.dirname(dir), { recursive: true });
    try {
      await mkdir(dir, { recursive: false });
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") return false;
      throw err;
    }
  };

  let created = await tryMkdir();
  if (!created) {
    const stole = await stealExpired(dir, clock);
    if (!stole) return undefined;
    created = await tryMkdir();
    if (!created) return undefined;
  }

  const writeHolder = async () => {
    await writeJsonAtomic(holderFile(dir), {
      owner: options.owner,
      token,
      expiresAt: new Date(clock.nowMs() + ttlMs).toISOString(),
    } satisfies LeaseHolder);
  };

  await writeHolder();

  return {
    dir,
    owner: options.owner,
    token,
    heartbeat: writeHolder,
    release: async () => {
      const current = await readHolder(dir);
      if (current && current.token !== token) {
        throw new CoreError("lease_stolen", `lease at ${dir} is no longer ours`);
      }
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function peekLease(dir: string): Promise<LeaseHolder | undefined> {
  return readHolder(dir);
}
