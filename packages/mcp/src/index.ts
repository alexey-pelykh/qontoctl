#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { HttpClient, buildApiKeyAuthorization, resolveConfig } from "@qontoctl/core";
import { runStdioServer } from "./stdio.js";

await runStdioServer({
  getClient: async () => {
    const { config, endpoint } = await resolveConfig();
    if (config.apiKey === undefined) {
      throw new Error("No API key credentials found in configuration");
    }
    const authorization = buildApiKeyAuthorization(config.apiKey);
    return new HttpClient({
      baseUrl: endpoint,
      authorization,
    });
  },
});
