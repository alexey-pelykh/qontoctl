// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { AttachmentSchema } from "./schemas.js";

describe("AttachmentSchema", () => {
  const validAttachment = {
    id: "att-1",
    file_name: "invoice.pdf",
    file_size: "12345",
    file_content_type: "application/pdf",
    url: "https://example.com/attachments/att-1",
    created_at: "2026-03-01T10:00:00Z",
  };

  it("parses a valid attachment", () => {
    const result = AttachmentSchema.parse(validAttachment);
    expect(result).toEqual(validAttachment);
  });

  it("strips unknown fields", () => {
    const result = AttachmentSchema.parse({ ...validAttachment, extra: "field" });
    expect(result).toEqual(validAttachment);
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects when required field is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _, ...withoutId } = validAttachment;
    expect(() => AttachmentSchema.parse(withoutId)).toThrow(z.ZodError);
  });

  it("coerces numeric file_size to string", () => {
    const result = AttachmentSchema.parse({ ...validAttachment, file_size: 12345 });
    expect(result.file_size).toBe("12345");
  });
});
