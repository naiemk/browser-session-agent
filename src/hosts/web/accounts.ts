import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nowIso, shortId } from "../../domain/ids.ts";

const scrypt = promisify(scryptCb);

export const OPERATOR_ACCOUNT_ID = "__operator__";

export interface AccountRecord {
  id: string;
  email: string;
  passwordHash: string;
  paidAt: string | null;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  accountId: string;
  createdAt: string;
}

export interface DeviceRecord {
  id: string;
  accountId: string;
  token: string;
  hostname?: string;
  createdAt: string;
  revokedAt?: string;
}

export interface PairCodeRecord {
  code: string;
  accountId: string;
  expiresAtMs: number;
}

export interface PairChallengeRecord {
  challenge: string;
  accountId?: string;
  deviceToken?: string;
  deviceId?: string;
  createdAtMs: number;
}

interface StoreFile {
  accounts: AccountRecord[];
  sessions: SessionRecord[];
  devices: DeviceRecord[];
  pairCodes: PairCodeRecord[];
  challenges: PairChallengeRecord[];
}

export class AccountStore {
  private data: StoreFile = {
    accounts: [],
    sessions: [],
    devices: [],
    pairCodes: [],
    challenges: [],
  };

  constructor(private readonly file: string) {}

  static async open(root: string): Promise<AccountStore> {
    const dir = path.join(root, "accounts");
    await mkdir(dir, { recursive: true });
    const store = new AccountStore(path.join(dir, "store.json"));
    await store.load();
    return store;
  }

  async register(email: string, password: string): Promise<AccountRecord> {
    const normalized = normalizeEmail(email);
    if (!normalized || !password) {
      throw Object.assign(new Error("email and password are required"), { status: 400, code: "invalid_input" });
    }
    if (this.data.accounts.some((a) => a.email === normalized)) {
      throw Object.assign(new Error("email already registered"), { status: 409, code: "email_taken" });
    }
    const account: AccountRecord = {
      id: shortId("acct"),
      email: normalized,
      passwordHash: await hashPassword(password),
      paidAt: null,
      createdAt: nowIso(),
    };
    this.data.accounts.push(account);
    await this.save();
    return account;
  }

