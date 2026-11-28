// Fit intelligence — deterministic demo scoring.
//
// Fast Path estimates body dimensions from height/weight/shape + an anchor
// brand size, then compares them with the selected garment's size-specific
// finished measurements, its intended ease and fabric stretch. Precision Scan
// accepts shopper-entered measurements (no camera is ever opened automatically)
// and runs the same comparison. No accuracy percentage is claimed because none
// has been validated.

export const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];

const APPAREL_CHEST_IN = { XS: 33, S: 35, M: 37.5, L: 40, XL: 43, XXL: 46 };
const EASE_BANDS = {
  slim: { min: 1.5, max: 4.5, label: "close" },
  regular: { min: 4, max: 8, label: "regular" },
  relaxed: { min: 6, max: 12, label: "relaxed" },
  oversized: { min: 9, max: 17, label: "generous" },
};
const STRETCH_BONUS = { low: 0, medium: 1.5, high: 3 };

const isBottom = (p) =>
  ["Trousers", "Denim"].includes(p.subcategory) ||
  (!["Kurta Sets", "Co-ords", "Shirts", "Tops & Shirts", "Dresses", "Knitwear", "Outerwear", "Sarees", "Lehengas", "Anarkalis", "Dupattas"].includes(p.subcategory) &&
    /\b(trousers?|jeans?|shorts)\b/i.test(p.name));
const isFootwear = (p) => p.category === "Footwear";
const isAccessory = (p) =>
  ["Accessories"].includes(p.category) && !isFootwear(p);

export function garmentSpec(product, size) {
  if (isAccessory(product)) {
    return { type: "one-size", note: "One size — no garment fit calculation needed." };
  }
  if (isFootwear(product)) {
    const uk = parseFloat(String(size).replace(/[^\d.]/g, "")) || 8;
    return {
      type: "footwear",
      footLengthCm: Math.round((22.5 + (uk - 5) * 0.85) * 10) / 10,
      insoleWidthCm: 8.6,
      note: "Foot length is compared with the insole length of the selected size.",
    };
  }
  const stretch = product.stretch || "low";
  const band = EASE_BANDS[product.fitEase] || EASE_BANDS.regular;
  const stretchPad = STRETCH_BONUS[stretch] || 0;

  if (isBottom(product)) {
    const waist = parseFloat(size) || 32;
    return {
      type: "bottom",
      waistIn: waist,
      hipIn: waist + 7,
      riseIn: 11.5,
      inseamIn: /\bshorts\b/i.test(product.name) ? 7 : 30,
      thighIn: waist * 0.72,
      easeBand: band,
      stretch,
      stretchPad,
      note: `Intended ${band.label} fit at the waist; ${stretch} stretch fabric.`,
    };
  }

  const bodyChest = APPAREL_CHEST_IN[size] ?? 37.5;
  const easeTarget = product.fitEase === "slim" ? 2.5 : product.fitEase === "oversized" ? 12 : product.fitEase === "relaxed" ? 8 : 5.5;
  const ethnic = product.category === "Ethnic Wear";
  const chest = bodyChest + easeTarget + (ethnic ? 1.5 : 0);
  return {
    type: "apparel",
    chestIn: Math.round(chest * 10) / 10,
    waistIn: Math.round((chest - 4) * 10) / 10,
    hipIn: Math.round((chest - 1) * 10) / 10,
    shoulderIn: Math.round((bodyChest * 0.38 + 4) * 10) / 10,
    lengthIn: ethnic ? 44 : 29,
    easeBand: band,
    stretch,
    stretchPad,
    note: `Finished garment chest ${Math.round(chest)} in, designed for a ${band.label} fit.`,
  };
}

export function sizeChart(product) {
  if (isAccessory(product)) {
    return { headers: ["Size"], rows: [["One size — no fit variation"]], note: "One-size accessory." };
  }
  if (isFootwear(product)) {
    return {
      headers: ["Size", "Foot length", "Insole"],
      rows: product.sizes.map((s) => {
        const spec = garmentSpec(product, s);
        return [s, `${spec.footLengthCm} cm`, `${spec.footLengthCm + 0.4} cm`];
      }),
      note: "Measure your foot heel-to-toe in the evening. If between sizes, take the larger.",
    };
  }
  if (isBottom(product)) {
    return {
      headers: ["Size", "Waist", "Hip", "Inseam"],
      rows: product.sizes.map((s) => {
        const g = garmentSpec(product, s);
        return [s, `${g.waistIn} in`, `${g.hipIn} in`, `${g.inseamIn} in`];
      }),
      note: "Garment measurements, not body measurements. Compare with a trouser that fits you well.",
    };
  }
  return {
    headers: ["Size", "Chest", "Waist", "Hip", "Length"],
    rows: product.sizes.map((s) => {
      const g = garmentSpec(product, s);
      return [s, `${g.chestIn} in`, `${g.waistIn} in`, `${g.hipIn} in`, `${g.lengthIn} in`];
    }),
    note: "Finished garment measurements. The intended ease is already included.",
  };
}

export function estimateBody({ height, weight, shape }) {
  const h = Number(height) || 170;
  const w = Number(weight) || 68;
  const bmi = w / (h / 100) ** 2;
  const chest = Math.round((w * 0.95 + (h - 100) * 0.42 + (bmi - 21) * 1.2) * 10) / 10;
  let waist = Math.round((chest * 0.84 + (bmi - 21) * 1.6) * 10) / 10;
  let hip = Math.round((chest * 0.98 + 2) * 10) / 10;
  if (shape === "Triangle") hip += 5;
  if (shape === "Inverted triangle") hip -= 5;
  if (shape === "Oval") { waist += 4; hip += 2; }
  if (shape === "Hourglass") { waist -= 2; hip += 2; }
  return { chest, waist, hip, source: "estimate" };
}

