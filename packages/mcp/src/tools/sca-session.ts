// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { getScaSession, mockScaDecision } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerScaSessionTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "sca_session_show",
    {
      description:
        "Show the status of a Strong Customer Authentication (SCA) session. " +
        "Use this to poll an SCA session token returned by a previous tool call that triggered an SCA challenge. " +
        "Returns one of: `waiting` (the user has not yet responded), `allow` (approved — retry the original request), " +
        "or `deny` (rejected). Tokens expire after 15 minutes.",
      inputSchema: {
        token: z.string().describe("SCA session token from a prior SCA-required response"),
      },
    },
    async ({ token }) =>
      withClient(getClient, async (client) => {
        const session = await getScaSession(client, token);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(session, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "sca_session_mock_decision",
    {
      description:
        "Simulate a user SCA decision in the Qonto sandbox environment (testing only). " +
        "Use after triggering an SCA-required operation in sandbox to bypass the mobile-app approval flow. " +
        "Returns an error when the server is not configured for sandbox mode " +
        "(no `oauth.staging-token` / `QONTOCTL_STAGING_TOKEN`).",
      inputSchema: {
        token: z.string().describe("SCA session token to resolve"),
        decision: z.enum(["allow", "deny"]).describe("Simulated user decision"),
      },
    },
    async ({ token, decision }) =>
      withClient(getClient, async (client) => {
        if (!client.isSandbox) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Mocking SCA decisions is only available in the Qonto sandbox environment. " +
                  "Configure `oauth.staging-token` in your config file or set the `QONTOCTL_STAGING_TOKEN` " +
                  "environment variable to enable sandbox mode.",
              },
            ],
            isError: true,
          };
        }

        await mockScaDecision(client, token, decision);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ token, decision, mocked: true }, null, 2),
            },
          ],
        };
      }),
  );
}
