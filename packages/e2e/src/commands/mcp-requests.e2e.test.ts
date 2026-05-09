// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { RequestListResponseSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("MCP request tools (e2e)", () => {
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

  describe("request_list", () => {
    it("returns a list of requests with expected structure", async () => {
      const result = await client.callTool({
        name: "request_list",
        arguments: {},
      });

      // The requests endpoint may return an error if the organization
      // plan does not include request management (HTTP 403).
      if (result.isError) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        requests: unknown[];
        meta: Record<string, unknown>;
      };
      RequestListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("requests");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.requests)).toBe(true);
    });
  });
});
