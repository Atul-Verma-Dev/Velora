"""Deterministic fit-scoring tests for the reviewable demo scenario.

Demo scenario (frontend Fit page, "Load demo scenario" or
/fit?demo=1&sku=VLR-3001):
  172 cm, 74 kg, Hourglass, anchor Fabindia, usual size M, "as designed"
  on VLR-3001 Marigold Handblock Kurta (Ethnic Wear, relaxed ease, low
  stretch) → size L, "Reasonable match", chest/waist "Just right",
  shoulder "Roomy".

These pin the estimate → garment spec → recommend pipeline so the demo result
is reviewable without a screenshot. Pure unit tests: no database required.
"""

from app.services.fit import estimate_body, fit_profile_for, garment_spec, recommend

# Mirrors VLR-3001 in frontend/src/data/catalog.js (snake_case backend fields).
KURTA = {
    "name": "Marigold Handblock Kurta",
    "category": "Ethnic Wear",
    "subcategory": "Kurta Sets",
    "fit_ease": "relaxed",
    "stretch": "low",
    "sizes": ["XS", "S", "M", "L", "XL"],
}

DEMO_PROFILE = {
    "height": 172,
    "weight": 74,
    "shape": "Hourglass",
    "anchor_brand": "Fabindia",
    "usual_size": "M",
    "fit_preference": "regular",
    "mode": "fast",
}


def test_estimate_body_for_demo_profile():
    body = estimate_body(172, 74, "Hourglass")
    assert body["chest"] == 105.4
    # 95.0 after BMI, then −2 for the Hourglass waist adjustment.
    assert body["waist"] == 93.0
    assert body["hip"] == 107.3
    assert body["source"] == "estimate"


def test_shape_only_moves_hip_and_waist():
    balanced = estimate_body(172, 74, "Balanced")
    triangle = estimate_body(172, 74, "Triangle")
    inverted = estimate_body(172, 74, "Inverted triangle")
    assert triangle["chest"] == balanced["chest"]
    assert triangle["hip"] == balanced["hip"] + 5
    assert inverted["hip"] == balanced["hip"] - 5


def test_garment_spec_includes_intended_ease():
    spec = garment_spec(KURTA, "M")
    assert spec["type"] == "apparel"
    # Body chest 37.5 + 8 relaxed + 1.5 ethnic + 0.5 kurta-set cut.
    assert spec["chest_in"] == 47.5
    assert spec["waist_in"] == 43.5
    assert spec["hip_in"] == 46.5
    assert spec["length_in"] == 44
    assert spec["ease_band"] == {"min": 6, "max": 12, "label": "relaxed"}
    assert spec["stretch"] == "low"


def test_bottom_garment_spec_uses_the_waist_size():
    trousers = {
        "name": "Straight Leg Trousers",
        "category": "Women",
        "subcategory": "Trousers",
        "fit_ease": "regular",
        "stretch": "medium",
        "sizes": ["28", "30", "32"],
    }
    spec = garment_spec(trousers, "30")
    assert spec["type"] == "bottom"
    assert spec["waist_in"] == 30.0
    assert spec["hip_in"] == 37.0
    assert spec["inseam_in"] == 30


def test_recommend_demo_scenario():
    rec = recommend(KURTA, estimate_body(172, 74, "Hourglass"), "regular")
    assert rec["size"] == "L"
    assert rec["confidence"] == "Reasonable match"
    assert [(z["zone"], z["fit"]) for z in rec["zones"]] == [
        ("Chest", "Just right"),
        ("Waist", "Just right"),
        ("Shoulder", "Roomy"),
    ]
    assert rec["explanation"].startswith("L gives about 9 in of chest ease")
    assert rec["explanation"].endswith("designed for a relaxed fit.")
    assert [r["size"] for r in rec["ranked"]] == ["L", "M", "XL"]
    assert rec["advisory"] is True


