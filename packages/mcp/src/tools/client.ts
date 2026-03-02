// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Client, HttpClient, PaginationMeta } from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedClientsResponse {
  readonly clients: readonly Client[];
  readonly meta: PaginationMeta;
}

interface SingleClientResponse {
  readonly client: Client;
}

export function registerClientTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "client_list",
    {
      description: "List clients with optional pagination",
      inputSchema: {
        current_page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};
        if (args.current_page !== undefined) params["current_page"] = String(args.current_page);
        if (args.per_page !== undefined) params["per_page"] = String(args.per_page);

        const response = await client.get<PaginatedClientsResponse>(
          "/v2/clients",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ clients: response.clients, meta: response.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_show",
    {
      description: "Show details of a specific client",
      inputSchema: {
        id: z.string().describe("Client ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const response = await client.get<SingleClientResponse>(`/v2/clients/${encodeURIComponent(id)}`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response.client, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_create",
    {
      description: "Create a new client",
      inputSchema: {
        kind: z.enum(["company", "individual", "freelancer"]).describe("Client kind"),
        name: z.string().optional().describe("Client name (required for company)"),
        first_name: z.string().optional().describe("First name (required for individual/freelancer)"),
        last_name: z.string().optional().describe("Last name (required for individual/freelancer)"),
        email: z.string().optional().describe("Email address"),
        address: z.string().optional().describe("Street address"),
        city: z.string().optional().describe("City"),
        zip_code: z.string().optional().describe("Postal/zip code"),
        country_code: z.string().optional().describe("ISO 3166-1 alpha-2 country code"),
        vat_number: z.string().optional().describe("VAT number"),
        tax_identification_number: z.string().optional().describe("Tax identification number"),
        locale: z.string().optional().describe("Locale (e.g. en, fr)"),
        currency: z.string().optional().describe("Currency code (ISO 4217)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const body: Record<string, string> = {
          kind: args.kind,
        };
        if (args.name !== undefined) body["name"] = args.name;
        if (args.first_name !== undefined) body["first_name"] = args.first_name;
        if (args.last_name !== undefined) body["last_name"] = args.last_name;
        if (args.email !== undefined) body["email"] = args.email;
        if (args.address !== undefined) body["address"] = args.address;
        if (args.city !== undefined) body["city"] = args.city;
        if (args.zip_code !== undefined) body["zip_code"] = args.zip_code;
        if (args.country_code !== undefined) body["country_code"] = args.country_code;
        if (args.vat_number !== undefined) body["vat_number"] = args.vat_number;
        if (args.tax_identification_number !== undefined)
          body["tax_identification_number"] = args.tax_identification_number;
        if (args.locale !== undefined) body["locale"] = args.locale;
        if (args.currency !== undefined) body["currency"] = args.currency;

        const response = await client.post<SingleClientResponse>("/v2/clients", body);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response.client, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_update",
    {
      description: "Update an existing client",
      inputSchema: {
        id: z.string().describe("Client ID (UUID)"),
        name: z.string().optional().describe("Client name"),
        first_name: z.string().optional().describe("First name"),
        last_name: z.string().optional().describe("Last name"),
        email: z.string().optional().describe("Email address"),
        address: z.string().optional().describe("Street address"),
        city: z.string().optional().describe("City"),
        zip_code: z.string().optional().describe("Postal/zip code"),
        country_code: z.string().optional().describe("ISO 3166-1 alpha-2 country code"),
        vat_number: z.string().optional().describe("VAT number"),
        tax_identification_number: z.string().optional().describe("Tax identification number"),
        locale: z.string().optional().describe("Locale (e.g. en, fr)"),
        currency: z.string().optional().describe("Currency code (ISO 4217)"),
      },
    },
    async ({ id, ...fields }) =>
      withClient(getClient, async (client) => {
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            body[key] = value;
          }
        }

        const response = await client.patch<SingleClientResponse>(`/v2/clients/${encodeURIComponent(id)}`, body);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response.client, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_delete",
    {
      description: "Delete a client",
      inputSchema: {
        id: z.string().describe("Client ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        await client.delete(`/v2/clients/${encodeURIComponent(id)}`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ deleted: true, id }, null, 2),
            },
          ],
        };
      }),
  );
}
