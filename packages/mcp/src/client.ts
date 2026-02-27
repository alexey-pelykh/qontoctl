// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { HttpClient, resolveConfig, buildApiKeyAuthorization, type HttpClientOptions } from "@qontoctl/core";

export interface ClientOptions {
  readonly profile?: string | undefined;
}

/**
 * Build an authenticated HttpClient from the user's qontoctl configuration.
 *
 * Resolution order follows @qontoctl/core: profile file → default file → env vars.
 * Endpoint is resolved from config (endpoint field, sandbox flag, or default production).
 */
export async function buildClient(options?: ClientOptions): Promise<HttpClient> {
  const { config, endpoint } = await resolveConfig({ profile: options?.profile });
  // resolveConfig() guarantees apiKey is present (throws ConfigError otherwise)
  const apiKey = config.apiKey as NonNullable<typeof config.apiKey>;
  const authorization = buildApiKeyAuthorization(apiKey);

  const clientOptions: HttpClientOptions = {
    baseUrl: endpoint,
    authorization,
  };

  return new HttpClient(clientOptions);
}

export type ClientFactory = () => Promise<HttpClient>;
