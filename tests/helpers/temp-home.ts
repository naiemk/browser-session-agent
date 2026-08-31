import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function tempHome(): Promise<{ home: string; cleanup: () => Promise<void> }> {
  const home = await mkdtemp(path.join(os.tmpdir(), "bsa-"));
  return {
    home,
    cleanup: async () => {
      await rm(home, { recursive: true, force: true });
    },
  };
}
