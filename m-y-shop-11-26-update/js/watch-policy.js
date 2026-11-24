import { CONFIG } from "./config.js";

export const MAX_WATCHED_PRODUCTS = CONFIG.MAX_WATCHED_PRODUCTS || 30;

export function normalizeWatchList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => typeof id === "string" && id.trim()).map(id => id.trim()))];
}

export function changeWatchList(value, id, limit = MAX_WATCHED_PRODUCTS) {
  const list = normalizeWatchList(value), productId = String(id || "").trim();
  if (!productId) return { list, added: false, limitReached: false };
  const index = list.indexOf(productId);
  if (index >= 0) {
    list.splice(index, 1);
    return { list, added: false, limitReached: false };
  }
  if (list.length >= limit) return { list, added: false, limitReached: true };
  list.push(productId);
  return { list, added: true, limitReached: false };
}
