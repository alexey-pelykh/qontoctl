// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { Option } from "commander";
import { getTransferProof } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

interface TransferProofOptions extends GlobalOptions {
  readonly outputFile?: string | undefined;
}

export function registerTransferProofCommand(parent: Command): void {
  const proof = parent
    .command("proof <id>")
    .description("Download SEPA transfer proof PDF")
    .addOption(new Option("--output-file <path>", "file path to save the PDF"));
  addInheritableOptions(proof);
  proof.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<TransferProofOptions>(cmd);
    const httpClient = await createClient(opts);

    const buffer = await getTransferProof(httpClient, id);
    const outputFile = opts.outputFile ?? `transfer-proof-${id}.pdf`;

    await writeFile(outputFile, buffer);
    process.stdout.write(`Downloaded: ${outputFile}\n`);
  });
}
