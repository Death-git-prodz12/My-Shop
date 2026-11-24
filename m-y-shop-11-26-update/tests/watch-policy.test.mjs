import test from "node:test";
import assert from "node:assert/strict";
import { changeWatchList, normalizeWatchList, MAX_WATCHED_PRODUCTS } from "../js/watch-policy.js";

test("liste dédupliquée et limité à 30 produits", () => {
  assert.equal(MAX_WATCHED_PRODUCTS, 30);
  assert.deepEqual(normalizeWatchList(["a", "a", 2, " b ", ""]), ["a", "b"]);
  const ids = Array.from({ length: 30 }, (_, index) => `p-${index}`);
  assert.deepEqual(changeWatchList(ids, "p-30"), { list: ids, added: false, limitReached: true });
});

test("ajout à la limite, retrait et ajout idempotent", () => {
  const atLimit = Array.from({ length: 29 }, (_, index) => `p-${index}`);
  const added = changeWatchList(atLimit, "p-29");
  assert.equal(added.added, true);
  assert.equal(added.list.length, 30);
  assert.deepEqual(changeWatchList(added.list, "p-29"), { list: atLimit, added: false, limitReached: false });
  assert.equal(changeWatchList(atLimit, "p-0").list.length, 28);
});
