// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type HttpClient,
  type InsuranceContractOrigin,
  type InsuranceContractPaymentFrequency,
  type InsuranceContractStatus,
  getInsuranceContract,
  createInsuranceContract,
  updateInsuranceContract,
  uploadInsuranceDocument,
  removeInsuranceDocument,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

const ORIGIN_VALUES = ["insurance_hub", "qonto_other", "stello"] as const;
const STATUS_VALUES = [
  "active",
  "pending_payment",
  "pending_others",
  "action_required",
  "expired",
  "archived",
] as const;
const PAYMENT_FREQUENCY_VALUES = ["month", "quarter", "semester", "annual"] as const;

export function registerInsuranceTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "insurance_show",
    {
      description: "Show insurance contract details",
      inputSchema: {
        id: z.string().describe("Insurance contract ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const contract = await getInsuranceContract(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(contract, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "insurance_create",
    {
      description: "Create a new insurance contract",
      inputSchema: {
        name: z.string().describe("Contract display name (e.g. 'ProLiability Plan 2026')"),
        contract_id: z.string().describe("Partner-generated contract identifier"),
        origin: z.enum(ORIGIN_VALUES).describe("Contract origin"),
        provider_slug: z.string().describe("Insurance provider identifier (e.g. 'axa')"),
        type: z.string().describe("Insurance category (e.g. 'business_liability', 'health')"),
        status: z.enum(STATUS_VALUES).describe("Contract status"),
        payment_frequency: z.enum(PAYMENT_FREQUENCY_VALUES).describe("Payment frequency"),
        price_value: z.string().describe("Price amount as a decimal string (e.g. '99.99')"),
        price_currency: z.string().describe("Price currency code (ISO 4217, e.g. 'EUR')"),
        start_date: z.string().optional().describe("Coverage start date (YYYY-MM-DD)"),
        expiration_date: z.string().optional().describe("Contract expiration date (YYYY-MM-DD)"),
        renewal_date: z.string().optional().describe("Policy renewal date (YYYY-MM-DD)"),
        service_url: z.string().optional().describe("Customer portal access URL"),
        troubleshooting_url: z.string().optional().describe("Support / troubleshooting URL"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const contract = await createInsuranceContract(client, {
          name: args.name,
          contract_id: args.contract_id,
          origin: args.origin,
          provider_slug: args.provider_slug,
          type: args.type,
          status: args.status,
          payment_frequency: args.payment_frequency,
          price: { value: args.price_value, currency: args.price_currency },
          ...(args.start_date !== undefined ? { start_date: args.start_date } : {}),
          ...(args.expiration_date !== undefined ? { expiration_date: args.expiration_date } : {}),
          ...(args.renewal_date !== undefined ? { renewal_date: args.renewal_date } : {}),
          ...(args.service_url !== undefined ? { service_url: args.service_url } : {}),
          ...(args.troubleshooting_url !== undefined ? { troubleshooting_url: args.troubleshooting_url } : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(contract, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "insurance_update",
    {
      description: "Update an insurance contract",
      inputSchema: {
        id: z.string().describe("Insurance contract ID (UUID)"),
        name: z.string().optional().describe("Contract display name"),
        contract_id: z.string().optional().describe("Partner-generated contract identifier"),
        origin: z.enum(ORIGIN_VALUES).optional().describe("Contract origin"),
        provider_slug: z.string().optional().describe("Insurance provider identifier"),
        type: z.string().optional().describe("Insurance category"),
        status: z.enum(STATUS_VALUES).optional().describe("Contract status"),
        payment_frequency: z.enum(PAYMENT_FREQUENCY_VALUES).optional().describe("Payment frequency"),
        price_value: z
          .string()
          .optional()
          .describe("Price amount as a decimal string (must be paired with price_currency)"),
        price_currency: z.string().optional().describe("Price currency code (must be paired with price_value)"),
        start_date: z.string().optional().describe("Coverage start date (YYYY-MM-DD)"),
        expiration_date: z.string().optional().describe("Contract expiration date (YYYY-MM-DD)"),
        renewal_date: z.string().optional().describe("Policy renewal date (YYYY-MM-DD)"),
        service_url: z.string().optional().describe("Customer portal access URL"),
        troubleshooting_url: z.string().optional().describe("Support / troubleshooting URL"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        if ((args.price_value === undefined) !== (args.price_currency === undefined)) {
          throw new Error("price_value and price_currency must be provided together.");
        }

        const fields: {
          name?: string;
          contract_id?: string;
          origin?: InsuranceContractOrigin;
          provider_slug?: string;
          type?: string;
          status?: InsuranceContractStatus;
          payment_frequency?: InsuranceContractPaymentFrequency;
          price?: { value: string; currency: string };
          start_date?: string;
          expiration_date?: string;
          renewal_date?: string;
          service_url?: string;
          troubleshooting_url?: string;
        } = {};

        if (args.name !== undefined) fields.name = args.name;
        if (args.contract_id !== undefined) fields.contract_id = args.contract_id;
        if (args.origin !== undefined) fields.origin = args.origin;
        if (args.provider_slug !== undefined) fields.provider_slug = args.provider_slug;
        if (args.type !== undefined) fields.type = args.type;
        if (args.status !== undefined) fields.status = args.status;
        if (args.payment_frequency !== undefined) fields.payment_frequency = args.payment_frequency;
        if (args.price_value !== undefined && args.price_currency !== undefined) {
          fields.price = { value: args.price_value, currency: args.price_currency };
        }
        if (args.start_date !== undefined) fields.start_date = args.start_date;
        if (args.expiration_date !== undefined) fields.expiration_date = args.expiration_date;
        if (args.renewal_date !== undefined) fields.renewal_date = args.renewal_date;
        if (args.service_url !== undefined) fields.service_url = args.service_url;
        if (args.troubleshooting_url !== undefined) fields.troubleshooting_url = args.troubleshooting_url;

        const contract = await updateInsuranceContract(client, args.id, fields);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(contract, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "insurance_upload_document",
    {
      description: "Upload a document to an insurance contract from the filesystem",
      inputSchema: {
        contract_id: z.string().describe("Insurance contract ID (UUID)"),
        file_path: z.string().describe("Absolute path to the file to upload"),
      },
    },
    async ({ contract_id, file_path }) =>
      withClient(getClient, async (client) => {
        const buffer = await readFile(file_path);
        const fileName = basename(file_path);
        const doc = await uploadInsuranceDocument(client, contract_id, new Blob([buffer]), fileName);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(doc, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "insurance_remove_document",
    {
      description: "Remove a document from an insurance contract",
      inputSchema: {
        contract_id: z.string().describe("Insurance contract ID (UUID)"),
        document_id: z.string().describe("Document ID (UUID)"),
      },
    },
    async ({ contract_id, document_id }) =>
      withClient(getClient, async (client) => {
        await removeInsuranceDocument(client, contract_id, document_id);

        return {
          content: [
            {
              type: "text" as const,
              text: `Document ${document_id} removed from insurance contract ${contract_id}.`,
            },
          ],
        };
      }),
  );
}
