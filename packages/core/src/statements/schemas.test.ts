// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { StatementFileSchema, StatementSchema } from "./schemas.js";

describe("StatementFileSchema", () => {
  const validFile = {
    file_name: "statement-2026-01.pdf",
    file_content_type: "application/pdf",
    file_size: "45678",
    file_url: "https://example.com/statements/file.pdf",
  };

  it("parses a valid statement file", () => {
    const result = StatementFileSchema.parse(validFile);
    expect(result).toEqual(validFile);
  });

  it("coerces numeric file_size to string", () => {
    const result = StatementFileSchema.parse({ ...validFile, file_size: 45678 });
    expect(result.file_size).toBe("45678");
  });

  it("strips unknown fields", () => {
    const result = StatementFileSchema.parse({ ...validFile, extra: "field" });
    expect(result).toEqual(validFile);
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects when required field is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { file_name: _, ...withoutName } = validFile;
    expect(() => StatementFileSchema.parse(withoutName)).toThrow(z.ZodError);
  });
});

describe("StatementSchema", () => {
  const validStatement = {
    id: "stmt-1",
    bank_account_id: "ba-1",
    period: "01-2026",
    file: {
      file_name: "statement-2026-01.pdf",
      file_content_type: "application/pdf",
      file_size: "45678",
      file_url: "https://example.com/statements/file.pdf",
    },
  };

  it("parses a valid statement", () => {
    const result = StatementSchema.parse(validStatement);
    expect(result).toEqual(validStatement);
  });

  it("strips unknown fields from statement and nested file", () => {
    const result = StatementSchema.parse({
      ...validStatement,
      extra: "field",
      file: { ...validStatement.file, bonus: true },
    });
    expect(result).toEqual(validStatement);
    expect(result).not.toHaveProperty("extra");
    expect(result.file).not.toHaveProperty("bonus");
  });

  it("rejects when required field is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _, ...withoutId } = validStatement;
    expect(() => StatementSchema.parse(withoutId)).toThrow(z.ZodError);
  });

  it("rejects when nested file is invalid", () => {
    expect(() => StatementSchema.parse({ ...validStatement, file: { file_name: "test" } })).toThrow(z.ZodError);
  });
});
