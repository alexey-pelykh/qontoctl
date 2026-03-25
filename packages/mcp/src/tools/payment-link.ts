// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import {
  parseResponse,
  PaymentLinkResponseSchema,
  PaymentLinkListResponseSchema,
  PaymentLinkPaymentListResponseSchema,
  PaymentLinkPaymentMethodListResponseSchema,
  PaymentLinkConnectionSchema,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerPaymentLinkTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "payment_link_list",
    {
      description: "List payment links",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
        status: z.enum(["open", "expired", "canceled", "paid", "processing"]).optional().describe("Filter by status"),
        sort_by: z
          .enum(["amount:asc", "amount:desc", "expiration_date:asc", "expiration_date:desc"])
          .optional()
          .describe("Sort order"),
      },
    },
    async ({ page, per_page, status, sort_by }) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};
        if (page !== undefined) params["page"] = String(page);
        if (per_page !== undefined) params["per_page"] = String(per_page);
        if (status !== undefined) params["status[]"] = status;
        if (sort_by !== undefined) params["sort_by"] = sort_by;

        const endpointPath = "/v2/payment_links";
        const response = await client.get(endpointPath, Object.keys(params).length > 0 ? params : undefined);
        const result = parseResponse(PaymentLinkListResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ payment_links: result.payment_links, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "payment_link_show",
    {
      description: "Show details of a specific payment link",
      inputSchema: {
        id: z.string().describe("Payment link ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const endpointPath = `/v2/payment_links/${encodeURIComponent(id)}`;
        const response = await client.get(endpointPath);
        const result = parseResponse(PaymentLinkResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.payment_link, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "payment_link_create",
    {
      description: "Create a new payment link (basket or invoice type)",
      inputSchema: {
        payment_link: z
          .record(z.string(), z.unknown())
          .describe(
            "Payment link data. For basket: {potential_payment_methods, items, reusable?}. For invoice: {invoice_id, invoice_number, debitor_name, amount, potential_payment_methods}",
          ),
      },
    },
    async ({ payment_link }) =>
      withClient(getClient, async (client) => {
        const endpointPath = "/v2/payment_links";
        const response = await client.post(endpointPath, { payment_link });
        const result = parseResponse(PaymentLinkResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.payment_link, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "payment_link_deactivate",
    {
      description: "Deactivate a payment link",
      inputSchema: {
        id: z.string().describe("Payment link ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const endpointPath = `/v2/payment_links/${encodeURIComponent(id)}/deactivate`;
        const response = await client.request("PATCH", endpointPath);
        const result = parseResponse(PaymentLinkResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.payment_link, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "payment_link_payments",
    {
      description: "List payments for a specific payment link",
      inputSchema: {
        id: z.string().describe("Payment link ID (UUID)"),
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async ({ id, page, per_page }) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};
        if (page !== undefined) params["page"] = String(page);
        if (per_page !== undefined) params["per_page"] = String(per_page);

        const endpointPath = `/v2/payment_links/${encodeURIComponent(id)}/payments`;
        const response = await client.get(endpointPath, Object.keys(params).length > 0 ? params : undefined);
        const result = parseResponse(PaymentLinkPaymentListResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ payments: result.payments, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "payment_link_methods",
    {
      description: "List available payment methods for payment links",
      inputSchema: {},
    },
    async () =>
      withClient(getClient, async (client) => {
        const endpointPath = "/v2/payment_links/payment_methods";
        const response = await client.get(endpointPath);
        const result = parseResponse(PaymentLinkPaymentMethodListResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.payment_link_payment_methods, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "payment_link_connect",
    {
      description: "Establish payment link connection with provider",
      inputSchema: {
        partner_callback_url: z.string().describe("Redirect URL after connection completes"),
        user_bank_account_id: z.string().describe("Bank account ID to link"),
        user_phone_number: z.string().describe("Phone number in E.164 format"),
        user_website_url: z.string().describe("Website URL (max 255 chars)"),
        business_description: z.string().nullable().optional().describe("Business description (min 80 chars)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const body: Record<string, unknown> = {
          partner_callback_url: args.partner_callback_url,
          user_bank_account_id: args.user_bank_account_id,
          user_phone_number: args.user_phone_number,
          user_website_url: args.user_website_url,
        };
        if (args.business_description !== undefined) body["business_description"] = args.business_description;

        const endpointPath = "/v2/payment_links/connections";
        const response = await client.post(endpointPath, body);
        const result = parseResponse(PaymentLinkConnectionSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "payment_link_connection_status",
    {
      description: "Get payment link connection status",
      inputSchema: {},
    },
    async () =>
      withClient(getClient, async (client) => {
        const endpointPath = "/v2/payment_links/connections";
        const response = await client.get(endpointPath);
        const result = parseResponse(PaymentLinkConnectionSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }),
  );
}