  async login(email: string, password: string): Promise<{ account: AccountRecord; session: SessionRecord }> {
    const account = this.data.accounts.find((a) => a.email === normalizeEmail(email));
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      throw Object.assign(new Error("invalid credentials"), { status: 401, code: "unauthorized" });
    }
    const session: SessionRecord = {
      id: randomBytes(24).toString("hex"),
      accountId: account.id,
      createdAt: nowIso(),
    };
    this.data.sessions.push(session);
    await this.save();
    return { account, session };
  }

  async logout(sessionId: string | undefined): Promise<void> {
    if (!sessionId) return;
    this.data.sessions = this.data.sessions.filter((s) => s.id !== sessionId);
    await this.save();
  }

  accountForSession(sessionId: string | undefined): AccountRecord | undefined {
    if (!sessionId) return undefined;
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session) return undefined;
    return this.data.accounts.find((a) => a.id === session.accountId);
  }

  getAccount(id: string): AccountRecord | undefined {
    return this.data.accounts.find((a) => a.id === id);
  }

  async markPaid(accountId: string): Promise<AccountRecord> {
    const account = this.getAccount(accountId);
    if (!account) {
      throw Object.assign(new Error("account not found"), { status: 404, code: "not_found" });
    }
    account.paidAt = account.paidAt ?? nowIso();
    await this.save();
    return account;
  }

  async issuePairCode(accountId: string, ttlMs = 5 * 60_000): Promise<PairCodeRecord> {
    const code = randomBytes(8).toString("hex");
    const record: PairCodeRecord = {
      code,
      accountId,
      expiresAtMs: Date.now() + Math.max(0, Math.min(ttlMs, 5 * 60_000)),
    };
    this.data.pairCodes.push(record);
    await this.save();
    return record;
  }

  async exchangePairCode(
    code: string,
    hostname?: string,
    sessionAccountId?: string,
  ): Promise<{ device: DeviceRecord; token: string }> {
    const record = this.data.pairCodes.find((c) => c.code === code);
    if (!record) {
      throw Object.assign(new Error("invalid pair code"), { status: 401, code: "unauthorized" });
    }
    if (sessionAccountId && sessionAccountId !== record.accountId) {
      throw Object.assign(new Error("pair code belongs to another account"), { status: 403, code: "forbidden" });
    }
    if (record.expiresAtMs <= Date.now()) {
      this.data.pairCodes = this.data.pairCodes.filter((c) => c.code !== code);
      await this.save();
      throw Object.assign(new Error("pair code expired"), { status: 410, code: "expired" });
    }
    this.data.pairCodes = this.data.pairCodes.filter((c) => c.code !== code);
    const device = this.createDevice(record.accountId, hostname);
    this.data.devices.push(device);
    await this.save();
    return { device, token: device.token };
  }

  async prepareChallenge(challenge: string): Promise<void> {
    if (!challenge) {
      throw Object.assign(new Error("challenge is required"), { status: 400, code: "invalid_input" });
    }
    this.data.challenges = this.data.challenges.filter((c) => c.challenge !== challenge);
    this.data.challenges.push({ challenge, createdAtMs: Date.now() });
    await this.save();
  }

  async claimChallenge(accountId: string, challenge: string, hostname?: string): Promise<DeviceRecord> {
    const pending = this.data.challenges.find((c) => c.challenge === challenge);
    if (!pending) {
      throw Object.assign(new Error("unknown challenge"), { status: 404, code: "not_found" });
    }
    if (pending.accountId && pending.accountId !== accountId) {
      throw Object.assign(new Error("challenge belongs to another account"), { status: 403, code: "forbidden" });
    }
    const device = this.createDevice(accountId, hostname);
    pending.accountId = accountId;
    pending.deviceToken = device.token;
    pending.deviceId = device.id;
    this.data.devices.push(device);
    await this.save();
    return device;
  }

  async redeemChallenge(challenge: string): Promise<{ deviceToken: string; deviceId: string } | undefined> {
    const pending = this.data.challenges.find((c) => c.challenge === challenge);
    if (!pending?.deviceToken || !pending.deviceId) return undefined;
    const token = pending.deviceToken;
    const deviceId = pending.deviceId;
    this.data.challenges = this.data.challenges.filter((c) => c.challenge !== challenge);
    await this.save();
    return { deviceToken: token, deviceId };
  }

  deviceForToken(token: string | undefined): DeviceRecord | undefined {
    if (!token) return undefined;
    const device = this.data.devices.find((d) => d.token === token);
    if (!device || device.revokedAt) return undefined;
    return device;
  }

  listDevices(accountId: string): DeviceRecord[] {
    return this.data.devices.filter((d) => d.accountId === accountId);
  }

  async revokeDevice(accountId: string, deviceId: string): Promise<DeviceRecord> {
    const device = this.data.devices.find((d) => d.id === deviceId && d.accountId === accountId);
    if (!device) {
      throw Object.assign(new Error("device not found"), { status: 404, code: "not_found" });
    }
    device.revokedAt = nowIso();
    await this.save();
    return device;
  }

  publicView(account: AccountRecord) {
    return {
      id: account.id,
      email: account.email,
      paid: Boolean(account.paidAt),
      createdAt: account.createdAt,
    };
  }

  private createDevice(accountId: string, hostname?: string): DeviceRecord {
    return {
      id: shortId("dev"),
      accountId,
      token: `dt_${randomBytes(24).toString("hex")}`,
      hostname,
      createdAt: nowIso(),
    };
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw) as StoreFile;
      this.data = {
        accounts: parsed.accounts ?? [],
        sessions: parsed.sessions ?? [],
        devices: parsed.devices ?? [],
        pairCodes: parsed.pairCodes ?? [],
        challenges: parsed.challenges ?? [],
      };
    } catch {
      this.data = { accounts: [], sessions: [], devices: [], pairCodes: [], challenges: [] };
    }
  }

  private async save(): Promise<void> {
    await writeFile(this.file, JSON.stringify(this.data, null, 2));
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 32)) as Buffer;
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  const actual = (await scrypt(password, salt, 32)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
