"""Fit confidence engine — backend port of frontend src/lib/fit.js.

Advisory only; not a guarantee of measurement accuracy. No camera scanning.
"""

SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"]

APPAREL_CHEST_IN = {"XS": 33, "S": 35, "M": 37.5, "L": 40, "XL": 43, "XXL": 46}
EASE_BANDS = {
    "slim": {"min": 1.5, "max": 4.5, "label": "close"},
    "regular": {"min": 4, "max": 8, "label": "regular"},
    "relaxed": {"min": 6, "max": 12, "label": "relaxed"},
    "oversized": {"min": 9, "max": 17, "label": "generous"},
}
STRETCH_BONUS = {"low": 0, "medium": 1.5, "high": 3}


def _is_bottom(p: dict) -> bool:
    if p.get("subcategory") in ("Trousers", "Denim"):
        return True
    name = (p.get("name") or "").lower()
    if p.get("subcategory") in (
        "Kurta Sets", "Co-ords", "Shirts", "Tops & Shirts", "Dresses", "Knitwear",
        "Outerwear", "Sarees", "Lehengas", "Anarkalis", "Dupattas",
    ):
        return False
    return bool(__import__("re").search(r"\b(trousers?|jeans?|shorts)\b", name))


def _is_footwear(p: dict) -> bool:
    return p.get("category") == "Footwear"


def _is_accessory(p: dict) -> bool:
    return p.get("category") == "Accessories" and not _is_footwear(p)


def estimate_body(height: float, weight: float, shape: str) -> dict:
    h = float(height) or 170.0
    w = float(weight) or 68.0
    bmi = w / (h / 100) ** 2
    chest = round((w * 0.95 + (h - 100) * 0.42 + (bmi - 21) * 1.2) * 10) / 10
    waist = round((chest * 0.84 + (bmi - 21) * 1.6) * 10) / 10
    hip = round((chest * 0.98 + 2) * 10) / 10
    if shape == "Triangle":
        hip += 5
    if shape == "Inverted triangle":
        hip -= 5
    if shape == "Oval":
        waist += 4
        hip += 2
    if shape == "Hourglass":
        waist -= 2
        hip += 2
    return {"chest": chest, "waist": waist, "hip": hip, "source": "estimate"}


def _to_in(cm: float) -> float:
    return round((cm / 2.54) * 10) / 10


def _zone_label(delta: float, band: dict) -> dict:
    if delta < band["min"] - 3:
        return {"fit": "Close", "tone": "tight"}
    if delta < band["min"]:
        return {"fit": "Slightly close", "tone": "tight"}
    if delta <= band["max"]:
        return {"fit": "Just right", "tone": "ok"}
    if delta <= band["max"] + 4:
        return {"fit": "Roomy", "tone": "loose"}
    return {"fit": "Very roomy", "tone": "loose"}


def garment_spec(product: dict, size: str) -> dict:
    if _is_accessory(product):
        return {"type": "one-size", "note": "One size — no garment fit calculation needed."}
    if _is_footwear(product):
        import re
        uk = float(re.sub(r"[^\d.]", "", str(size))) or 8
        return {
            "type": "footwear",
            "foot_length_cm": round((22.5 + (uk - 5) * 0.85) * 10) / 10,
            "insole_width_cm": 8.6,
        }
    stretch = product.get("stretch") or "low"
    band = EASE_BANDS.get(product.get("fit_ease") or "regular", EASE_BANDS["regular"])
    stretch_pad = STRETCH_BONUS.get(stretch, 0)

    if _is_bottom(product):
        waist = float(size) if str(size).replace(".", "", 1).isdigit() else 32
        return {
            "type": "bottom",
            "waist_in": waist,
            "hip_in": waist + 7,
            "rise_in": 11.5,
            "inseam_in": 7 if "shorts" in (product.get("name") or "").lower() else 30,
            "thigh_in": waist * 0.72,
            "ease_band": band,
            "stretch": stretch,
            "stretch_pad": stretch_pad,
        }

    body_chest = APPAREL_CHEST_IN.get(size, 37.5)
    ease = product.get("fit_ease") or "regular"
    ease_target = 2.5 if ease == "slim" else 12 if ease == "oversized" else 8 if ease == "relaxed" else 5.5
    ethnic = product.get("category") == "Ethnic Wear"
    chest = body_chest + ease_target + (1.5 if ethnic else 0)
    return {
        "type": "apparel",
        "chest_in": round(chest * 10) / 10,
        "waist_in": round((chest - 4) * 10) / 10,
        "hip_in": round((chest - 1) * 10) / 10,
        "shoulder_in": round((body_chest * 0.38 + 4) * 10) / 10,
        "length_in": 44 if ethnic else 29,
        "ease_band": band,
        "stretch": stretch,
        "stretch_pad": stretch_pad,
    }


