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
import { buildMcpResolveOptions } from "./config.js";
import { runStdioServer } from "./stdio.js";

// Capture QONTOCTL_CONFIG_FILE at MCP startup. The env var is the only way
// to point the MCP server at a non-default config path (no CLI flags exist),
// so reading it explicitly here mirrors the CLI's `--config` codepath
// (`resolveConfig({ path })`) and freezes the resolution destination — later
// `process.env` mutations cannot redirect subsequent loads.
const mcpResolveOptions = buildMcpResolveOptions();

await runStdioServer({
  getClient: async () => {
    const { config, endpoint, path, oauthAccessTokenFromEnv } = await resolveConfig(mcpResolveOptions);

    let authorization: Authorization;
    let fallbackAuthorization: Authorization | undefined;

    if (config.oauth !== undefined && config.oauth.clientId !== "") {
      authorization = createOAuthAuthorization({
        oauth: config.oauth,
        tokenUrl: config.oauth.stagingToken !== undefined ? OAUTH_TOKEN_SANDBOX_URL : OAUTH_TOKEN_URL,
        ...(path !== undefined ? { path } : {}),
        readOnly: oauthAccessTokenFromEnv,
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