def test_subcategory_cut_changes_the_finished_measurement():
    shirt = {**KURTA, "subcategory": "Shirts"}
    kurta = {**KURTA, "subcategory": "Kurta Sets"}
    coat = {**KURTA, "subcategory": "Outerwear"}
    assert garment_spec(shirt, "M")["chest_in"] == 46.0
    assert garment_spec(kurta, "M")["chest_in"] == 47.5
    assert garment_spec(coat, "M")["chest_in"] == 48.5


def test_medium_body_spreads_across_subcategories():
    medium = estimate_body(170, 68, "Balanced")
    shirt = {
        **KURTA, "name": "Everyday Shirt", "category": "Western Wear",
        "subcategory": "Shirts", "fit_ease": "regular",
    }
    picks = [recommend(shirt, medium, "regular")["size"], recommend(KURTA, medium, "regular")["size"]]
    assert picks == ["L", "M"]


def test_fit_preference_moves_the_pick():
    body = estimate_body(172, 74, "Hourglass")
    # A relaxed kurta already sits at the top of its ease band, so "roomier"
    # stays on L; a closer cut drops a size.
    assert recommend(KURTA, body, "snug")["size"] == "M"
    assert recommend(KURTA, body, "loose")["size"] == "L"


def test_fit_profile_fast_mode_matches_demo_recommendation():
    rec = fit_profile_for(KURTA, DEMO_PROFILE)
    assert rec["size"] == "L"
    assert rec["confidence"] == "Reasonable match"


def test_fit_profile_reads_api_snake_case_preference():
    """The API schema sends fit_preference; it must reach scoring, not default to regular."""
    rec = fit_profile_for(KURTA, {**DEMO_PROFILE, "fit_preference": "snug"})
    assert rec["size"] == "M"  # default "as designed" gives L


def test_precision_measurements_pick_a_different_size():
    rec = fit_profile_for(
        KURTA,
        {"mode": "precision", "measurements": {"chest": 96, "waist": 82, "hip": 100}},
    )
    assert rec["size"] == "S"
    assert rec["confidence"] == "Close call"


def test_one_size_accessory_skips_garment_maths():
    dupatta = {
        "name": "Mustard Bandhani Dupatta",
        "category": "Accessories",
        "subcategory": "Dupattas",
        "sizes": ["One size"],
    }
    rec = recommend(dupatta, estimate_body(172, 74, "Hourglass"), "regular")
    assert rec["size"] == "One size"
    assert rec["confidence"] == "Not applicable"
    assert rec["zones"] == []


DENIM = {
    "name": "Wide-Leg Denim",
    "category": "Western Wear",
    "subcategory": "Trousers & Denim",
    "fit_ease": "relaxed",
    "stretch": "low",
    "sizes": ["26", "28", "30", "32", "34"],
}


def test_waist_sized_chart_is_scored_as_a_bottom():
    """A "26"-style chart must use the bottom maths, not letter body sizes."""
    spec = garment_spec(DENIM, "30")
    assert spec["type"] == "bottom"
    assert spec["waist_in"] == 30.0


def test_waist_sized_bottom_differs_by_body():
    demo = recommend(DENIM, estimate_body(172, 74, "Hourglass"), "regular")
    small = recommend(DENIM, estimate_body(165, 55, "Balanced"), "regular")
    assert demo["size"] == "34"
    assert small["size"] == "26"
    # The old bug tied every candidate at one score and always picked the first.
    assert len({r["score"] for r in demo["ranked"]}) > 1


def test_db_style_size_dicts_are_supported():
    denim = {**DENIM, "sizes": [{"size": "26", "stock": 1}, {"size": "30", "stock": 2}]}
    assert garment_spec(denim, "30")["type"] == "bottom"


SNEAKER = {
    "name": "Court Trainer",
    "category": "Footwear",
    "subcategory": "Sneakers",
    "sizes": ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
}


def test_footwear_follows_height_when_no_shoe_size_is_known():
    short = fit_profile_for(SNEAKER, {**DEMO_PROFILE, "height": 160, "weight": 52})
    tall = fit_profile_for(SNEAKER, {**DEMO_PROFILE, "height": 190, "weight": 85})
    assert short["size"] == "UK 7"
    assert tall["size"] == "UK 11"
