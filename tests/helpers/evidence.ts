import type { Ledger } from "../../src/core/ledger.ts";
import type { GoalStore } from "../../src/core/state.ts";
import { factsFrom, memoryEvidence, type Evidence } from "../../src/runtime/evidence.ts";

/**
 * Evidence backed by a real ledger, for tests that read the trace back.
 *
 * The tools now require somewhere to record, so a test cannot accidentally assert on an
 * agent that was quietly writing nowhere - which is precisely what the product was doing.
 */
export function ledgerEvidence(
  ledger: Ledger,
  parts: { store?: GoalStore } & Partial<Evidence> = {},
): Evidence {
  const { store, ...overrides } = parts;
  return memoryEvidence({
    ledger,
    screenshotDir: ledger.artifactsDir,
    ...(store ? { facts: factsFrom(store) } : {}),
    ...overrides,
  });
}
