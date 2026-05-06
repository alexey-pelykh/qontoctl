// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFile, execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { TransferSchema } from "@qontoctl/core";
import { beforeAll, describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials, hasStagingToken } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");
const execFileAsync = promisify(execFile);

/**
 * Pattern matching the SCA session polling URL the core HTTP client logs at
 * verbose level. Tokens are base64url, so they survive `encodeURIComponent`
 * unchanged and contain only `[A-Za-z0-9_-]`. See
 * `packages/core/src/sca/sca-service.ts#getScaSession` for the URL shape.
 */
const SCA_POLL_URL_RE = /\/v2\/sca\/sessions\/([A-Za-z0-9_-]+)(?=\s|$)/;

interface BeneficiaryItem {
  readonly id: string;
  readonly name: string;
  readonly iban: string;
  readonly status: string;
}

interface BankAccountItem {
  readonly id: string;
}

interface VopProofToken {
  readonly proof_token: { readonly token: string };
}

/**
 * Run the CLI synchronously for setup and approval helpers.
 */
function cliSync(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    cwd: cliCwd(),
    timeout: 25_000,
  });
}

function cliJson<T>(...args: string[]): T {
  return JSON.parse(cliSync("--output", "json", ...args)) as T;
}

describe.skipIf(!hasCredentials() || !hasStagingToken())("SCA continuation CLI (e2e, sandbox)", () => {
  let beneficiaryId: string;
  let bankAccountId: string;
  let vopProofToken: string;

  beforeAll(() => {
    const beneficiaries = cliJson<BeneficiaryItem[]>("beneficiary", "list");
    const validatedBeneficiary = beneficiaries.find((b) => b.status === "validated") ?? beneficiaries[0];
    if (validatedBeneficiary === undefined) {
      throw new Error("E2E setup: no beneficiaries available in sandbox");
    }
    beneficiaryId = validatedBeneficiary.id;

    const accounts = cliJson<BankAccountItem[]>("account", "list");
    const firstAccount = accounts[0];
    if (firstAccount === undefined) {
      throw new Error("E2E setup: no bank accounts available in sandbox");
    }
    bankAccountId = firstAccount.id;

    // Pre-resolve the VoP proof token so the SCA test does not race against
    // a separate VoP API call inside the per-test 30s budget.
    const vop = cliJson<VopProofToken>(
      "transfer",
      "verify-payee",
      "--iban",
      validatedBeneficiary.iban,
      "--name",
      validatedBeneficiary.name,
    );
    vopProofToken = vop.proof_token.token;
  });

  it("transfer create triggers SCA, mock-decision allow, retry succeeds", async () => {
    const reference = `e2e-sca-${randomUUID().slice(0, 12)}`;

    const child = spawn(
      "node",
      [
        CLI_PATH,
        "--verbose",
        "--output",
        "json",
        "transfer",
        "create",
        "--beneficiary",
        beneficiaryId,
        "--debit-account",
        bankAccountId,
        "--reference",
        reference,
        "--amount",
        "1.50",
        "--vop-proof-token",
        vopProofToken,
      ],
      {
        env: cliEnv(),
        cwd: cliCwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let stderrBuffer = "";
    let scaToken: string | undefined;
    let approvePromise: Promise<unknown> | undefined;

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (scaToken !== undefined) return;

      stderrBuffer += chunk;
      let nlIdx: number;
      while ((nlIdx = stderrBuffer.indexOf("\n")) !== -1) {
        const line = stderrBuffer.slice(0, nlIdx);
        stderrBuffer = stderrBuffer.slice(nlIdx + 1);

        if (scaToken !== undefined) continue;
        const match = line.match(SCA_POLL_URL_RE);
        if (match !== null && match[1] !== undefined) {
          scaToken = match[1];
          // Approve asynchronously so we keep draining stderr from the
          // primary child (filling the OS pipe buffer would deadlock it).
          approvePromise = execFileAsync("node", [CLI_PATH, "sca-session", "mock-decision", scaToken, "allow"], {
            env: cliEnv(),
            cwd: cliCwd(),
            timeout: 25_000,
          });
          // Attach a no-op error handler to avoid an "unhandled rejection"
          // warning if approve rejects before the test reaches the explicit
          // `await approvePromise` below (we still surface the failure there).
          approvePromise.catch(() => {});
        }
      }
    });

    const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
      child.on("error", rejectExit);
      child.on("close", (code) => {
        resolveExit(code ?? 1);
      });
    });

    if (exitCode !== 0) {
      throw new Error(
        `transfer create exited ${String(exitCode)}\n--- stderr ---\n${stderr}\n--- stdout ---\n${stdout}`,
      );
    }

    expect(scaToken, "expected to capture SCA session token from polling URL").toBeDefined();
    if (approvePromise !== undefined) {
      // Surface mock-decision failures (e.g., token expired, sandbox missing).
      await approvePromise;
    }

    // Spinner output is non-deterministic across terminals, so assert on the
    // wire-log lines that prove the SCA continuation actually exercised:
    // initial transfer POST + at least one SCA-session poll.
    expect(stderr).toMatch(/POST .*\/v2\/sepa\/transfers/);
    expect(stderr).toMatch(SCA_POLL_URL_RE);

    const transfer = JSON.parse(stdout) as Record<string, unknown>;
    TransferSchema.parse(transfer);
    expect(transfer).toHaveProperty("id");
    expect(transfer).toHaveProperty("beneficiary_id", beneficiaryId);
    expect(transfer).toHaveProperty("reference", reference);
  });
});
