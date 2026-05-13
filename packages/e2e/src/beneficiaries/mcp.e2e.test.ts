// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { approveAndRetryMcp, SCA_PENDING_TOKEN_RE, triggerScaMcp } from "../sca-helpers.js";

interface Beneficiary {
  readonly id: string;
  readonly name: string;
  readonly iban: string;
  readonly status: string;
  readonly trusted: boolean;
}

/**
 * Generate a fresh mod-97-valid German IBAN per test run. Qonto sandbox
 * enforces IBAN uniqueness per organization (HTTP 400 "This IBAN has
 * already been taken" on `beneficiary_add`), so a static IBAN corpus
 * burns out after a handful of runs. See `cli.e2e.test.ts` for the
 * canonical rationale; both files keep their own copy to stay
 * self-contained.
 */
function generateValidGermanIban(): string {
  const BANK_CODE = "37040044";
  let accountDigits = randomUUID().replace(/\D/g, "");
  while (accountDigits.length < 10) {
    accountDigits += randomUUID().replace(/\D/g, "");
  }
  const account = accountDigits.slice(0, 10);
  const bban = BANK_CODE + account;
  const numericSeed = bban + "131400";
  let remainder = 0;
  for (const c of numericSeed) {
    remainder = (remainder * 10 + Number(c)) % 97;
  }
  const check = 98 - remainder;
  return `DE${check.toString().padStart(2, "0")}${bban}`;
}

/**
 * Call an SCA-gated MCP write tool with `wait: false`, inspect the
 * response, and either approve the SCA round-trip or assert direct
 * success. Mirrors the conditional-outcome pattern from
 * `internal-transfers/mcp.e2e.test.ts` (#549) and
 * `intl-transfers/mcp.e2e.test.ts` (#550).
 */
async function callWithConditionalSca(
  client: Client,
  toolName: string,
  baseArgs: Record<string, unknown>,
): Promise<{ readonly result: CallToolResult; readonly scaTriggered: boolean }> {
  const firstResult = (await client.callTool({
    name: toolName,
    arguments: { ...baseArgs, wait: false },
  })) as CallToolResult;
  const firstText = firstTextFromMcpResult(firstResult);

  if (/^SCA required/.test(firstText)) {
    const tokenMatch = firstText.match(SCA_PENDING_TOKEN_RE);
    if (tokenMatch === null || tokenMatch[1] === undefined) {
      throw new Error(`No "Session token: ..." line in SCA-pending response:\n${firstText}`);
    }
    const token = tokenMatch[1];
    expect(token).not.toBe("unknown");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

    const approveResult = (await client.callTool({
      name: "sca_session_mock_decision",
      arguments: { token, decision: "allow" },
    })) as CallToolResult;
    if (approveResult.isError === true) {
      throw new Error(`sca_session_mock_decision failed:\n${JSON.stringify(approveResult, null, 2)}`);
    }

    const retryResult = (await client.callTool({
      name: toolName,
      arguments: { ...baseArgs, sca_session_token: token },
    })) as CallToolResult;
    return { result: retryResult, scaTriggered: true };
  }

  return { result: firstResult, scaTriggered: false };
}

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("beneficiary MCP tools (e2e, SCA write paths)", () => {
  pinAuthPreference("oauth-first");

  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });
    client = new Client({ name: "e2e-beneficiary-sca", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it("beneficiary_add: triggers SCA round-trip OR creates directly", async () => {
    const runId = randomUUID().slice(0, 12);
    const name = `E2E SCA MCP Test ${runId}`;
    const iban = generateValidGermanIban();

    const { result, scaTriggered } = await callWithConditionalSca(client, "beneficiary_add", { name, iban });

    if (scaTriggered) {
      console.log(`[beneficiary_add SCA probe] SCA triggered in OAuth+sandbox; round-trip exercised.`);
    } else {
      console.log(`[beneficiary_add SCA probe] NO SCA in OAuth+sandbox for SEPA beneficiary_add.`);
    }

    expect(result.isError).not.toBe(true);
    const text = firstTextFromMcpResult(result);
    expect(text).not.toMatch(/^SCA required/);
    const beneficiary = JSON.parse(text) as Beneficiary;
    expect(beneficiary.id.length).toBeGreaterThan(0);
    expect(beneficiary.name).toBe(name);
    expect(beneficiary.iban).toBe(iban);
  });
});

