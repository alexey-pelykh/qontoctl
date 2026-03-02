// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A webhook subscription — a registered URL that receives event notifications.
 */
export interface WebhookSubscription {
  readonly id: string;
  readonly url: string;
  readonly event_types: readonly string[];
  readonly status: string;
  readonly secret: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}
