// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthPreference, QontoctlConfig } from "../../config/types.js";
import { HttpClient } from "../../http-client.js";
import { jsonResponse } from "../../testing/json-response.js";
import type { DiagnoseContext } from "../types.js";
import { apiKeyHealthCheck } from "./api-key-health.js";
import { authCredentialsCheck } from "./auth-credentials.js";
import { bankAccountsCountCheck } from "./bank-accounts-count.js";
import { configResolutionCheck } from "./config-resolution.js";
import { einvoicingSettingsCheck } from "./einvoicing-settings.js";
import { hostRoutingCheck } from "./host-routing.js";
import { oauthHealthCheck } from "./oauth-health.js";
import { ORGANIZATION_CACHE_KEY, orgMetadataCheck } from "./org-metadata.js";
import { scopesCheck } from "./scopes.js";

const PRODUCTION = "https://thirdparty.qonto.com";
const SANDBOX = "https://thirdparty-sandbox.staging.qonto.co";

function buildContext(overrides: Partial<DiagnoseContext> = {}): DiagnoseContext {
  const config: QontoctlConfig = {
    apiKey: { organizationSlug: "slug", secretKey: "secret" },
  };
  const authMode: AuthPreference = "api-key";
  return {
    config,
    profile: "default",
    configPath: "/tmp/test.yaml",
    authMode,
    endpoint: PRODUCTION,
    stagingTokenPresent: false,
    qontoctlVersion: "0.0.0-test",
    frozenTimestamp: true,
    apiKeyClient: new HttpClient({ baseUrl: PRODUCTION, authorization: "slug:secret" }),
    oauthClient: undefined,
    cache: new Map(),
    ...overrides,
  };
}

describe("config-resolution check", () => {
  it("reports the loaded config file path", async () => {
    const result = await configResolutionCheck.run(buildContext({ configPath: "/etc/qontoctl.yaml" }));
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("/etc/qontoctl.yaml");
    expect(result.evidence).toEqual({
      config_path: "/etc/qontoctl.yaml",
      profile: "default",
      source: "file",
    });
  });

  it("reports env-only loading when no config path is present", async () => {
    const result = await configResolutionCheck.run(buildContext({ configPath: undefined }));
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("environment variables");
    expect(result.evidence?.["source"]).toBe("env");
  });
});

describe("auth-credentials check", () => {
  it("reports both credentials when api-key + oauth are configured", async () => {
    const ctx = buildContext({
      config: {
        apiKey: { organizationSlug: "s", secretKey: "k" },
        oauth: { clientId: "id", clientSecret: "sec" },
      },
    });
    const result = await authCredentialsCheck.run(ctx);
    expect(result.status).toBe("ok");
    expect(result.detail).toBe("api-key + oauth configured");
  });

  it("returns fail (cascadeOnFail trigger) when no credentials are configured", async () => {
    const ctx = buildContext({ config: {} });
    const result = await authCredentialsCheck.run(ctx);
    expect(result.status).toBe("fail");
    expect(result.suggestedAction).not.toBeNull();
  });
});

describe("api-key-health check", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports ok on a 200 from /v2/organization", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        organization: {
          slug: "test-org",
          legal_name: "Test Co",
          bank_accounts: [],
        },
      }),
    );
    const result = await apiKeyHealthCheck.run(buildContext());
    expect(result.status).toBe("ok");
    expect(result.detail).toBe("200 OK");
    expect(result.evidence?.["status_code"]).toBe(200);
  });

  it("reports fail on a 401 with auth-rejection guidance", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ errors: [{ code: "unauthorized", detail: "Bad key" }] }, { status: 401 }));
    const result = await apiKeyHealthCheck.run(buildContext());
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("HTTP 401");
    expect(result.suggestedAction).toContain("API key was rejected");
  });

  it("skips when api-key is not configured", async () => {
    const result = await apiKeyHealthCheck.run(buildContext({ apiKeyClient: undefined }));
    expect(result.status).toBe("skip");
  });
});