// OAuth+sandbox SCA E2E for `beneficiary_update`. Local-only — gated on
// OAuth credentials + staging token. Symmetric to the CLI sibling above:
// `PUT /v2/sepa/beneficiaries/{id}` empirically requires a `validated`
// SEPA beneficiary (the sandbox returns `404 not_found` for `status:
// pending` records per #551, #559). The test fails loudly when no
// validated beneficiary exists in the sandbox rather than silently
// skipping, so the precondition gap stays visible.
//
// Uses the shared SCA helpers (`triggerScaMcp` + `approveAndRetryMcp`)
// from `sca-helpers.ts` per #559 AC. The two-step pattern with
// `wait: false` is the canonical Group 6 shape — the server returns
// `SCA required` immediately, the test approves via
// `sca_session_mock_decision`, then re-invokes with `sca_session_token`.
describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())(
  "beneficiary MCP tools (e2e, update SCA write path)",
  () => {
    pinAuthPreference("oauth-first");

    let client: Client;
    let transport: StdioClientTransport;
    let validatedBeneficiary: Beneficiary;

    beforeAll(async () => {
      transport = new StdioClientTransport({
        command: "node",
        args: [CLI_PATH, "mcp"],
        env: cliEnv(),
        stderr: "pipe",
      });
      client = new Client({ name: "e2e-beneficiary-update-sca", version: "0.0.0" });
      await client.connect(transport);

      const listResult = (await client.callTool({
        name: "beneficiary_list",
        arguments: { status: "validated", per_page: 100 },
      })) as CallToolResult;
      const listText = firstTextFromMcpResult(listResult);
      const list = JSON.parse(listText) as { beneficiaries: Beneficiary[] };
      if (list.beneficiaries.length === 0) {
        throw new Error(
          "E2E precondition unmet: no SEPA beneficiary with `status: validated` in the sandbox. " +
            "PUT /v2/sepa/beneficiaries/{id} returns 404 for pending records (see #551, #559), so this " +
            "test cannot exercise the SCA round-trip without one. Manually validate a beneficiary in the " +
            "Qonto sandbox UI, or wait for the SCA-trigger validation path on `beneficiary_add` to mature " +
            "so freshly-created records land in `validated`.",
        );
      }
      // Prefer a non-trusted beneficiary — trusted payees are SCA-exempt
      // under PSD2 Article 13(b), and the AC requires exercising the SCA
      // gate. Fall back to the first validated record if all are trusted
      // (defensive — sandbox state can drift) so the test still attempts
      // and fails-loudly via the helper rather than silently skipping the
      // SCA assertion.
      validatedBeneficiary = list.beneficiaries.find((b) => !b.trusted) ?? (list.beneficiaries[0] as Beneficiary);
    });

    afterAll(async () => {
      await client.close();
    });

    it("beneficiary_update: triggers SCA round-trip and applies name change", async () => {
      const newName = `E2E SCA MCP Update ${randomUUID().slice(0, 12)}`;

      const trigger = await triggerScaMcp(client, "beneficiary_update", {
        id: validatedBeneficiary.id,
        name: newName,
      });

      // AC #4 traceability (#445): the captured token must be a real
      // base64url, not the `"unknown"` sentinel the parser used to emit.
      expect(trigger.scaSessionToken).not.toBe("unknown");
      expect(trigger.scaSessionToken).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(trigger.pendingText).toContain("sca_session_show");
      expect(trigger.pendingText).toContain("sca_session_token");

      const retryResult = await approveAndRetryMcp(trigger, "allow");

      expect(retryResult.isError).not.toBe(true);
      const retryText = firstTextFromMcpResult(retryResult);
      expect(retryText).not.toMatch(/^SCA required/);
      const updated = JSON.parse(retryText) as Beneficiary;
      expect(updated.id).toBe(validatedBeneficiary.id);
      expect(updated.name).toBe(newName);
    });
  },
);