export const toIn = (cm) => Math.round((cm / 2.54) * 10) / 10;

function zoneLabel(delta, band) {
  if (delta < band.min - 3) return { label: "Close", tone: "tight" };
  if (delta < band.min) return { label: "Slightly close", tone: "tight" };
  if (delta <= band.max) return { label: "Just right", tone: "ok" };
  if (delta <= band.max + 4) return { label: "Roomy", tone: "loose" };
  return { label: "Very roomy", tone: "loose" };
}

export function recommend(product, body, preference) {
  if (!body) return null;
  if (isAccessory(product)) {
    return {
      size: "One size",
      confidence: "Not applicable",
      zones: [],
      explanation: "This piece is one size, so garment fit does not vary.",
      ranked: [],
      demoSizes: true,
    };
  }

  const ranked = product.sizes.map((size, idx) => {
    const g = garmentSpec(product, size);
    if (g.type === "footwear") {
      const footLen = Number(body.footLengthCm) || 26;
      const delta = g.footLengthCm - footLen;
      const score = Math.abs(delta) * 10;
      return {
        size,
        delta,
        score,
        zones: [{ zone: "Insole length", fit: delta < 0.2 ? "Just right" : delta < 0.7 ? "Snug" : "Roomy", tone: "ok" }],
      };
    }
    const bodyChest = toIn(body.chest);
    const bodyWaist = toIn(body.waist);
    const bodyHip = toIn(body.hip);
    let zones;
    let score;
    // 'Close to the body' / 'Roomier than designed' move the target ease, so they genuinely change the pick.
    const shift = preference === "snug" ? -1.5 : preference === "loose" ? 1.5 : 0;
    if (g.type === "bottom") {
      const waistDelta = g.waistIn - bodyWaist;
      const hipDelta = g.hipIn - bodyHip;
      zones = [
        { zone: "Waist", fit: zoneLabel(waistDelta, g.easeBand).label, tone: zoneLabel(waistDelta, g.easeBand).tone },
        { zone: "Hip", fit: zoneLabel(hipDelta, g.easeBand).label, tone: zoneLabel(hipDelta, g.easeBand).tone },
      ];
      score = Math.abs(waistDelta - (0.5 + shift)) * 2 + Math.abs(hipDelta - (1.5 + shift));
    } else {
      const chestEase = g.chestIn - bodyChest;
      const waistDelta = g.waistIn - bodyWaist;
      const shoulderDelta = g.shoulderIn - toIn(body.chest) * 0.38;
      zones = [
        { zone: "Chest", fit: zoneLabel(chestEase, g.easeBand).label, tone: zoneLabel(chestEase, g.easeBand).tone },
        { zone: "Waist", fit: zoneLabel(waistDelta, g.easeBand).label, tone: zoneLabel(waistDelta, g.easeBand).tone },
        { zone: "Shoulder", fit: shoulderDelta < 0 ? "Snug" : shoulderDelta > 2.5 ? "Roomy" : "Just right", tone: shoulderDelta < 0 ? "tight" : "ok" },
      ];
      score = Math.abs(chestEase - ((g.easeBand.min + g.easeBand.max) / 2 + shift)) + Math.abs(waistDelta - (g.easeBand.min + shift)) * 0.5;
    }
    return { size, score, zones, ease: g };
  });

  ranked.sort((a, b) => a.score - b.score);
  const best = ranked[0];
  const second = ranked[1];
  const gap = second ? second.score - best.score : 2;
  const confidence = gap > 2.5 ? "Good match" : gap > 1 ? "Reasonable match" : "Close call";
  const band = best.ease?.easeBand;
  const tight = best.zones.some((z) => z.tone === "tight");
  const loose = best.zones.some((z) => z.tone === "loose");

  let explanation;
  if (isFootwear(product)) {
    explanation = `${best.size} matches your foot length most closely. If you are between sizes, take the larger.`;
  } else if (isBottom(product)) {
    explanation = `${best.size} sits closest to your estimated ${Math.round(toIn(body.waist))} in waist. ${
      tight ? "It may feel snug at first." : loose ? "Expect a roomier line through the hip." : "Expect the intended straight line."
    }`;
  } else {
    explanation = `${best.size} gives about ${Math.round(best.ease?.chestIn - toIn(body.chest))} in of chest ease — the garment is designed for a ${
      band?.label || "regular"
    } fit.${tight ? " The shoulder may feel close." : loose ? " It will sit generously through the body." : ""}`;
  }

  return {
    size: best.size,
    confidence,
    zones: best.zones,
    explanation,
    ranked: ranked.slice(0, 3),
    note: "Estimated from the inputs you provided and this garment's demo measurements. Actual fit varies with body proportions and how you like clothes to sit.",
  };
}

export function fitProfileFor(product, profile) {
  if (!profile) return null;
  const body =
    profile.mode === "precision" && profile.measurements
      ? {
          chest: Number(profile.measurements.chest) || 96,
          waist: Number(profile.measurements.waist) || 82,
          hip: Number(profile.measurements.hip) || 100,
          footLengthCm: Number(profile.measurements.footLengthCm) || 27,
          source: "measured",
        }
      : {
          ...estimateBody(profile),
          footLengthCm: (22.5 + ((parseFloat(String(profile.usualSize).replace(/[^\d.]/g, "")) || 8) - 5) * 0.85),
          source: "estimate",
        };
  return recommend(product, body, profile.fitPreference);
}