describe("oauth-health check", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports fail when no access token is present", async () => {
    const ctx = buildContext({
      config: { oauth: { clientId: "id", clientSecret: "sec" } },
      oauthClient: new HttpClient({ baseUrl: PRODUCTION, authorization: () => Promise.resolve("Bearer x") }),
    });
    const result = await oauthHealthCheck.run(ctx);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("no access token");
  });

  it("reports warn with 'refreshed' when access token was expired prior to call", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        organization: {
          slug: "x",
          legal_name: "x",
          bank_accounts: [],
        },
      }),
    );
    const ctx = buildContext({
      config: {
        oauth: {
          clientId: "id",
          clientSecret: "sec",
          accessToken: "fake",
          accessTokenExpiresAt: "2020-01-01T00:00:00Z",
        },
      },
      oauthClient: new HttpClient({ baseUrl: PRODUCTION, authorization: () => Promise.resolve("Bearer x") }),
    });
    const result = await oauthHealthCheck.run(ctx);
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("refreshed");
    expect(result.evidence?.["refreshed"]).toBe(true);
  });

  it("reports fail with login suggestion when call returns 401", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ errors: [{ code: "unauth", detail: "Bad" }] }, { status: 401 }));
    const ctx = buildContext({
      config: {
        oauth: { clientId: "id", clientSecret: "sec", accessToken: "fake" },
      },
      oauthClient: new HttpClient({ baseUrl: PRODUCTION, authorization: () => Promise.resolve("Bearer x") }),
    });
    const result = await oauthHealthCheck.run(ctx);
    expect(result.status).toBe("fail");
    expect(result.suggestedAction).toContain("auth login");
  });
});

describe("scopes check", () => {
  it("reports ok with the configured scope count", async () => {
    const ctx = buildContext({
      config: { oauth: { clientId: "id", clientSecret: "sec", scopes: ["organization.read", "card.read"] } },
    });
    const result = await scopesCheck.run(ctx);
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("2 scopes");
    expect(result.evidence?.["scopes_count"]).toBe(2);
  });

  it("reports warn when oauth is configured but no scopes are stored", async () => {
    const ctx = buildContext({ config: { oauth: { clientId: "id", clientSecret: "sec" } } });
    const result = await scopesCheck.run(ctx);
    expect(result.status).toBe("warn");
    expect(result.suggestedAction).toContain("auth setup");
  });
});

describe("org-metadata check", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports slug + legal_name and caches the org for downstream checks", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        organization: {
          slug: "acme-1",
          legal_name: "ACME Inc",
          bank_accounts: [
            {
              id: "a",
              name: "Main",
              status: "active",
              main: true,
              iban: "FR7612345987650123456789012",
              bic: "QNTOFRP1XXX",
              currency: "EUR",
              balance: 1000,
              balance_cents: 100000,
              authorized_balance: 1000,
              authorized_balance_cents: 100000,
            },
            {
              id: "b",
              name: "Reserve",
              status: "active",
              main: false,
              iban: "FR7612345987650123456789013",
              bic: "QNTOFRP1XXX",
              currency: "EUR",
              balance: 500,
              balance_cents: 50000,
              authorized_balance: 500,
              authorized_balance_cents: 50000,
            },
          ],
        },
      }),
    );
    const ctx = buildContext();
    const result = await orgMetadataCheck.run(ctx);
    expect(result.status).toBe("ok");
    expect(result.detail).toBe("acme-1 (ACME Inc)");
    expect(result.evidence?.["bank_accounts_count"]).toBe(2);
    expect(ctx.cache.get(ORGANIZATION_CACHE_KEY)).toBeDefined();
  });

  it("returns fail on QontoApiError 5xx with upstream-issue suggestion", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ errors: [{ code: "x", detail: "y" }] }, { status: 503 }));
    const result = await orgMetadataCheck.run(buildContext());
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("HTTP 503");
    expect(result.suggestedAction).toContain("upstream issue");
  });
});

