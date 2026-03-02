// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { getCardIframeUrl } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

export function registerCardIframeUrlCommand(parent: Command): void {
  const iframeUrl = parent
    .command("iframe-url")
    .description("Get secure iframe URL for card details")
    .argument("<id>", "Card ID");
  addInheritableOptions(iframeUrl);
  iframeUrl.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const url = await getCardIframeUrl(client, id);

    const data = opts.output === "json" || opts.output === "yaml" ? { iframe_url: url } : [{ iframe_url: url }];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