def recommend(product: dict, body: dict, preference: str = "regular") -> dict | None:
    if not body:
        return None
    if _is_accessory(product):
        return {
            "size": "One size",
            "confidence": "Not applicable",
            "zones": [],
            "explanation": "This piece is one size, so garment fit does not vary.",
            "ranked": [],
            "demo_sizes": True,
        }

    ranked = []
    for size in product.get("sizes", SIZE_ORDER):
        g = garment_spec(product, size)
        if g.get("type") == "footwear":
            foot_len = float(body.get("foot_length_cm") or 26)
            delta = g["foot_length_cm"] - foot_len
            score = abs(delta) * 10
            ranked.append({
                "size": size,
                "delta": delta,
                "score": score,
                "zones": [{
                    "zone": "Insole length",
                    "fit": "Just right" if delta < 0.2 else "Snug" if delta < 0.7 else "Roomy",
                    "tone": "ok",
                }],
            })
            continue
        body_chest = _to_in(body.get("chest", 96))
        body_waist = _to_in(body.get("waist", 82))
        body_hip = _to_in(body.get("hip", 100))
        shift = -1.5 if preference == "snug" else 1.5 if preference == "loose" else 0
        zones = []
        score = 0.0
        if g.get("type") == "bottom":
            waist_delta = g["waist_in"] - body_waist
            hip_delta = g["hip_in"] - body_hip
            zones = [
                {"zone": "Waist", **_zone_label(waist_delta, g["ease_band"])},
                {"zone": "Hip", **_zone_label(hip_delta, g["ease_band"])},
            ]
            score = abs(waist_delta - (0.5 + shift)) * 2 + abs(hip_delta - (1.5 + shift))
        else:
            chest_ease = g["chest_in"] - body_chest
            waist_delta = g["waist_in"] - body_waist
            shoulder_delta = g["shoulder_in"] - body_chest * 0.38
            zones = [
                {"zone": "Chest", **_zone_label(chest_ease, g["ease_band"])},
                {"zone": "Waist", **_zone_label(waist_delta, g["ease_band"])},
                {"zone": "Shoulder", "fit": "Snug" if shoulder_delta < 0 else "Roomy" if shoulder_delta > 2.5 else "Just right",
                 "tone": "tight" if shoulder_delta < 0 else "ok"},
            ]
            band = g["ease_band"]
            score = abs(chest_ease - ((band["min"] + band["max"]) / 2 + shift)) + abs(waist_delta - (band["min"] + shift)) * 0.5
        ranked.append({"size": size, "score": score, "zones": zones, "ease": g})

    ranked.sort(key=lambda r: r["score"])
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    gap = (second["score"] - best["score"]) if second else 2
    confidence = "Good match" if gap > 2.5 else "Reasonable match" if gap > 1 else "Close call"
    band = best.get("ease", {}).get("ease_band")
    tight = any(z["tone"] == "tight" for z in best["zones"])
    loose = any(z["tone"] == "loose" for z in best["zones"])

    if _is_footwear(product):
        explanation = f"{best['size']} matches your foot length most closely. If between sizes, take the larger."
    elif _is_bottom(product):
        explanation = (
            f"{best['size']} sits closest to your estimated {int(_to_in(body.get('waist', 82)))} in waist. "
            + ("It may feel snug at first." if tight else "Expect a roomier line through the hip." if loose else "Expect the intended straight line.")
        )
    else:
        explanation = (
            f"{best['size']} gives about {int(best['ease']['chest_in'] - _to_in(body.get('chest', 96)))} in of chest ease "
            f"— the garment is designed for a {band['label'] if band else 'regular'} fit."
            + (" The shoulder may feel close." if tight else " It will sit generously through the body." if loose else "")
        )

    return {
        "size": best["size"],
        "confidence": confidence,
        "zones": best["zones"],
        "explanation": explanation,
        "ranked": ranked[:3],
        "note": "Estimated from the inputs you provided and this garment's demo measurements. Actual fit varies.",
        "advisory": True,
    }


def fit_profile_for(product: dict, profile: dict) -> dict | None:
    if not profile:
        return None
    mode = profile.get("mode") or "fast"
    if mode == "precision" and profile.get("measurements"):
        m = profile["measurements"]
        body = {
            "chest": float(m.get("chest") or 96),
            "waist": float(m.get("waist") or 82),
            "hip": float(m.get("hip") or 100),
            "foot_length_cm": float(m.get("footLengthCm") or 27),
            "source": "measured",
        }
    else:
        body = estimate_body(float(profile.get("height") or 170), float(profile.get("weight") or 68), profile.get("shape") or "Balanced")
        import re
        usual = profile.get("usual_size") or "M"
        usual_digits = re.sub(r"[^\d.]", "", usual)
        body["foot_length_cm"] = 22.5 + (float(usual_digits) if usual_digits else 4) * 0.85
        body["source"] = "estimate"
    return recommend(product, body, profile.get("fitPreference") or "regular")
