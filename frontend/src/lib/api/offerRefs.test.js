// Complete the Look plumbing tests: the cart line must carry the persisted
// recommendation id, and checkout must send it as {recommendation_id, sku, size}.
import test from "node:test";
import assert from "node:assert/strict";

import { isValidRecommendationRef, offerReferencesFromCart } from "./offerRefs.js";

const acceptedOfferLine = {
  productId: "VLR-4010",
  size: "One size",
  qty: 1,
  price: 699,
  offer: true,
  recommendationId: 42,
};

test("an accepted backend offer line keeps its recommendation id through cart persistence", () => {
  // The cart is persisted to localStorage, so the id must survive a JSON round trip.
  const restored = JSON.parse(JSON.stringify([acceptedOfferLine]));
  assert.equal(restored[0].recommendationId, 42);
  assert.equal(isValidRecommendationRef(restored[0]), true);
});

test("checkout references carry recommendation_id, sku and size", () => {
  assert.deepEqual(offerReferencesFromCart([acceptedOfferLine]), [
    { recommendation_id: 42, sku: "VLR-4010", size: "One size" },
  ]);
});

test("missing, zero, negative and non-numeric recommendation ids are rejected", () => {
  for (const recommendationId of [undefined, null, "", 0, -3, "abc", 1.5]) {
    assert.equal(
      isValidRecommendationRef({ ...acceptedOfferLine, recommendationId }),
      false,
      `recommendationId ${String(recommendationId)} should be invalid`,
    );
  }
  assert.deepEqual(
    offerReferencesFromCart([
      acceptedOfferLine,
      { ...acceptedOfferLine, recommendationId: undefined },
      { ...acceptedOfferLine, recommendationId: 0 },
      { ...acceptedOfferLine, recommendationId: "abc" },
    ]),
    [{ recommendation_id: 42, sku: "VLR-4010", size: "One size" }],
  );
});

test("a regular (non-offer) cart line is never sent as an offer reference", () => {
  const regular = { ...acceptedOfferLine, offer: false };
  assert.equal(isValidRecommendationRef(regular), false);
  assert.deepEqual(offerReferencesFromCart([regular]), []);
});

test("numeric strings from storage are normalised to integers", () => {
  assert.deepEqual(
    offerReferencesFromCart([{ ...acceptedOfferLine, recommendationId: "42" }]),
    [{ recommendation_id: 42, sku: "VLR-4010", size: "One size" }],
  );
});
