// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  HttpClient,
  resolveConfig,
  buildApiKeyAuthorization,
  type HttpClientOptions,
} from "@qontoctl/core";

const PRODUCTION_BASE_URL = "https://thirdparty.qonto.com";
const SANDBOX_BASE_URL = "https://thirdparty-sandbox.staging.qonto.co";

export interface ClientOptions {
  readonly profile?: string | undefined;
  readonly sandbox?: boolean | undefined;
}

/**
 * Build an authenticated HttpClient from the user's qontoctl configuration.
 *
 * Resolution order follows @qontoctl/core: profile file → default file → env vars.
 */
export async function buildClient(options?: ClientOptions): Promise<HttpClient> {
  const { config } = await resolveConfig({ profile: options?.profile });
  // resolveConfig() guarantees apiKey is present (throws ConfigError otherwise)
  const apiKey = config.apiKey as NonNullable<typeof config.apiKey>;
  const authorization = buildApiKeyAuthorization(apiKey);

  const clientOptions: HttpClientOptions = {
    baseUrl: options?.sandbox === true ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL,
    authorization,
  };

  return new HttpClient(clientOptions);
}

export type ClientFactory = () => Promise<HttpClient>;
