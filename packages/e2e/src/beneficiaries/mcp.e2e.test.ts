// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { SCA_PENDING_TOKEN_RE } from "../sca-helpers.js";

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

// NOTE: `beneficiary_update` SCA E2E coverage is deferred — the Qonto
// sandbox `0909-future-club-2702` holds all 13 SEPA beneficiaries in
// `status: pending` (empirical 2026-05-12), and `PUT
// /v2/sepa/beneficiaries/{id}` returns `404 not_found` for pending
// records. Tracked as a follow-up to #551.
