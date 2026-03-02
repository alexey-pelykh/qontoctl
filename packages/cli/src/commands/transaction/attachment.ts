// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import {
  type Attachment,
  listTransactionAttachments,
  addTransactionAttachment,
  removeAllTransactionAttachments,
  removeTransactionAttachment,
} from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";

function attachmentToTableRow(a: Attachment): Record<string, string | number> {
  return {
    id: a.id,
    file_name: a.file_name,
    file_size: a.file_size,
    file_content_type: a.file_content_type,
    created_at: a.created_at,
  };
}

export function registerTransactionAttachmentCommands(parent: Command): void {
  const attachment = parent.command("attachment").description("Manage transaction attachments");

  // --- list ---
  const list = attachment.command("list <transaction-id>").description("List attachments for a transaction");
  addInheritableOptions(list);
  list.action(async (transactionId: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const attachments = await listTransactionAttachments(client, transactionId);

    const data = opts.output === "json" || opts.output === "yaml" ? attachments : attachments.map(attachmentToTableRow);

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- add ---
  const add = attachment.command("add <transaction-id> <file>").description("Attach a file to a transaction");
  addInheritableOptions(add);
  addWriteOptions(add);
  add.action(async (transactionId: string, file: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions>(cmd);
    const client = await createClient(opts);

    const buffer = await readFile(file);
    const fileName = basename(file);

    const result = await addTransactionAttachment(
      client,
      transactionId,
      new Blob([buffer]),
      fileName,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? result : [attachmentToTableRow(result)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- remove ---
  const remove = attachment
    .command("remove <transaction-id> [attachment-id]")
    .description("Remove attachment(s) from a transaction");
  addInheritableOptions(remove);
  addWriteOptions(remove);
  remove.action(async (transactionId: string, attachmentId: string | undefined, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions>(cmd);
    const client = await createClient(opts);

    const idempotencyOpts = opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined;

    if (attachmentId !== undefined) {
      await removeTransactionAttachment(client, transactionId, attachmentId, idempotencyOpts);
      process.stderr.write(`Attachment ${attachmentId} removed from transaction ${transactionId}.\n`);
    } else {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      const answer = await rl.question(`Remove ALL attachments from transaction ${transactionId}? (yes/no): `);
      rl.close();

      if (answer.toLowerCase() !== "yes") {
        process.stderr.write("Aborted.\n");
        return;
      }

      await removeAllTransactionAttachments(client, transactionId, idempotencyOpts);
      process.stderr.write(`All attachments removed from transaction ${transactionId}.\n`);
    }
  });
}
