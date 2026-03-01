// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { getEInvoicingSettings } from "./einvoicing.js";

describe("getEInvoicingSettings", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the e-invoicing settings from the API response", async () => {
    const settings = {
      sending_status: "enabled",
      receiving_status: "enabled",
    };
    fetchSpy.mockReturnValue(jsonResponse(settings));

    const result = await getEInvoicingSettings(client);

    expect(result).toEqual(settings);
    expect(result.sending_status).toBe("enabled");
    expect(result.receiving_status).toBe("enabled");
  });

  it("calls the correct API endpoint", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sending_status: "disabled", receiving_status: "disabled" }));

    await getEInvoicingSettings(client);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/einvoicing/settings");
  });
});
