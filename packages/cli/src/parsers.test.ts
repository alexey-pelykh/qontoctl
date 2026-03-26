// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { parseAmount, parseBool } from "./parsers.js";

describe("parseBool", () => {
  it('returns true for "true"', () => {
    expect(parseBool("true")).toBe(true);
  });

  it('returns false for "false"', () => {
    expect(parseBool("false")).toBe(false);
  });

  it.each(["yes", "no", "1", "0", "TRUE", "False", ""])("throws for invalid value %j", (value) => {
    expect(() => parseBool(value)).toThrow(`Expected "true" or "false", got "${value}".`);
  });
});

describe("parseAmount", () => {
  it("parses integer amounts", () => {
    expect(parseAmount("1000")).toBe(1000);
  });

  it("parses decimal amounts", () => {
    expect(parseAmount("50.5")).toBe(50.5);
  });

  it("parses zero", () => {
    expect(parseAmount("0")).toBe(0);
  });

  it("parses negative amounts", () => {
    expect(parseAmount("-100")).toBe(-100);
  });

  it.each(["abc", "NaN", "Infinity", "-Infinity"])("throws for invalid value %j", (value) => {
    expect(() => parseAmount(value)).toThrow(`Expected a numeric amount, got "${value}".`);
  });
});
