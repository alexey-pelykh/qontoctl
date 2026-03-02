// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Command } from "commander";
import { type Attachment, uploadAttachment, getAttachment } from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../options.js";

function attachmentToTableRow(a: Attachment): Record<string, string | number> {
  return {
    id: a.id,
    file_name: a.file_name,
    file_size: a.file_size,
    file_content_type: a.file_content_type,
    created_at: a.created_at,
  };
}

export function createAttachmentCommand(): Command {
  const attachment = new Command("attachment").description("Manage attachments");

  // --- upload ---
  const upload = attachment
    .command("upload <file>")
    .description("Upload an attachment file (PDF, JPEG, PNG)");
  addInheritableOptions(upload);
  addWriteOptions(upload);
  upload.action(async (file: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions>(cmd);
    const client = await createClient(opts);

    const buffer = await readFile(file);
    const fileName = basename(file);

    const result = await uploadAttachment(
      client,
      new Blob([buffer]),
      fileName,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? result : [attachmentToTableRow(result)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- show ---
  const show = attachment
    .command("show <id>")
    .description("Show attachment details");
  addInheritableOptions(show);
  show.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const result = await getAttachment(client, id);

    const data = opts.output === "json" || opts.output === "yaml" ? result : [attachmentToTableRow(result)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  return attachment;
}
