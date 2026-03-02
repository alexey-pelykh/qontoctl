// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type HttpClient,
  uploadAttachment,
  getAttachment,
  listTransactionAttachments,
  addTransactionAttachment,
  removeAllTransactionAttachments,
  removeTransactionAttachment,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerAttachmentTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "attachment_upload",
    {
      description: "Upload an attachment file (PDF, JPEG, PNG) from the filesystem",
      inputSchema: {
        file_path: z.string().describe("Absolute path to the file to upload"),
      },
    },
    async ({ file_path }) =>
      withClient(getClient, async (client) => {
        const buffer = await readFile(file_path);
        const fileName = basename(file_path);
        const attachment = await uploadAttachment(client, new Blob([buffer]), fileName);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(attachment, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "attachment_show",
    {
      description: "Show details of a specific attachment",
      inputSchema: {
        id: z.string().describe("Attachment ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const attachment = await getAttachment(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(attachment, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "transaction_attachment_list",
    {
      description: "List attachments for a transaction",
      inputSchema: {
        transaction_id: z.string().describe("Transaction UUID"),
      },
    },
    async ({ transaction_id }) =>
      withClient(getClient, async (client) => {
        const attachments = await listTransactionAttachments(client, transaction_id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ attachments }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "transaction_attachment_add",
    {
      description: "Attach a file to a transaction from the filesystem",
      inputSchema: {
        transaction_id: z.string().describe("Transaction UUID"),
        file_path: z.string().describe("Absolute path to the file to attach"),
      },
    },
    async ({ transaction_id, file_path }) =>
      withClient(getClient, async (client) => {
        const buffer = await readFile(file_path);
        const fileName = basename(file_path);
        const attachment = await addTransactionAttachment(client, transaction_id, new Blob([buffer]), fileName);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(attachment, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "transaction_attachment_remove",
    {
      description:
        "Remove attachment(s) from a transaction. If attachment_id is provided, removes that specific attachment. Otherwise removes all attachments.",
      inputSchema: {
        transaction_id: z.string().describe("Transaction UUID"),
        attachment_id: z.string().optional().describe("Specific attachment UUID to remove (omit to remove all)"),
      },
    },
    async ({ transaction_id, attachment_id }) =>
      withClient(getClient, async (client) => {
        if (attachment_id !== undefined) {
          await removeTransactionAttachment(client, transaction_id, attachment_id);
          return {
            content: [
              {
                type: "text" as const,
                text: `Attachment ${attachment_id} removed from transaction ${transaction_id}.`,
              },
            ],
          };
        } else {
          await removeAllTransactionAttachments(client, transaction_id);
          return {
            content: [
              {
                type: "text" as const,
                text: `All attachments removed from transaction ${transaction_id}.`,
              },
            ],
          };
        }
      }),
  );
}
