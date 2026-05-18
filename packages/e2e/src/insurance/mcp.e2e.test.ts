// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InsuranceContractSchema, InsuranceDocumentSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLI_PATH,
  firstTextFromMcpResult,
  type LifecycleSkipCarrier,
  assertLifecycleState,
  skipIfToolError,
  skipIfUpstreamSkipped,
} from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

/**
 * Absolute path to the committed PDF fixture used by the document upload
 * round-trip. Shared with attachments/client-invoice/supplier-invoice E2E.
 */
const PDF_FIXTURE_PATH = resolve(import.meta.dirname, "..", "..", "fixtures", "tiny.pdf");

interface InsuranceDocumentRef {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

describe.skipIf(!hasOAuthCredentials())("insurance MCP tools (e2e)", () => {
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

  describe("insurance CRUD lifecycle", () => {
    const lifecycleSkip: LifecycleSkipCarrier = { reason: undefined };
    let createdId: string | undefined;

    it("creates an insurance contract", async (ctx) => {
      const result = await client.callTool({
        name: "insurance_create",
        arguments: {
          name: "E2E MCP ProLiability Plan",
          contract_id: `e2e-mcp-${Date.now()}`,
          origin: "qonto_other",
          provider_slug: "axa",
          type: "professional_liability",
          status: "active",
          payment_frequency: "annual",
          price_value: "99.99",
          price_currency: "EUR",
          start_date: "2026-01-01",
        },
      });

      // Insurance is an OAuth feature that some sandbox orgs do not have
      // provisioned. Surface as visible feature-not-supported skip and
      // propagate to downstream tests via the lifecycle carrier (#605).
      skipIfToolError(result, ctx, "feature-not-supported", "insurance_create", lifecycleSkip);

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      InsuranceContractSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("type", "professional_liability");
      createdId = parsed["id"] as string;
    });

    it("shows the created insurance contract", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdId, "createdId");

      const result = await client.callTool({
        name: "insurance_show",
        arguments: { id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      InsuranceContractSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", id);
    });

    it("updates the created insurance contract", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdId, "createdId");

      const result = await client.callTool({
        name: "insurance_update",
        arguments: {
          id,
          provider_slug: "allianz",
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", id);
      expect(parsed).toHaveProperty("provider_slug", "allianz");
    });

    // Real document upload + delete round-trip against the live sandbox — closes
    // the audit gap from umbrella #449 (Group 4b): insurance document write
    // paths were fully implemented but uncovered by E2E. Reuses the `createdId`
    // closure variable from the CRUD lifecycle above so the contract is shared
    // across the suite (mirrors the attachment pattern in #453). The PDF
    // fixture (`packages/e2e/fixtures/tiny.pdf`) landed with #G4A.
    let uploadedDocId: string | undefined;

    it("uploads a document via insurance_upload_document", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdId, "createdId");

      // `type` is required by the Qonto API (one of contract, amendment,
      // invoice, other, policy, certificate — empirically observed values).
      const result = await client.callTool({
        name: "insurance_upload_document",
        arguments: { contract_id: id, file_path: PDF_FIXTURE_PATH, type: "contract" },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      InsuranceDocumentSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("name", "tiny.pdf");
      expect(parsed).toHaveProperty("type", "contract");
      uploadedDocId = parsed["id"] as string;
    });

    it("insurance_show reflects the uploaded document", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdId, "createdId");
      const docId = assertLifecycleState(uploadedDocId, "uploadedDocId");

      const result = await client.callTool({
        name: "insurance_show",
        arguments: { id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      InsuranceContractSchema.parse(parsed);
      const documents = (parsed["documents"] as readonly InsuranceDocumentRef[] | null | undefined) ?? [];
      expect(documents.map((d) => d.id)).toContain(docId);
    });

    it("removes the document via insurance_remove_document", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const id = assertLifecycleState(createdId, "createdId");
      const docId = assertLifecycleState(uploadedDocId, "uploadedDocId");

      const removeResult = await client.callTool({
        name: "insurance_remove_document",
        arguments: { contract_id: id, document_id: docId },
      });
      expect(removeResult.isError).toBeFalsy();

      const showResult = await client.callTool({
        name: "insurance_show",
        arguments: { id },
      });
      expect(showResult.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(showResult)) as Record<string, unknown>;
      const documents = (parsed["documents"] as readonly InsuranceDocumentRef[] | null | undefined) ?? [];
      expect(documents.map((d) => d.id)).not.toContain(docId);
    });
  });
});
