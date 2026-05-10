// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A webhook subscription — a registered URL that receives event notifications.
 *
 * `description` is omitted entirely from API responses (not returned as null);
 * modeled here as `string | null | undefined` so consumers handle either shape.
 */
export interface WebhookSubscription {
  readonly id: string;
  readonly organization_id: string;
  readonly membership_id: string;
  readonly callback_url: string;
  readonly types: readonly string[];
  readonly description?: string | null | undefined;
  readonly secret: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}
