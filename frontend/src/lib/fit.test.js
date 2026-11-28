// Deterministic fit-scoring tests for the reviewable demo scenario.
//
// Demo scenario (Fit page, "Load demo scenario" or /fit?demo=1&sku=VLR-3001):
//   172 cm, 74 kg, Hourglass, anchor Fabindia, usual size M, "as designed"
//   on VLR-3001 Marigold Handblock Kurta (Ethnic Wear, relaxed ease, low
//   stretch) → size L, "Reasonable match", chest/waist "Just right",
//   shoulder "Roomy".
//
// These pin the estimate → garment spec → recommend pipeline so the demo
// result is reviewable without a screenshot.
import test from "node:test";
import assert from "node:assert/strict";

import { products } from "../data/catalog.js";
import {
  estimateBody, estimateFootLength, fitProfileFor, garmentSpec, orderSizes, recommend, sizeChart, toIn,
} from "./fit.js";

const KURTA = products.find((p) => p.id === "VLR-3001");
const DEMO_PROFILE = {
  height: 172, weight: 74, shape: "Hourglass",
  anchorBrand: "Fabindia", usualSize: "M", fitPreference: "regular",
};

test("the demo product is still a real live catalogue listing", () => {
  assert.ok(KURTA, "VLR-3001 should exist in the catalogue");
  assert.equal(KURTA.name, "Marigold Handblock Kurta");
  assert.equal(KURTA.category, "Ethnic Wear");
  assert.equal(KURTA.fitEase, "relaxed");
  assert.equal(KURTA.stretch, "low");
  assert.deepEqual(KURTA.sizes, ["XS", "S", "M", "L", "XL"]);
});

test("estimateBody derives the demo body target from height, weight and shape", () => {
  const body = estimateBody(DEMO_PROFILE);
  assert.equal(body.chest, 105.4);
  assert.equal(body.waist, 93); // 95.0 after BMI, then −2 for Hourglass
  assert.equal(body.hip, 107.3);
  assert.equal(body.source, "estimate");
  assert.equal(toIn(body.chest), 41.5);
  assert.equal(toIn(body.waist), 36.6);
});

test("shape changes the hip estimate and never the chest", () => {
  const balanced = estimateBody({ ...DEMO_PROFILE, shape: "Balanced" });
  const triangle = estimateBody({ ...DEMO_PROFILE, shape: "Triangle" });
  const inverted = estimateBody({ ...DEMO_PROFILE, shape: "Inverted triangle" });
  assert.equal(triangle.chest, balanced.chest);
  assert.equal(triangle.hip, balanced.hip + 5);
  assert.equal(inverted.hip, balanced.hip - 5);
});

test("garmentSpec turns the size label into finished measurements with intended ease", () => {
  const spec = garmentSpec(KURTA, "M");
  assert.equal(spec.type, "apparel");
  // Body chest 37.5 + 8 relaxed + 1.5 ethnic + 0.5 kurta-set cut.
  assert.equal(spec.chestIn, 47.5);
  assert.equal(spec.waistIn, 43.5);
  assert.equal(spec.hipIn, 46.5);
  assert.equal(spec.lengthIn, 44);
  assert.deepEqual(spec.easeBand, { min: 6, max: 12, label: "relaxed" });
  assert.equal(spec.stretch, "low");
});

test("the demo profile on the demo product recommends L with an actionable breakdown", () => {
  const rec = recommend(KURTA, estimateBody(DEMO_PROFILE), DEMO_PROFILE.fitPreference);

  assert.equal(rec.size, "L");
  assert.equal(rec.confidence, "Reasonable match");
  assert.deepEqual(
    rec.zones.map((z) => [z.zone, z.fit]),
    [["Chest", "Just right"], ["Waist", "Just right"], ["Shoulder", "Roomy"]],
  );
  assert.equal(
    rec.explanation,
    "L gives about 9 in of chest ease — the garment is designed for a relaxed fit.",
  );
  assert.deepEqual(rec.ranked.map((r) => r.size), ["L", "M", "XL"]);
});

test("fit preference genuinely moves the pick", () => {
  const body = estimateBody(DEMO_PROFILE);
  // A relaxed kurta already sits at the top of its ease band, so asking for
  // roomier stays on L; asking for a closer cut drops a size.
  assert.equal(recommend(KURTA, body, "snug").size, "M");
  assert.equal(recommend(KURTA, body, "loose").size, "L");
});

test("precision measurements run the same pipeline and can pick a different size", () => {
  const rec = fitProfileFor(KURTA, {
    mode: "precision",
    measurements: { chest: 96, waist: 82, hip: 100 },
  });
  assert.equal(rec.size, "S");
  assert.equal(rec.confidence, "Close call");
});

