"""End-to-end check of the Complete the Look acceptance loop.

Exercises the real path against a running backend and the configured database:

    recommend -> accept -> order with offer_references
      -> bundle_acceptance_events row linked to the order
      -> seller liquidation summary reflects the acceptance

It creates one demo order and one acceptance event (deliberately: that is the
evidence the seller dashboard needs). Run it against a backend whose
DATABASE_URL points at the same database you inspect.

    python scripts/verify_acceptance_flow.py --base-url http://127.0.0.1:8001
"""

import argparse
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from app.core.db import db_cursor  # noqa: E402


def seller_for(sku: str) -> str:
    with db_cursor() as cur:
        cur.execute("SELECT seller_id FROM products WHERE sku = %s", (sku,))
        row = cur.fetchone()
    if not row:
        raise SystemExit(f"SKU {sku} not found in the database")
    return row["seller_id"]


def summary(client: httpx.Client, seller_id: str) -> dict:
    resp = client.get(f"/api/v1/seller/{seller_id}/liquidation/summary")
    resp.raise_for_status()
    return resp.json()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base-url", default="http://127.0.0.1:8000")
    ap.add_argument("--base-sku", default="VLR-1001", help="SKU already in the shopper's bag")
    ap.add_argument("--base-size", default="M")
    ap.add_argument("--limit", type=int, default=3)
    args = ap.parse_args()

    client = httpx.Client(base_url=args.base_url, timeout=60)

    health = client.get("/health")
    health.raise_for_status()
    print(f"1. backend healthy at {args.base_url}")

    rec_resp = client.post(
        "/api/v1/bundles/recommend",
        json={
            "cart_items": [{"sku": args.base_sku, "size": args.base_size, "qty": 1}],
            "cart_session_id": f"e2e-{uuid.uuid4().hex[:10]}",
            "limit": args.limit,
        },
    )
    rec_resp.raise_for_status()
    recs = [r for r in rec_resp.json()["recommendations"] if r["stock_available"] >= 1]
    if not recs:
        raise SystemExit("No in-stock Complete the Look recommendation came back")
    rec = recs[0]
    print(
        f"2. recommended {rec['sku']} size {rec['size']} at INR {rec['price']} "
        f"(recommendation_id={rec['recommendation_id']}, tier={rec['tier_label']})"
    )

    seller_id = seller_for(rec["sku"])
    before = summary(client, seller_id)
    print(
        f"3. seller {seller_id} before: accepted={before['accepted']} "
        f"capital_liquidated={before['capital_liquidated']} "
        f"reverse_logistics_saved={before['reverse_logistics_saved']}"
    )

    accept_resp = client.post(
        "/api/v1/bundles/accept", json={"recommendation_id": rec["recommendation_id"]}
    )
    accept_resp.raise_for_status()
    assert accept_resp.json()["accepted"] is True
    print(f"4. accepted recommendation {rec['recommendation_id']}")

    user_id = f"e2e-{uuid.uuid4().hex[:10]}"
    order_resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": user_id,
            "customer_name": "Phase 2 Verification",
            "contact": "9999999999",
            "address": "1 Verification Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": args.base_sku, "size": args.base_size, "qty": 1},
                {"sku": rec["sku"], "size": rec["size"], "qty": 1},
            ],
            "offer_references": [
                {
                    "recommendation_id": rec["recommendation_id"],
                    "sku": rec["sku"],
                    "size": rec["size"],
                }
            ],
        },
    )
    if order_resp.status_code != 200:
        raise SystemExit(f"Order rejected ({order_resp.status_code}): {order_resp.text}")
    order = order_resp.json()
    offer_line = [i for i in order["items"] if i["sku"] == rec["sku"]]
    assert offer_line and offer_line[0]["offer_flag"] is True
    assert offer_line[0]["price"] == rec["price"]
    print(f"5. order {order['id']} placed; offer line priced {offer_line[0]['price']}")

    with db_cursor() as cur:
        cur.execute(
            "SELECT order_id FROM bundle_acceptance_events WHERE recommendation_id = %s",
            (rec["recommendation_id"],),
        )
        event = cur.fetchone()
    if not event:
        raise SystemExit("FAILED: no bundle_acceptance_events row for the redeemed offer")
    if event["order_id"] != order["id"]:
        raise SystemExit(f"FAILED: event links to {event['order_id']}, expected {order['id']}")
    print(f"6. bundle_acceptance_events row created for order {event['order_id']}")

    after = summary(client, seller_id)
    delta_units = after["units_liquidated"] - before["units_liquidated"]
    delta_capital = round(after["capital_liquidated"] - before["capital_liquidated"], 2)
    delta_reverse = round(after["reverse_logistics_saved"] - before["reverse_logistics_saved"], 2)
    print(
        f"7. seller {seller_id} after: accepted={after['accepted']} "
        f"units_liquidated={after['units_liquidated']} "
        f"capital_liquidated={after['capital_liquidated']} "
        f"reverse_logistics_saved={after['reverse_logistics_saved']}"
    )
    print(f"   delta: units +{delta_units}, capital +{delta_capital}, reverse logistics +{delta_reverse}")
    if delta_units != 1 or delta_capital != rec["price"]:
        raise SystemExit("FAILED: seller liquidation summary did not move by the accepted unit")

    print("\nPASS — accepted offer -> order -> acceptance event -> seller summary")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
