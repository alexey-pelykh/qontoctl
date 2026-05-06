// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import {
  parseResponse,
  RequestListResponseSchema,
  approveRequest,
  declineRequest,
  createFlashCardRequest,
  createVirtualCardRequest,
  createMultiTransferRequest,
} from "@qontoctl/core";
import { withClient } from "../errors.js";
import { coreOptionsFromContext, executeWithMcpSca, scaContinuationSchema, scaOptionsFromArgs } from "../sca.js";

const requestTypeEnum = z.enum(["flash_card", "virtual_card", "transfer", "multi_transfer"]);

export function registerRequestTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "request_list",
    {
      description: "List all requests in the organization",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async ({ page, per_page }) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};
        if (page !== undefined) params["page"] = String(page);
        if (per_page !== undefined) params["per_page"] = String(per_page);

        const endpointPath = "/v2/requests";
        const response = await client.get(endpointPath, Object.keys(params).length > 0 ? params : undefined);
        const result = parseResponse(RequestListResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ requests: result.requests, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "request_approve",
    {
      description:
        "Approve a pending request. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        request_type: requestTypeEnum.describe("Type of request to approve"),
        id: z.string().describe("Request UUID"),
        debit_iban: z.string().optional().describe("IBAN of account to debit or link to the card"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            approveRequest(
              client,
              args.request_type,
              args.id,
              args.debit_iban !== undefined ? { debit_iban: args.debit_iban } : undefined,
              coreOptionsFromContext(context),
            ),
          () => ({
            content: [{ type: "text" as const, text: JSON.stringify({ approved: true, id: args.id }, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "request_decline",
    {
      description:
        "Decline a pending request. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        request_type: requestTypeEnum.describe("Type of request to decline"),
        id: z.string().describe("Request UUID"),
        declined_note: z.string().describe("Reason for declining"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            declineRequest(
              client,
              args.request_type,
              args.id,
              { declined_note: args.declined_note },
              coreOptionsFromContext(context),
            ),
          () => ({
            content: [{ type: "text" as const, text: JSON.stringify({ declined: true, id: args.id }, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "request_create_flash_card",
    {
      description:
        "Create a flash card request. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        note: z.string().optional().describe("Description to help the approver"),
        payment_lifespan_limit: z.string().optional().describe("Spending limit (e.g. 250.00)"),
        pre_expires_at: z
          .string()
          .optional()
          .describe("Card expiration datetime (ISO 8601, must be future, max 1 year)"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            createFlashCardRequest(
              client,
              {
                ...(args.note !== undefined ? { note: args.note } : {}),
                ...(args.payment_lifespan_limit !== undefined
                  ? { payment_lifespan_limit: args.payment_lifespan_limit }
                  : {}),
                ...(args.pre_expires_at !== undefined ? { pre_expires_at: args.pre_expires_at } : {}),
              },
              coreOptionsFromContext(context),
            ),
          (request) => ({
            content: [{ type: "text" as const, text: JSON.stringify(request, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "request_create_virtual_card",
    {
      description:
        "Create a virtual card request. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        note: z.string().optional().describe("Description to help the approver (max 125 chars)"),
        payment_monthly_limit: z.string().optional().describe("Monthly spending limit (e.g. 5.00)"),
        card_level: z.enum(["virtual", "virtual_partner"]).optional().describe("Card level").default("virtual"),
        card_design: z.string().optional().describe("Card design identifier"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            createVirtualCardRequest(
              client,
              {
                ...(args.note !== undefined ? { note: args.note } : {}),
                ...(args.payment_monthly_limit !== undefined
                  ? { payment_monthly_limit: args.payment_monthly_limit }
                  : {}),
                card_level: args.card_level,
                ...(args.card_design !== undefined ? { card_design: args.card_design } : {}),
              },
              coreOptionsFromContext(context),
            ),
          (request) => ({
            content: [{ type: "text" as const, text: JSON.stringify(request, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "request_create_multi_transfer",
    {
      description:
        "Create a multi-transfer request (1-400 transfers). SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        note: z.string().describe("Description for the request (max 140 chars)"),
        transfers: z
          .array(
            z.object({
              amount: z.string().describe("Amount (e.g. 2000.50)"),
              currency: z.string().describe("Currency code (EUR)"),
              credit_iban: z.string().describe("Beneficiary IBAN"),
              credit_account_name: z.string().describe("Beneficiary name (max 140 chars)"),
              credit_account_currency: z.string().describe("Beneficiary currency (EUR)"),
              reference: z.string().describe("Transfer reference (max 140 chars)"),
              attachment_ids: z.array(z.string()).optional().describe("Attachment UUIDs"),
            }),
          )
          .min(1)
          .max(400)
          .describe("Array of transfer items"),
        scheduled_date: z.string().optional().describe("Execution date (YYYY-MM-DD)"),
        debit_iban: z.string().optional().describe("Source account IBAN"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            createMultiTransferRequest(
              client,
              {
                note: args.note,
                transfers: args.transfers,
                ...(args.scheduled_date !== undefined ? { scheduled_date: args.scheduled_date } : {}),
                ...(args.debit_iban !== undefined ? { debit_iban: args.debit_iban } : {}),
              },
              coreOptionsFromContext(context),
            ),
          (request) => ({
            content: [{ type: "text" as const, text: JSON.stringify(request, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );
}
