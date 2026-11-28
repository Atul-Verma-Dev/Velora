// Complete the Look — offer reference plumbing shared by the cart, checkout
// and order store.
//
// A backend offer is only redeemable when the persisted recommendation id
// travels on the cart line from the moment it is added, then reaches the
// backend as {recommendation_id, sku, size} when the order is placed. The
// backend revalidates acceptance, sku, size and price; these helpers only make
// sure the reference is well formed before it leaves the browser.

export function isValidRecommendationRef(line) {
  if (!line?.offer) return false;
  const id = Number(line.recommendationId);
  return Number.isInteger(id) && id > 0 && Boolean(line.productId) && Boolean(line.size);
}

export function offerReferencesFromCart(cart = []) {
  return cart.filter(isValidRecommendationRef).map((line) => ({
    recommendation_id: Number(line.recommendationId),
    sku: line.productId,
    size: line.size,
  }));
}
