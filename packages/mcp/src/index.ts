#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  HttpClient,
  buildApiKeyAuthorization,
  createOAuthAuthorization,
  resolveConfig,
  resolveScaMethod,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_SANDBOX_URL,
  type Authorization,
} from "@qontoctl/core";
import { runStdioServer } from "./stdio.js";

await runStdioServer({
  getClient: async () => {
    const { config, endpoint } = await resolveConfig();

    let authorization: Authorization;
    let fallbackAuthorization: Authorization | undefined;

    if (config.oauth !== undefined && config.oauth.clientId !== "") {
      authorization = createOAuthAuthorization({
        oauth: config.oauth,
        tokenUrl: config.oauth.stagingToken !== undefined ? OAUTH_TOKEN_SANDBOX_URL : OAUTH_TOKEN_URL,
      });

      // When OAuth is primary, fall back to API key if available
      if (config.apiKey !== undefined) {
        fallbackAuthorization = buildApiKeyAuthorization(config.apiKey);
      }
    } else if (config.apiKey !== undefined) {
      authorization = buildApiKeyAuthorization(config.apiKey);
    } else {
      throw new Error("No credentials found in configuration");
    }

    // SCA method is resolved from env/config only — never as a tool input —
    // so an LLM client cannot pick the SCA method, only an operator can.
    const scaMethod = resolveScaMethod(config);

    return new HttpClient({
      baseUrl: endpoint,
      authorization,
      fallbackAuthorization,
      onFallback: (method, path) => {
        process.stderr.write(`Warning: OAuth authentication failed, falling back to API key for ${method} ${path}\n`);
      },
      stagingToken: config.oauth?.stagingToken,
      ...(scaMethod !== undefined ? { scaMethod } : {}),
    });
  },
});
