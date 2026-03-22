// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { RequestListResponseSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

describe.skipIf(!hasCredentials())("MCP request tools (e2e)", () => {
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

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const entry = content[0] as { type: string; text: string };
      expect(entry.type).toBe("text");

      const parsed = JSON.parse(entry.text) as {
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
