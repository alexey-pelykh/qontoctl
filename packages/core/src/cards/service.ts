// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient, QueryParams } from "../http-client.js";
import type { Card, CardTypeAppearances } from "../types/card.js";
import type {
  CreateCardParams,
  ListCardsParams,
  UpdateCardLimitsParams,
  UpdateCardOptionsParams,
  UpdateCardRestrictionsParams,
} from "./types.js";

/**
 * Build query parameter record from typed list parameters.
 *
 * Array parameters use the `key[]` convention expected by the Qonto API.
 */
export function buildCardQueryParams(params: ListCardsParams): QueryParams {
  const query: Record<string, string | readonly string[]> = {};

  if (params.query !== undefined) {
    query["query"] = params.query;
  }
  if (params.sort_by !== undefined) {
    query["sort_by"] = params.sort_by;
  }
  if (params.holder_ids !== undefined && params.holder_ids.length > 0) {
    query["holder_ids[]"] = params.holder_ids;
  }
  if (params.statuses !== undefined && params.statuses.length > 0) {
    query["statuses[]"] = params.statuses;
  }
  if (params.bank_account_ids !== undefined && params.bank_account_ids.length > 0) {
    query["bank_account_ids[]"] = params.bank_account_ids;
  }
  if (params.card_levels !== undefined && params.card_levels.length > 0) {
    query["card_levels[]"] = params.card_levels;
  }
  if (params.ids !== undefined && params.ids.length > 0) {
    query["ids[]"] = params.ids;
  }

  return query;
}

/**
 * Create a new card.
 */
export async function createCard(
  client: HttpClient,
  params: CreateCardParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Card> {
  const response = await client.post<{ card: Card }>("/v2/cards", params, options);
  return response.card;
}

/**
 * Bulk create cards (up to 50).
 */
export async function bulkCreateCards(
  client: HttpClient,
  cards: readonly CreateCardParams[],
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<readonly Card[]> {
  const response = await client.post<{ cards: readonly Card[] }>("/v2/cards/bulk", { cards }, options);
  return response.cards;
}

/**
 * Lock a card.
 */
export async function lockCard(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Card> {
  const response = await client.put<{ card: Card }>(`/v2/cards/${encodeURIComponent(id)}/lock`, undefined, options);
  return response.card;
}

/**
 * Unlock a card.
 */
export async function unlockCard(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Card> {
  const response = await client.put<{ card: Card }>(`/v2/cards/${encodeURIComponent(id)}/unlock`, undefined, options);
  return response.card;
}

/**
 * Report a physical card as lost.
 */
export async function reportCardLost(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Card> {
  const response = await client.put<{ card: Card }>(`/v2/cards/${encodeURIComponent(id)}/lost`, undefined, options);
  return response.card;
}

/**
 * Report a physical card as stolen.
 */
export async function reportCardStolen(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Card> {
  const response = await client.put<{ card: Card }>(`/v2/cards/${encodeURIComponent(id)}/stolen`, undefined, options);
  return response.card;
}

/**
 * Discard a virtual card.
 */
export async function discardCard(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Card> {
  const response = await client.put<{ card: Card }>(`/v2/cards/${encodeURIComponent(id)}/discard`, undefined, options);
  return response.card;
}

/**
 * Update a card's spending limits.
 */
export async function updateCardLimits(
  client: HttpClient,
  id: string,
  params: UpdateCardLimitsParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Card> {
  const response = await client.patch<{ card: Card }>(
    `/v2/cards/${encodeURIComponent(id)}/limits`,
    { card: params },
    options,
  );
  return response.card;
}

/**
 * Update a card's nickname.
 */
export async function updateCardNickname(
  client: HttpClient,
  id: string,
  nickname: string,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Card> {
  const response = await client.patch<{ card: Card }>(
    `/v2/cards/${encodeURIComponent(id)}/nickname`,
    { card: { nickname } },
    options,
  );
  return response.card;
}

/**
 * Update a card's options (ATM, NFC, online, foreign).
 */
export async function updateCardOptions(
  client: HttpClient,
  id: string,
  params: UpdateCardOptionsParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Card> {
  const response = await client.patch<{ card: Card }>(
    `/v2/cards/${encodeURIComponent(id)}/options`,
    { card: params },
    options,
  );
  return response.card;
}

/**
 * Update a card's restrictions (active days, merchant categories).
 */
export async function updateCardRestrictions(
  client: HttpClient,
  id: string,
  params: UpdateCardRestrictionsParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Card> {
  const response = await client.patch<{ card: Card }>(
    `/v2/cards/${encodeURIComponent(id)}/restrictions`,
    { card: params },
    options,
  );
  return response.card;
}

/**
 * Get the secure iframe URL for viewing card details.
 */
export async function getCardIframeUrl(client: HttpClient, id: string): Promise<string> {
  const response = await client.get<{ iframe_url: string }>(`/v2/cards/${encodeURIComponent(id)}/data_view`);
  return response.iframe_url;
}

/**
 * List available card appearances.
 */
export async function listCardAppearances(client: HttpClient): Promise<readonly CardTypeAppearances[]> {
  const response = await client.get<{ card_type_appearances: readonly CardTypeAppearances[] }>("/v2/cards/appearances");
  return response.card_type_appearances;
}