describe("bank-accounts-count check", () => {
  it("reads cached organization without a network call", async () => {
    const ctx = buildContext();
    ctx.cache.set(ORGANIZATION_CACHE_KEY, {
      slug: "acme",
      legal_name: "ACME",
      bank_accounts: [{ id: "a" }, { id: "b" }, { id: "c" }],
    });
    const result = await bankAccountsCountCheck.run(ctx);
    expect(result.status).toBe("ok");
    expect(result.detail).toBe("3 bank accounts");
    expect(result.evidence?.["source"]).toBe("cached-organization");
  });

  it("falls back to listBankAccounts when cache holds a wrong-shape value", async () => {
    const ctx = buildContext();
    // Defensive: the runtime guard in readCachedOrganization rejects
    // non-Organization values, so a buggy cross-write to the same key
    // surfaces as a fresh fetch instead of a TypeError.
    ctx.cache.set(ORGANIZATION_CACHE_KEY, { unrelated: "value" });
    const fetchSpy = vi.fn().mockReturnValue(jsonResponse({ bank_accounts: [] }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const result = await bankAccountsCountCheck.run(ctx);
      expect(result.status).toBe("ok");
      expect(result.evidence?.["source"]).toBe("list-bank-accounts");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("falls back to listBankAccounts when no cached org is present", async () => {
    const fetchSpy = vi.fn().mockReturnValue(
      jsonResponse({
        bank_accounts: [
          {
            id: "a",
            name: "Main",
            status: "active",
            main: true,
            iban: "FR7612345987650123456789012",
            bic: "QNTOFRP1XXX",
            currency: "EUR",
            balance: 1000,
            balance_cents: 100000,
            authorized_balance: 1000,
            authorized_balance_cents: 100000,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const result = await bankAccountsCountCheck.run(buildContext());
      expect(result.status).toBe("ok");
      expect(result.detail).toBe("1 bank account");
      expect(result.evidence?.["source"]).toBe("list-bank-accounts");
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("einvoicing-settings check", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports ok with sending/receiving statuses", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sending_status: "enabled", receiving_status: "disabled" }));
    const result = await einvoicingSettingsCheck.run(buildContext());
    expect(result.status).toBe("ok");
    expect(result.detail).toBe("sending=enabled, receiving=disabled");
  });

  it("returns scope-suggestion when API returns 403", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({ errors: [{ code: "forbidden", detail: "missing scope" }] }, { status: 403 }),
    );
    const result = await einvoicingSettingsCheck.run(buildContext());
    expect(result.status).toBe("fail");
    expect(result.suggestedAction).toContain("einvoicing.read");
  });
});

describe("host-routing check", () => {
  it("reports ok for sandbox endpoint when staging-token is present", async () => {
    const result = await hostRoutingCheck.run(buildContext({ endpoint: SANDBOX, stagingTokenPresent: true }));
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("sandbox host");
  });

  it("reports ok for production endpoint when no staging-token", async () => {
    const result = await hostRoutingCheck.run(buildContext({ endpoint: PRODUCTION, stagingTokenPresent: false }));
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("production host");
  });

  it("reports warn for production endpoint with staging-token (AC scenario 4)", async () => {
    const result = await hostRoutingCheck.run(buildContext({ endpoint: PRODUCTION, stagingTokenPresent: true }));
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("routing mismatch");
    expect(result.suggestedAction).toContain("sandbox host");
  });

  it("reports warn for sandbox endpoint without staging-token", async () => {
    const result = await hostRoutingCheck.run(buildContext({ endpoint: SANDBOX, stagingTokenPresent: false }));
    expect(result.status).toBe("warn");
    expect(result.suggestedAction).toContain("production host");
  });
});
