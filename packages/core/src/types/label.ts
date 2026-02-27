// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A Qonto label used to categorize transactions.
 * Labels support hierarchical relationships via `parent_id`.
 */
export interface Label {
  readonly id: string;
  readonly name: string;
  readonly parent_id: string | null;
}
