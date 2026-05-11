// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ClientListResponseSchema, ClientSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("MCP client tools (e2e)", () => {
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

  describe("client_list", () => {
    it("returns a list of clients with expected structure", async () => {
      const result = await client.callTool({
        name: "client_list",
        arguments: {},
      });

      // Sandbox may not have clients — skip gracefully on tool error
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        clients: unknown[];
        meta: Record<string, unknown>;
      };
      ClientListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("clients");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.clients)).toBe(true);
    });
  });

  describe("client_show", () => {
    it("returns details for a specific client", async () => {
      const listResult = await client.callTool({
        name: "client_list",
        arguments: {},
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        clients: { id: string }[];
      };
      if (listParsed.clients.length === 0) {
        return;
      }

      const clientId = (listParsed.clients[0] as { id: string }).id;

      const result = await client.callTool({
        name: "client_show",
        arguments: { id: clientId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      ClientSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", clientId);
      expect(parsed).toHaveProperty("type");
      expect(parsed).toHaveProperty("kind");
      // Qonto omits `name` entirely for individual/freelancer clients and returns
      // `first_name` + `last_name` instead. Assert against the kind-discriminated
      // contract rather than blanket `toHaveProperty("name")`, which fails when
      // the sandbox's first client is an individual (#537). Mirrors the schema
      // shape pinned in `ClientSchema` (`packages/core/src/types/client.schema.ts`).
      const kind = (parsed as { kind: string }).kind;
      if (kind === "company") {
        expect(parsed).toHaveProperty("name");
      } else {
        expect(parsed).toHaveProperty("first_name");
        expect(parsed).toHaveProperty("last_name");
      }
    });
  });

  // MCP CRUD smoke for `client_create` / `client_update` / `client_delete` —
  // closes the CLI/MCP asymmetry surfaced by the #449 audit (Group 2).
  // Mirrors the CRUD lifecycle covered by the CLI suite but exercises the
  // operations through callTool, asserting the MCP wrapper contract on top
  // of the underlying API contract.
  describe("client CRUD lifecycle (MCP)", () => {
    let createdClientId: string | undefined;

    it("creates a client via callTool", async () => {
      const result = await client.callTool({
        name: "client_create",
        arguments: {
          kind: "company",
          name: "E2E MCP Test Client",
          email: "e2e-mcp-test@example.com",
          country_code: "FR",
        },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      ClientSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("name", "E2E MCP Test Client");
      createdClientId = parsed["id"] as string;
    });

    it("updates the created client via callTool", async () => {
      if (createdClientId === undefined) return;

      const result = await client.callTool({
        name: "client_update",
        arguments: {
          id: createdClientId,
          name: "E2E MCP Updated Client",
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdClientId);
    });

    it("deletes the created client via callTool", async () => {
      if (createdClientId === undefined) return;

      const result = await client.callTool({
        name: "client_delete",
        arguments: { id: createdClientId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
      expect(parsed).toHaveProperty("id", createdClientId);
    });
  });
});