test("fitProfileFor fast mode matches the demo recommendation", () => {
  const rec = fitProfileFor(KURTA, { ...DEMO_PROFILE, mode: "fast" });
  assert.equal(rec.size, "L");
  assert.equal(rec.confidence, "Reasonable match");
});

test("one-size accessories skip garment maths", () => {
  const dupatta = products.find((p) => p.id === "VLR-4010");
  const rec = recommend(dupatta, estimateBody(DEMO_PROFILE), "regular");
  assert.equal(rec.size, "One size");
  assert.equal(rec.confidence, "Not applicable");
  assert.deepEqual(rec.zones, []);
});

// --- size charts read from the database are alphabetical --------------------

test("size labels are put back in a usable order", () => {
  assert.deepEqual(orderSizes(["L", "M", "S", "XL", "XS"]), ["XS", "S", "M", "L", "XL"]);
  assert.deepEqual(orderSizes(["UK 10", "UK 11", "UK 5", "UK 9"]), ["UK 5", "UK 9", "UK 10", "UK 11"]);
  assert.deepEqual(orderSizes(["34", "28", "32"]), ["28", "32", "34"]);
  assert.deepEqual(orderSizes(["One size"]), ["One size"]);
});

test("the garment size chart renders in that order", () => {
  const chart = sizeChart(products.find((p) => p.id === "VLR-3001"));
  assert.deepEqual(chart.rows.map((row) => row[0]), ["XS", "S", "M", "L", "XL"]);
});

// --- waist-sized bottoms were scored against a letter body chart ------------

test("a waist-sized chart is scored as a bottom, not against letter sizes", () => {
  const denim = products.find((p) => p.id === "VLR-2003");
  assert.equal(denim.subcategory, "Trousers & Denim");
  assert.deepEqual(orderSizes(denim.sizes), ["26", "28", "30", "32", "34"]);

  const spec = garmentSpec(denim, "30");
  assert.equal(spec.type, "bottom");
  assert.equal(spec.waistIn, 30);
});

test("the same trouser gives different sizes to different bodies", () => {
  const denim = products.find((p) => p.id === "VLR-2003");
  const demo = recommend(denim, estimateBody(DEMO_PROFILE), "regular");
  const small = recommend(denim, estimateBody({ height: 165, weight: 55, shape: "Balanced" }), "regular");

  assert.equal(demo.size, "34");
  assert.equal(small.size, "26");
  // Every candidate must not share one identical score (the old bug).
  assert.ok(new Set(demo.ranked.map((r) => r.score)).size > 1);
});

// --- per-subcategory cuts ---------------------------------------------------

test("the same label is cut differently per subcategory", () => {
  const shirt = { ...KURTA, subcategory: "Shirts" };
  const kurta = { ...KURTA, subcategory: "Kurta Sets" };
  const coat = { ...KURTA, subcategory: "Outerwear" };

  // Shirts are trimmer than the base chart, kurtas easier, outerwear fullest.
  assert.equal(garmentSpec(shirt, "M").chestIn, 46);
  assert.equal(garmentSpec(kurta, "M").chestIn, 47.5);
  assert.equal(garmentSpec(coat, "M").chestIn, 48.5);
});

test("a medium body no longer receives one letter for the whole catalogue", () => {
  const medium = estimateBody({ height: 170, weight: 68, shape: "Balanced" });
  const trimmedShirt = products.find((p) => p.id === "VLR-1001"); // Shirts, regular
  const easyKurta = products.find((p) => p.id === "VLR-3001"); // Kurta Sets, relaxed
  const dress = products.find((p) => p.id === "VLR-2002"); // Dresses, regular

  const picks = [trimmedShirt, easyKurta, dress].map((p) => recommend(p, medium, "regular").size);
  assert.equal(picks[0], "L");
  assert.equal(picks[1], "M");
  assert.equal(picks[2], "M");
  assert.ok(new Set(picks).size > 1, "the same body must not get one size everywhere");
});

// --- footwear is no longer pinned to one UK size for everyone ---------------

test("foot length follows height when no shoe size is known", () => {
  assert.equal(estimateFootLength({ height: 160, usualSize: "M" }), 24.3);
  assert.equal(estimateFootLength({ height: 190, usualSize: "M" }), 28.9);
});

test("footwear recommendations differ between shoppers", () => {
  const sneaker = products.find((p) => p.id === "VLR-1013");
  const short = recommend(sneaker, { chest: 90, waist: 74, hip: 96, footLengthCm: estimateFootLength({ height: 160 }) }, "regular");
  const tall = recommend(sneaker, { chest: 108, waist: 92, hip: 106, footLengthCm: estimateFootLength({ height: 190 }) }, "regular");

  assert.equal(short.size, "UK 7");
  assert.equal(tall.size, "UK 11");
});
