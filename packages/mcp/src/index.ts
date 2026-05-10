#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  HttpClient,
  buildApiKeyAuthorization,
  createOAuthAuthorization,
  resolveConfig,
  resolveScaMethod,
  resolveAuthPreference,
  selectAuthChain,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_SANDBOX_URL,
  type Authorization,
  type AuthSlot,
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

    // No CLI flag in MCP — auth preference comes from env > config > default.
    // resolveAuthPreference handles the env-overlaid config field.
    const preference = resolveAuthPreference(config);
    const selection = selectAuthChain(preference, {
      apiKey: config.apiKey !== undefined,
      oauth: config.oauth !== undefined,
    });

    if (selection.noCredentials) {
      throw new Error("No credentials found in configuration");
    }

    if (selection.warning !== undefined) {
      process.stderr.write(`Warning: ${selection.warning}\n`);
    }

    const oauthFactory = (): Authorization => {
      if (config.oauth === undefined) {
        throw new Error("Internal error: OAuth slot selected but no OAuth credentials available");
      }
      return createOAuthAuthorization({
        oauth: config.oauth,
        tokenUrl: config.oauth.stagingToken !== undefined ? OAUTH_TOKEN_SANDBOX_URL : OAUTH_TOKEN_URL,
        ...(path !== undefined ? { path } : {}),
        readOnly: oauthAccessTokenFromEnv,
      });
    };

    const apiKeyFactory = (): Authorization => {
      if (config.apiKey === undefined) {
        throw new Error("Internal error: api-key slot selected but no api-key credentials available");
      }
      return buildApiKeyAuthorization(config.apiKey);
    };

    const buildSlot = (slot: AuthSlot): Authorization | undefined => {
      if (slot === "oauth") return oauthFactory();
      if (slot === "api-key") return apiKeyFactory();
      return undefined;
    };

    const authorization = buildSlot(selection.primary);
    if (authorization === undefined) {
      throw new Error("Internal error: auth chain has no primary credential");
    }
    const fallbackAuthorization = buildSlot(selection.fallback);

    // SCA method is resolved from env/config only — never as a tool input —
    // so an LLM client cannot pick the SCA method, only an operator can.
    const scaMethod = resolveScaMethod(config);

    return new HttpClient({
      baseUrl: endpoint,
      authorization,
      fallbackAuthorization,
      onFallback: (method, p) => {
        const label = selection.fallback === "oauth" ? "OAuth" : "api-key";
        process.stderr.write(`Warning: primary authentication failed, falling back to ${label} for ${method} ${p}\n`);
      },
      stagingToken: config.oauth?.stagingToken,
      ...(scaMethod !== undefined ? { scaMethod } : {}),
    });
  },
});
