import path from "node:path";
import { SqliteJobRepository } from "../infrastructure/sqlite/repository.ts";
import { JobApplicationService } from "../application/service.ts";
import type { ExecutionHost } from "../ports/execution-kernel.ts";
import {
  validatePrototypeRoot,
  archivePrototypeJob,
  importPrototypeReadOnly,
} from "../infrastructure/prototype-import.ts";
import { coreRoot } from "../../core/paths.ts";
import { BrowserSession } from "../../session.ts";
import { createLiveModel, resolveKey, KEY_ENV_NAMES } from "../../runtime/model.ts";
import {
  createProductExecutionHost,
  REMEDIATION_NO_HOST,
  REMEDIATION_NO_MODEL,
  REMEDIATION_NO_WORKER,
} from "../infrastructure/product-host.ts";

export interface DurableCliArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function flagString(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function dbPath(root: string): string {
  return path.join(root, "durable", "control.sqlite");
}

function wantsHostAttach(flags: Record<string, string | boolean>): boolean {
  if (flags.host === true || flags.host === "1") return true;
  return process.env.BSA_DURABLE_HOST === "1";
}

function anyProviderKey(): boolean {
  return Object.keys(KEY_ENV_NAMES).some((provider) => Boolean(resolveKey(provider)));
}

export interface AttachedHost {
  host: ExecutionHost | null;
  remediation: string;
  close: () => Promise<void>;
}

/**
 * ADAPTER-04 — construct Magpie persistent host + live model, or null with remediation.
 * Never a fake completed kernel. Call close() after the tick so Chrome does not leak.
 */
export async function attachDurableHost(options: {
  root: string;
  headless?: boolean;
  attach: boolean;
}): Promise<AttachedHost> {
  if (!options.attach) {
    return {
      host: null,
      remediation: REMEDIATION_NO_HOST,
      close: async () => undefined,
    };
  }

  if (!anyProviderKey()) {
    return {
      host: null,
      remediation: REMEDIATION_NO_MODEL,
      close: async () => undefined,
    };
  }

  let live;
  try {
    live = await createLiveModel({ model: process.env.BSA_DURABLE_MODEL });
  } catch (err) {
    return {
      host: null,
      remediation: `${REMEDIATION_NO_MODEL} (${err instanceof Error ? err.message : String(err)})`,
      close: async () => undefined,
    };
  }

  const session = new BrowserSession({
    // Isolate the durable attach profile under the job root — do not steal the
    // interactive Magpie home profile when another Chrome already holds it.
    home: path.join(options.root, "durable", "magpie-host"),
    cwd: options.root,
    headless: options.headless ?? process.env.BSA_HEADLESS === "1",
  });

  try {
    await session.worker.start();
  } catch (err) {
    await session.worker.stop().catch(() => undefined);
    return {
      host: null,
      remediation: `${REMEDIATION_NO_WORKER} (${err instanceof Error ? err.message : String(err)})`,
      close: async () => undefined,
    };
  }

  const host = createProductExecutionHost({
    worker: session.worker,
    stream: live.stream,
    model: live.model,
    profileKey: "local",
    root: options.root,
  });

  if (!host) {
    await session.worker.stop().catch(() => undefined);
    return {
      host: null,
      remediation: REMEDIATION_NO_WORKER,
      close: async () => undefined,
    };
  }

  return {
    host,
    remediation: REMEDIATION_NO_HOST,
    close: async () => {
      await session.worker.stop().catch(() => undefined);
    },
  };
}

export async function commandDurable(args: DurableCliArgs): Promise<number> {
  const root = flagString(args.flags, "root") ?? coreRoot();
  const json = Boolean(args.flags.json);
  const verb = args.positional[0] ?? "help";
  const rest = args.positional.slice(1);
  const print = (value: unknown) => {
    process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
  };

  try {
    if (verb === "help") {
      process.stdout.write(`Jobs V2 (durable) commands — experimental production path

  browser-agent durable create "<objective>" [--title NAME] [--root DIR]
  browser-agent durable propose <jobId> --spec <file.json> [--root DIR]
  browser-agent durable approve <jobId> --hash <hash> [--root DIR]
  browser-agent durable status <jobId> [--root DIR]
  browser-agent durable cancel <jobId> [--root DIR]
  browser-agent durable tick <jobId>|--due [--root DIR] [--host] [--json]
  browser-agent durable prototype validate|import|archive [--root DIR] [--job ID] [--dry-run]

Requires Node 24 node:sqlite. Prototype job commands remain quarantined separately.

Tick without --host (or BSA_DURABLE_HOST=1) returns runtime_unavailable (exit 4).
--host / BSA_DURABLE_HOST=1 attaches the Magpie persistent profile + a live model.
If the worker or model cannot start, the tick still exits 4 (never fake success).
`);
      return 0;
    }

    if (verb === "prototype") {
      const action = rest[0];
      const dryRun = Boolean(args.flags["dry-run"] || args.flags.dryRun);
      if (action === "validate") {
        print(await validatePrototypeRoot(root));
        return 0;
      }
      if (action === "import") {
        const jobId = flagString(args.flags, "job") ?? rest[1];
        if (!jobId) {
          process.stderr.write("import needs --job <id>\n");
          return 2;
        }
        const result = await importPrototypeReadOnly(root, jobId, { dryRun });
        print(result);
        if (result.class === "malformed" || result.class === "missing" || result.class === "unsupported") {
          return 3;
        }
        return 0;
      }
      if (action === "archive") {
        const jobId = flagString(args.flags, "job") ?? rest[1];
        if (!jobId) {
          process.stderr.write("archive needs --job <id>\n");
          return 2;
        }
        const result = await archivePrototypeJob(root, jobId, path.join(root, "archive"), { dryRun });
        print(result);
        if (result.class === "malformed" || result.class === "missing") {
          return 3;
        }
        return 0;
      }
      process.stderr.write("prototype needs validate|import|archive\n");
      return 2;
    }

    const repo = SqliteJobRepository.open(dbPath(root));
    let attached: AttachedHost | undefined;
    try {
      const needsHost = verb === "tick";
      attached = needsHost
        ? await attachDurableHost({
            root,
            attach: wantsHostAttach(args.flags),
            headless: Boolean(args.flags.headless) || process.env.BSA_HEADLESS === "1",
          })
        : {
            host: null,
            remediation: REMEDIATION_NO_HOST,
            close: async () => undefined,
          };

      const hostFactory = (): ExecutionHost | null => attached?.host ?? null;
      const service = new JobApplicationService(repo, hostFactory);

      if (verb === "create") {
        const objective = rest.join(" ").trim();
        const job = await service.create({ objective, title: flagString(args.flags, "title") });
        print(json ? job : `${job.jobId}  ${job.title}  ${job.lifecycle}`);
        return 0;
      }
      if (verb === "status") {
        print(await service.status(rest[0] ?? ""));
        return 0;
      }
      if (verb === "cancel") {
        print(await service.cancel({ type: "CancelJob", jobId: rest[0] ?? "" }));
        return 0;
      }
      if (verb === "propose") {
        const specPath = flagString(args.flags, "spec");
        if (!specPath) {
          process.stderr.write("propose needs --spec <file>\n");
          return 2;
        }
        const { readFile } = await import("node:fs/promises");
        const draft = JSON.parse(await readFile(specPath, "utf8"));
        const proposed = await service.propose(rest[0] ?? "", draft);
        print({ jobId: proposed.jobId, hash: proposed.hash, version: proposed.version });
        return 0;
      }
      if (verb === "approve") {
        const hash = flagString(args.flags, "hash");
        if (!hash) {
          process.stderr.write("approve needs --hash\n");
          return 2;
        }
        print(await service.approve(rest[0] ?? "", hash));
        return 0;
      }
      if (verb === "tick") {
        const withRemediation = <T extends { status: string; detail?: string }>(result: T): T => {
          if (result.status === "runtime_unavailable") {
            return { ...result, detail: attached?.remediation ?? result.detail ?? REMEDIATION_NO_HOST };
          }
          return result;
        };

        if (args.flags.due) {
          const results = (await service.tickDue()).map(withRemediation);
          print(results);
          if (results.some((r) => r.status === "runtime_unavailable")) {
            process.stderr.write(`${attached?.remediation ?? REMEDIATION_NO_HOST}\n`);
            return 4;
          }
          return 0;
        }
        const result = withRemediation(await service.tick(rest[0] ?? ""));
        print(result);
        if (result.status === "runtime_unavailable") {
          process.stderr.write(`${attached?.remediation ?? REMEDIATION_NO_HOST}\n`);
          return 4;
        }
        return 0;
      }
      process.stderr.write(`unknown durable verb "${verb}"\n`);
      return 2;
    } finally {
      await attached?.close().catch(() => undefined);
      repo.close();
    }
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
