// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

describe("SCA session MCP tools", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("sca_session_show", () => {
    let mcpClient: Client;

    beforeEach(async () => {
      ({ mcpClient } = await connectInMemory(fetchSpy));
    });

    it("returns the session status as JSON text content", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "waiting" } }));

      const result = await mcpClient.callTool({
        name: "sca_session_show",
        arguments: { token: "tok-123" },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      expect(first.type).toBe("text");
      const parsed = JSON.parse(first.text) as { token: string; status: string };
      expect(parsed).toEqual({ token: "tok-123", status: "waiting" });
    });

    it("calls GET /v2/sca/sessions/<token>", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));

      await mcpClient.callTool({
        name: "sca_session_show",
        arguments: { token: "tok-456" },
      });

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/sca/sessions/tok-456");
      expect(init.method).toBe("GET");
    });

    it("propagates each session status (waiting/allow/deny)", async () => {
      const statuses = ["waiting", "allow", "deny"] as const;
      for (const status of statuses) {
        fetchSpy.mockReturnValueOnce(jsonResponse({ sca_session: { status } }));

        const result = await mcpClient.callTool({
          name: "sca_session_show",
          arguments: { token: `tok-${status}` },
        });

        const content = result.content as { type: string; text: string }[];
        const first = content[0] as { type: string; text: string };
        const parsed = JSON.parse(first.text) as { status: string };
        expect(parsed.status).toBe(status);
      }
    });

    it("formats Qonto API errors via the shared error wrapper", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ errors: [{ code: "not_found", detail: "SCA session not found" }] }, { status: 404 }),
      );

      const result = await mcpClient.callTool({
        name: "sca_session_show",
        arguments: { token: "tok-missing" },
      });

      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      const first = content[0] as { type: string; text: string };
      expect(first.text).toContain("Qonto API error (HTTP 404)");
      expect(first.text).toContain("not_found");
    });
  });

  describe("sca_session_mock_decision", () => {
    describe("in sandbox mode", () => {
      let mcpClient: Client;

      beforeEach(async () => {
        ({ mcpClient } = await connectInMemory(fetchSpy, { stagingToken: "tok-staging" }));
      });

      it("posts the decision and returns a confirmation payload", async () => {
        fetchSpy.mockReturnValue(jsonResponse({}, { status: 201 }));

        const result = await mcpClient.callTool({
          name: "sca_session_mock_decision",
          arguments: { token: "tok-mock", decision: "allow" },
        });

        expect(result.isError).toBeFalsy();
        const content = result.content as { type: string; text: string }[];
        const first = content[0] as { type: string; text: string };
        const parsed = JSON.parse(first.text) as { token: string; decision: string; mocked: boolean };
        expect(parsed).toEqual({ token: "tok-mock", decision: "allow", mocked: true });
      });

      it("calls POST /v2/sca/sessions/mock/<token>/decision with the decision body", async () => {
        fetchSpy.mockReturnValue(jsonResponse({}, { status: 201 }));

        await mcpClient.callTool({
          name: "sca_session_mock_decision",
          arguments: { token: "tok-mock", decision: "deny" },
        });

        const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
        expect(url.pathname).toBe("/v2/sca/sessions/mock/tok-mock/decision");
        expect(init.method).toBe("POST");
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        expect(body).toEqual({ decision: "deny" });
      });

      it("formats Qonto API errors via the shared error wrapper", async () => {
        fetchSpy.mockReturnValue(
          jsonResponse({ errors: [{ code: "expired", detail: "SCA session expired" }] }, { status: 410 }),
        );

        const result = await mcpClient.callTool({
          name: "sca_session_mock_decision",
          arguments: { token: "tok-expired", decision: "allow" },
        });

        expect(result.isError).toBe(true);
        const content = result.content as { type: string; text: string }[];
        const first = content[0] as { type: string; text: string };
        expect(first.text).toContain("Qonto API error (HTTP 410)");
        expect(first.text).toContain("expired");
      });
    });

    describe("outside sandbox mode", () => {
      let mcpClient: Client;

      beforeEach(async () => {
        ({ mcpClient } = await connectInMemory(fetchSpy));
      });

      it("returns an error result without calling the API", async () => {
        const result = await mcpClient.callTool({
          name: "sca_session_mock_decision",
          arguments: { token: "tok-mock", decision: "allow" },
        });

        expect(result.isError).toBe(true);
        const content = result.content as { type: string; text: string }[];
        const first = content[0] as { type: string; text: string };
        expect(first.text).toContain("only available in the Qonto sandbox environment");
        expect(first.text).toContain("QONTOCTL_STAGING_TOKEN");
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });
  });
});
