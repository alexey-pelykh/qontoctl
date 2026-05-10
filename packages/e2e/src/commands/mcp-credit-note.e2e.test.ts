// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CreditNoteListResponseSchema, CreditNoteSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

// MCP smoke for `credit_note_list` / `credit_note_show` — closes the
// CLI/MCP asymmetry surfaced by the #449 audit (Group 2). The CLI suite
// (`commands/credit-note.e2e.test.ts`) covers the same operations; this
// file exercises them through the MCP wrapper.
describe.skipIf(!hasApiKeyCredentials())("MCP credit-note tools (e2e)", () => {
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

  describe("credit_note_list", () => {
    it("returns a list of credit notes with expected structure", async () => {
      const result = await client.callTool({
        name: "credit_note_list",
        arguments: {},
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        credit_notes: unknown[];
        meta: Record<string, unknown>;
      };
      CreditNoteListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("credit_notes");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.credit_notes)).toBe(true);
    });

    it("supports pagination", async () => {
      const result = await client.callTool({
        name: "credit_note_list",
        arguments: { per_page: 2, page: 1 },
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        credit_notes: unknown[];
        meta: { current_page: number };
      };
      expect(parsed.credit_notes.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });
  });

  describe("credit_note_show", () => {
    it("returns details for a specific credit note", async () => {
      const listResult = await client.callTool({
        name: "credit_note_list",
        arguments: {},
      });

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        credit_notes: { id: string }[];
      };
      if (listParsed.credit_notes.length === 0) {
        return; // No credit notes in account — nothing to show
      }

      const firstCreditNote = listParsed.credit_notes[0];
      expect(firstCreditNote).toBeDefined();
      const creditNoteId = (firstCreditNote as { id: string }).id;

      const result = await client.callTool({
        name: "credit_note_show",
        arguments: { id: creditNoteId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      CreditNoteSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", creditNoteId);
      expect(parsed).toHaveProperty("number");
      expect(parsed).toHaveProperty("currency");
    });
  });
});
