// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { IntlTransferRequirementsResponseSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { SCA_PENDING_TOKEN_RE } from "../sca-helpers.js";

interface IntlBeneficiary {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly country: string;
}

interface IntlQuote {
  readonly id: string;
}

describe.skipIf(!hasOAuthCredentials())("intl-transfer MCP tools (e2e)", () => {
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

    client = new Client({ name: "e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("intl_transfer_requirements", () => {
    it("returns requirements for a beneficiary", async () => {
      // First list intl beneficiaries to get an ID
      const listResult = await client.callTool({
        name: "intl_beneficiary_list",
        arguments: {},
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        international_beneficiaries: { id: string }[];
      };
      if (listParsed.international_beneficiaries.length === 0) return;

      const id = (listParsed.international_beneficiaries[0] as { id: string }).id;

      const result = await client.callTool({
        name: "intl_transfer_requirements",
        arguments: { id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      IntlTransferRequirementsResponseSchema.parse(parsed);
    });
  });
});

// OAuth+sandbox SCA probe for `intl_transfer_create` — local-only (requires
// OAuth credentials AND a staging token). Two-step pattern: call with
// `wait: false`, inspect response, conditionally branch on SCA-required
// vs. direct success. Mirrors `internal-transfers/mcp.e2e.test.ts`'s
// SCA probe (#549) — same conditional-outcome handling because empirical
// SCA enforcement for `intl_transfer_create` is unknown.
//
// Precondition: ≥1 intl-beneficiary across PROBE_CURRENCIES (typically
// provisioned by #552's create_intl_beneficiary E2E). Skips with a
// console warning otherwise.
describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("intl_transfer_create (OAuth+sandbox SCA probe)", () => {
  pinAuthPreference("oauth-first");

  const PROBE_CURRENCIES = ["USD", "GBP", "CHF", "CAD", "AUD", "JPY", "HKD", "SGD"];

  let probeClient: Client;
  let probeTransport: StdioClientTransport;

  beforeAll(async () => {
    probeTransport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });
    probeClient = new Client({ name: "e2e-intl-sca-probe", version: "0.0.0" });
    await probeClient.connect(probeTransport);
  });

  afterAll(async () => {
    await probeClient.close();
  });

  /**
   * Discover an existing intl-beneficiary by probing each corridor in
   * priority order. The MCP `intl_beneficiary_list` tool returns a
   * shape of `{ international_beneficiaries: [...] }`; iterate
   * currencies until we find one that yields a non-empty list.
   */
  async function discoverIntlBeneficiaryViaProbe(): Promise<IntlBeneficiary | undefined> {
    for (const currency of PROBE_CURRENCIES) {
      const result = await probeClient.callTool({
        name: "intl_beneficiary_list",
        arguments: { currency },
      });
      if (result.isError === true) continue;
      let parsed: { international_beneficiaries: IntlBeneficiary[] };
      try {
        parsed = JSON.parse(firstTextFromMcpResult(result)) as {
          international_beneficiaries: IntlBeneficiary[];
        };
      } catch {
        continue;
      }
      if (parsed.international_beneficiaries.length > 0 && parsed.international_beneficiaries[0] !== undefined) {
        return parsed.international_beneficiaries[0];
      }
    }
    return undefined;
  }

  it("triggers SCA round-trip OR returns transfer directly in OAuth+sandbox", async () => {
    const beneficiary = await discoverIntlBeneficiaryViaProbe();
    if (beneficiary === undefined) {
      console.warn(
        `[e2e] intl_transfer_create SCA probe: skipping — no intl-beneficiary found across ` +
          `[${PROBE_CURRENCIES.join(", ")}]. Provision one via #552's intl-beneficiary create flow ` +
          `and rerun.`,
      );
      return;
    }

    // Create a fresh single-use quote matching the beneficiary's corridor.
    const quoteResult = await probeClient.callTool({
      name: "intl_quote_create",
      arguments: {
        currency: beneficiary.currency,
        amount: 10,
        direction: "send",
      },
    });
    expect(quoteResult.isError).not.toBe(true);
    const quote = JSON.parse(firstTextFromMcpResult(quoteResult)) as IntlQuote;
    expect(quote.id.length).toBeGreaterThan(0);

    const reference = `e2e-intl-sca-mcp-${randomUUID().slice(0, 12)}`;
    const baseArgs = {
      beneficiary_id: beneficiary.id,
      quote_id: quote.id,
      fields: { reference },
    };

    // wait: false → server returns SCA-pending immediately on 428, no
    // inline polling. Canonical two-step pattern, mirroring
    // `internal-transfers/mcp.e2e.test.ts` (#549).
    const firstResult = (await probeClient.callTool({
      name: "intl_transfer_create",
      arguments: { ...baseArgs, wait: false },
    })) as CallToolResult;
    const firstText = firstTextFromMcpResult(firstResult);

    if (/^SCA required/.test(firstText)) {
      console.log(
        `[intl_transfer_create SCA probe] SCA triggered in OAuth+sandbox; round-trip exercised. ` +
          `Beneficiary currency: ${beneficiary.currency}.`,
      );
      const tokenMatch = firstText.match(SCA_PENDING_TOKEN_RE);
      if (tokenMatch === null || tokenMatch[1] === undefined) {
        throw new Error(`No "Session token: ..." line in SCA-pending response:\n${firstText}`);
      }
      const token = tokenMatch[1];
      expect(token).not.toBe("unknown");
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

      const approveResult = (await probeClient.callTool({
        name: "sca_session_mock_decision",
        arguments: { token, decision: "allow" },
      })) as CallToolResult;
      if (approveResult.isError === true) {
        throw new Error(`sca_session_mock_decision failed:\n${JSON.stringify(approveResult, null, 2)}`);
      }

      const retryResult = (await probeClient.callTool({
        name: "intl_transfer_create",
        arguments: { ...baseArgs, sca_session_token: token },
      })) as CallToolResult;
      expect(retryResult.isError).not.toBe(true);
      const retryText = firstTextFromMcpResult(retryResult);
      expect(retryText).not.toMatch(/^SCA required/);
      const transfer = JSON.parse(retryText) as { id: string };
      expect(transfer.id.length).toBeGreaterThan(0);
    } else {
      console.log(
        `[intl_transfer_create SCA probe] NO SCA in OAuth+sandbox at amount=10 EUR send. ` +
          `Beneficiary currency: ${beneficiary.currency}. ` +
          `The SCA round-trip primitives stay exercised by sca-continuation/ for transfer_create.`,
      );
      expect(firstResult.isError).not.toBe(true);
      const transfer = JSON.parse(firstText) as { id: string };
      expect(transfer.id.length).toBeGreaterThan(0);
    }
  });
});
