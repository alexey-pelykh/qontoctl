// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type HttpClient,
  getInsuranceContract,
  createInsuranceContract,
  updateInsuranceContract,
  uploadInsuranceDocument,
  removeInsuranceDocument,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

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
        insurance_type: z.string().describe("Insurance type (e.g. professional_liability, health)"),
        provider_name: z.string().describe("Insurance provider name"),
        contract_number: z.string().optional().describe("Contract number"),
        start_date: z.string().describe("Contract start date (YYYY-MM-DD)"),
        end_date: z.string().optional().describe("Contract end date (YYYY-MM-DD)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const contract = await createInsuranceContract(client, {
          insurance_type: args.insurance_type,
          provider_name: args.provider_name,
          start_date: args.start_date,
          contract_number: args.contract_number,
          end_date: args.end_date,
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
        insurance_type: z.string().optional().describe("Insurance type"),
        provider_name: z.string().optional().describe("Insurance provider name"),
        contract_number: z.string().optional().describe("Contract number"),
        start_date: z.string().optional().describe("Contract start date (YYYY-MM-DD)"),
        end_date: z.string().optional().describe("Contract end date (YYYY-MM-DD)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const contract = await updateInsuranceContract(client, args.id, {
          insurance_type: args.insurance_type,
          provider_name: args.provider_name,
          contract_number: args.contract_number,
          start_date: args.start_date,
          end_date: args.end_date,
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
