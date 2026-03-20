// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

export function parseResponse<T extends z.ZodType>(schema: T, response: unknown, endpointPath: string): z.infer<T> {
  try {
    return schema.parse(response) as z.infer<T>;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") + ": " : "";
          return `${path}${issue.message}`;
        })
        .join("; ");
      throw new Error(`Invalid API response from ${endpointPath}: ${issues}`);
    }
    throw error;
  }
}
