import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveHome } from "../../store/paths.ts";

export interface StoredDeviceCredential {
  deviceToken: string;
  deviceId?: string;
  accountId?: string;
}

export function credentialPath(home?: string): string {
  const root = home ?? resolveHome();
  return path.join(root, "credentials", "device.json");
}

export async function loadDeviceCredential(home?: string): Promise<StoredDeviceCredential | undefined> {
  try {
    const raw = await readFile(credentialPath(home), "utf8");
    const parsed = JSON.parse(raw) as StoredDeviceCredential;
    if (parsed.deviceToken) return parsed;
  } catch {
    // none
  }
  return undefined;
}

export async function saveDeviceCredential(cred: StoredDeviceCredential, home?: string): Promise<void> {
  const file = credentialPath(home);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(cred, null, 2));
}
