// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { IntlBeneficiaryListResponseSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult, skipIfToolError, skipMissingFixture } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

// NOTE: This suite covers `intl_beneficiary_list` and `intl_beneficiary_requirements`
// only — the SCA write paths (`intl_beneficiary_add`/`update`/`remove`) are
// blocked by a sandbox-side HTTP 500 on `POST /v2/international/beneficiaries`
// and are tracked separately under #561. Preconditions documented:
//   - precondition: docs/qonto-sandbox-preconditions.md#post-v2-international-beneficiaries
//   - precondition: docs/qonto-sandbox-preconditions.md#put-v2-international-beneficiaries-id
//   - precondition: docs/qonto-sandbox-preconditions.md#delete-v2-international-beneficiaries-id

describe.skipIf(!hasOAuthCredentials())("intl-beneficiary MCP tools (e2e)", () => {
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

  describe("intl_beneficiary_list", () => {
    it("returns a list with expected structure", async (ctx) => {
      const result = await client.callTool({
        name: "intl_beneficiary_list",
        arguments: { currency: "USD" },
      });

      skipIfToolError(result, ctx, "feature-not-supported", "intl_beneficiary_list");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        international_beneficiaries: unknown[];
        meta: Record<string, unknown>;
      };
      IntlBeneficiaryListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("international_beneficiaries");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.international_beneficiaries)).toBe(true);
    });

    it("supports pagination", async (ctx) => {
      const result = await client.callTool({
        name: "intl_beneficiary_list",
        arguments: { currency: "USD", per_page: 2, page: 1 },
      });

      skipIfToolError(result, ctx, "feature-not-supported", "intl_beneficiary_list");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        international_beneficiaries: unknown[];
        meta: { current_page: number };
      };
      expect(parsed.international_beneficiaries.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });
  });

  describe("intl_beneficiary_requirements", () => {
    it("returns requirements for an existing beneficiary", async (ctx) => {
      const listResult = await client.callTool({
        name: "intl_beneficiary_list",
        arguments: { currency: "USD" },
      });
      skipIfToolError(listResult, ctx, "feature-not-supported", "intl_beneficiary_list");

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        international_beneficiaries: { id: string }[];
      };
      if (listParsed.international_beneficiaries.length === 0) {
        skipMissingFixture(ctx, "no international beneficiaries in sandbox");
      }

      const id = (listParsed.international_beneficiaries[0] as { id: string }).id;

      const result = await client.callTool({
        name: "intl_beneficiary_requirements",
        arguments: { id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("requirements");
    });
  });
});
