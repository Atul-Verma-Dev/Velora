// ---------------------------------------------------------------------------
// Velora discovery engine — DEMO IMPLEMENTATION
//
// This preserves the product's dual-thread architecture in the browser:
//   Thread A  language + constraint interpretation (structured intent).
//   Thread B  independent visual analysis of the reference image (palette,
//             tone and detail signals computed on-device with a canvas).
// The two are reconciled with deterministic merge logic: explicit text wins
// over conflicting image-derived attributes, exclusions stay hard exclusions,
// and hard catalogue filters run before any relevance ranking.
//
// No model API is called. Ranking is a local, deterministic approximation, and
// the UI says so. A production build would replace threadA/threadB with model
// service calls while keeping the merge and retrieval contracts below.
// ---------------------------------------------------------------------------

export const GARMENT_MAP = {
  kurta: { category: "Ethnic Wear", subcategory: "Kurta Sets" },
  kurti: { category: "Ethnic Wear", subcategory: "Kurta Sets" },
  saree: { category: "Ethnic Wear", subcategory: "Sarees" },
  sari: { category: "Ethnic Wear", subcategory: "Sarees" },
  lehenga: { category: "Ethnic Wear", subcategory: "Lehengas" },
  anarkali: { category: "Ethnic Wear", subcategory: "Anarkalis" },
  sharara: { category: "Ethnic Wear", subcategory: "Kurta Sets" },
  dupatta: { category: "Accessories", subcategory: "Dupattas" },
  dress: { category: "Western Wear", subcategory: "Dresses" },
  gown: { category: "Western Wear", subcategory: "Dresses" },
  shirt: { category: "Western Wear", subcategory: "Shirts" },
  "t-shirt": { category: "Western Wear", subcategory: "Tops & Shirts" },
  tee: { category: "Western Wear", subcategory: "Tops & Shirts" },
  top: { category: "Western Wear", subcategory: "Tops & Shirts" },
  blouse: { category: "Western Wear", subcategory: "Tops & Shirts" },
  trouser: { category: "Western Wear", subcategory: "Trousers" },
  trousers: { category: "Western Wear", subcategory: "Trousers" },
  pants: { category: "Western Wear", subcategory: "Trousers" },
  chino: { category: "Western Wear", subcategory: "Trousers" },
  jeans: { category: "Western Wear", subcategory: "Denim" },
  denim: { category: "Western Wear", subcategory: "Denim" },
  blazer: { category: "Western Wear", subcategory: "Outerwear" },
  jacket: { category: "Western Wear", subcategory: "Outerwear" },
  coat: { category: "Western Wear", subcategory: "Outerwear" },
  overcoat: { category: "Western Wear", subcategory: "Outerwear" },
  cardigan: { category: "Western Wear", subcategory: "Knitwear" },
  sweater: { category: "Western Wear", subcategory: "Knitwear" },
  knit: { category: "Western Wear", subcategory: "Knitwear" },
  hoodie: { category: "Western Wear", subcategory: "Knitwear" },
  "co-ord": { category: "Western Wear", subcategory: "Co-ords" },
  coord: { category: "Western Wear", subcategory: "Co-ords" },
  loafers: { category: "Footwear", subcategory: "Loafers" },
  loafer: { category: "Footwear", subcategory: "Loafers" },
  derby: { category: "Footwear", subcategory: "Derbies" },
  shoes: { category: "Footwear" },
  sneakers: { category: "Footwear", subcategory: "Sneakers" },
  sneaker: { category: "Footwear", subcategory: "Sneakers" },
  footwear: { category: "Footwear" },
  watch: { category: "Accessories", subcategory: "Watches" },
  bag: { category: "Accessories", subcategory: "Bags" },
  tote: { category: "Accessories", subcategory: "Bags" },
  earrings: { category: "Accessories", subcategory: "Jewellery" },
  jewellery: { category: "Accessories", subcategory: "Jewellery" },
  jewelry: { category: "Accessories", subcategory: "Jewellery" },
  cap: { category: "Accessories", subcategory: "Caps & Scarves" },
  scarf: { category: "Accessories", subcategory: "Caps & Scarves" },
  muffler: { category: "Accessories", subcategory: "Caps & Scarves" },
};

export const COLOURS = [
  ["marigold", "Yellow"], ["mustard", "Yellow"], ["yellow", "Yellow"], ["haldi", "Yellow"],
  ["sage", "Green"], ["olive", "Green"], ["green", "Green"], ["emerald", "Green"],
  ["ivory", "Ivory"], ["cream", "Ivory"], ["ecru", "Ivory"], ["off-white", "Ivory"], ["white", "White"],
  ["indigo", "Blue"], ["navy", "Blue"], ["blue", "Blue"], ["firozi", "Blue"], ["cobalt", "Blue"], ["teal", "Blue"],
  ["rani", "Pink"], ["pink", "Pink"], ["rose", "Pink"], ["fuchsia", "Pink"], ["magenta", "Pink"],
  ["terracotta", "Rust"], ["rust", "Rust"], ["burnt", "Rust"], ["orange", "Rust"], ["coral", "Rust"],
  ["black", "Black"], ["noir", "Black"],
  ["grey", "Grey"], ["gray", "Grey"], ["charcoal", "Grey"],
  ["beige", "Beige"], ["sand", "Beige"], ["camel", "Beige"], ["tan", "Brown"], ["brown", "Brown"], ["espresso", "Brown"],
  ["gold", "Gold"], ["champagne", "Gold"], ["silver", "Silver"],
];

export const OCCASIONS = [
  ["wedding", "Wedding"], ["shaadi", "Wedding"], ["reception", "Wedding"], ["sangeet", "Wedding"],
  ["haldi", "Haldi"], ["mehendi", "Mehendi"], ["mehndi", "Mehendi"],
  ["festive", "Festive"], ["diwali", "Festive"], ["puja", "Festive"], ["eid", "Festive"],
  ["party", "Party"], ["cocktail", "Party"], ["evening", "Party"],
  ["work", "Workwear"], ["office", "Workwear"], ["workwear", "Workwear"], ["formal", "Workwear"],
  ["everyday", "Everyday"], ["casual", "Everyday"], ["daily", "Everyday"], ["college", "Everyday"],
  ["travel", "Travel"], ["vacation", "Travel"], ["resort", "Travel"],
];

const FABRICS = [
  ["cotton", "cotton"], ["linen", "linen"], ["silk", "silk"], ["chanderi", "chanderi"],
  ["organza", "organza"], ["georgette", "georgette"], ["wool", "wool"], ["merino", "merino"],
  ["denim", "denim"], ["chikankari", "chikankari"], ["khadi", "khadi"], ["handloom", "handloom"],
  ["rayon", "rayon"], ["satin", "satin"], ["crepe", "crepe"],
];

const FITS = [
  ["relaxed", "Relaxed"], ["loose", "Relaxed"], ["oversized", "Oversized"],
  ["slim", "Slim"], ["fitted", "Slim"], ["straight", "Straight"],
  ["flared", "Flared"], ["a-line", "Flared"], ["regular", "Regular"],
];

const STOP = new Set([
  "a", "an", "the", "for", "with", "and", "or", "in", "on", "to", "of", "my", "me",
  "i", "want", "looking", "look", "find", "something", "some", "please", "that",
  "this", "is", "under", "below", "less", "than", "upto", "up", "about", "around",
  "occasion", "wear", "wearing", "outfit", "outfits", "piece", "pieces", "style",
  "similar", "like", "picture", "image", "photo", "reference", "relaxed-looking",
]);

// Price phrases need their digits and ₹ intact ("under ₹2,000"), so they get their own cleanup.
const priceText = (s) => s.toLowerCase().replace(/(\d),(?=\d)/g, "$1").replace(/₹/g, " ₹ ").replace(/\s+/g, " ").trim();
const normalise = (s) => s.toLowerCase().replace(/[₹,]/g, " ").replace(/\s+/g, " ").trim();

function parsePrice(text) {
  let max = null;
  let min = null;
  const money = (raw) => {
    const cleaned = raw.replace(/,/g, "");
    if (/k$/i.test(cleaned)) return Math.round(parseFloat(cleaned) * 1000);
    return Math.round(parseFloat(cleaned));
  };
  const maxRe = /(?:under|below|less than|upto|up to|within|budget of|max(?:imum)?|₹|\brs\.?|inr)\s*([\d.]+)\s*(k)?/gi;
  let m;
  while ((m = maxRe.exec(text))) {
    const val = money(m[1] + (m[2] || ""));
    if (val >= 100 && val <= 100000) max = max === null ? val : Math.min(max, val);
  }
  const minRe = /(?:over|above|more than|min(?:imum)?|from)\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k)?/gi;
  while ((m = minRe.exec(text))) {
    const val = money(m[1] + (m[2] || ""));
    if (val >= 100) min = val;
  }
  return { max, min };
}

function detectExclusions(text) {
  const colours = new Set();
  const terms = [];
  const re = /(?:not|no|without|avoid|except|exclude|excluding)\s+([a-z-]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    const word = m[1];
    const hit = COLOURS.find(([w]) => w === word);
    if (hit) colours.add(hit[1]);
    else if (!STOP.has(word)) terms.push(word);
  }
  return { colours: [...colours], terms };
}

// ---------------------------------------------------------------------------
// THREAD A — structured language interpretation.
// ---------------------------------------------------------------------------
export function threadA(text = "", imageHint = null) {
  const t = normalise(text);
  const { max, min } = parsePrice(priceText(text));
  const exclusions = detectExclusions(t);

  const garment = Object.keys(GARMENT_MAP).find((k) => new RegExp(`\\b${k}\\b`).test(t));
  const garmentInfo = garment ? GARMENT_MAP[garment] : null;

  const colours = [...new Set(COLOURS.filter(([w]) => new RegExp(`\\b${w}\\b`).test(t)).map(([, c]) => c))].filter(
    (c) => !exclusions.colours.includes(c)
  );

  const occasions = [...new Set(OCCASIONS.filter(([w]) => new RegExp(`\\b${w}`).test(t)).map(([, o]) => o))];
  const fabrics = [...new Set(FABRICS.filter(([w]) => new RegExp(`\\b${w}`).test(t)).map(([, f]) => f))];
  const fits = [...new Set(FITS.filter(([w]) => new RegExp(`\\b${w}`).test(t)).map(([, f]) => f))];

  let gender = null;
  if (/\b(women|woman|womens|female|her|ladies)\b/.test(t)) gender = "Women";
  else if (/\b(men|man|mens|male|him|gents)\b/.test(t)) gender = "Men";
  else if (/\bunisex\b/.test(t)) gender = "Unisex";

  const keywords = t
    .split(/[^a-z0-9-]+/)
    .filter((w) => w && !STOP.has(w) && w.length > 1)
    .filter((w) => !/^\d+$/.test(w));

  // Explicit text always beats image-derived attributes in the merge below.
  return {
    query: text,
    maxPrice: max,
    minPrice: min,
    category: garmentInfo?.category || null,
    subcategory: garmentInfo?.subcategory || null,
    gender,
    colours,
    exclusions,
    occasions,
    fabrics,
    fits,
    keywords,
    isEmpty: !text.trim() && !imageHint,
    caption:
      imageHint && !text.trim()
        ? "Products matching the reference palette, tone and silhouette signals."
        : text.trim(),
  };
}

// ---------------------------------------------------------------------------
// THREAD B — independent visual analysis of the uploaded reference.
// Uses a small canvas sample. Returns palette + tone + detail signals; it does
// not produce an embedding. The UI labels it as an on-device approximation.
// ---------------------------------------------------------------------------
export function threadB(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!/^image\//.test(file.type)) return reject(new Error("That file is not an image."));
    if (file.size > 8 * 1024 * 1024) return reject(new Error("Please use an image under 8 MB."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const buckets = new Map();
        let rSum = 0, gSum = 0, bSum = 0, satSum = 0, lightSum = 0, edge = 0, n = 0;
        let prev = null;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const l = (max + min) / 2 / 255;
          const s = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
          rSum += r; gSum += g; bSum += b; satSum += s; lightSum += l;
          if (prev) {
            edge += Math.abs(r - prev[0]) + Math.abs(g - prev[1]) + Math.abs(b - prev[2]);
          }
          prev = [r, g, b];
          const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`;
          const cur = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
          cur.r += r; cur.g += g; cur.b += b; cur.count += 1;
          buckets.set(key, cur);
          n++;
        }
        const palette = [...buckets.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map((c) => {
            const r = Math.round(c.r / c.count);
            const g = Math.round(c.g / c.count);
            const b = Math.round(c.b / c.count);
            return {
              r, g, b,
              hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
              share: Math.round((c.count / n) * 100),
              family: nearestFamily(r, g, b),
            };
          });
        const saturation = satSum / n;
        const brightness = lightSum / n;
        const detail = Math.min(1, edge / (n * 60));
        const families = [...new Set(palette.map((c) => c.family))].filter(Boolean);
        resolve({
          palette,
          families,
          saturation: Math.round(saturation * 100) / 100,
          brightness: Math.round(brightness * 100) / 100,
          detail: Math.round(detail * 100) / 100,
          tone: brightness > 0.68 ? "Light" : brightness < 0.35 ? "Deep" : "Mid",
          patternHint: detail > 0.55 ? "Patterned or textured" : "Solid or softly textured",
          previewUrl: url,
          fileName: file.name,
        });
      } catch {
        reject(new Error("We couldn't read that image. Try a JPG or PNG."));
      }
    };
    img.onerror = () => reject(new Error("That image could not be opened. Try another file."));
    img.src = url;
  });
}

const FAMILY_HEX = {
  Yellow: [233, 190, 80], Green: [140, 160, 120], Ivory: [233, 226, 210], White: [242, 240, 235],
  Blue: [70, 100, 145], Pink: [200, 140, 150], Rust: [180, 105, 75], Black: [45, 45, 48],
  Grey: [140, 142, 140], Beige: [200, 185, 160], Brown: [130, 95, 65], Gold: [200, 168, 100],
  Silver: [180, 183, 188],
};

function nearestFamily(r, g, b) {
  let best = null;
  let bestDist = Infinity;
  Object.entries(FAMILY_HEX).forEach(([family, [fr, fg, fb]]) => {
    const d = (r - fr) ** 2 + (g - fg) ** 2 + (b - fb) ** 2;
    if (d < bestDist) { bestDist = d; best = family; }
  });
  return best;
}

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const colourDistance = (a, b) => {
  const [r1, g1, b1] = a;
  const [r2, g2, b2] = b;
  return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2) / 765;
};

// ---------------------------------------------------------------------------
// Deterministic merge: text / explicit filters win over image-derived values.
// ---------------------------------------------------------------------------
export function mergeIntent(textIntent, visual, overrides = {}) {
  // An override of null / [] is a deliberate "remove this" from the shopper's editable chips,
  // so only undefined falls back to what Thread A extracted.
  const merged = { ...textIntent, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) };
  if (visual) {
    merged.visualFamilies = visual.families;
    merged.visualTone = visual.tone;
    merged.visualDetail = visual.detail;
    if (!merged.colours?.length && overrides.colours === undefined && !merged.exclusions?.colours?.length) {
      merged.colours = visual.families.slice(0, 2);
      merged.coloursFromImage = true;
    }
  }
  merged.weights = visual ? { text: 0.4, image: 0.6 } : { text: 1, image: 0 };
  return merged;
}

export function textScore(product, intent) {
  const haystack = [
    product.name, product.brand, product.category, product.subcategory,
    product.color, product.colorFamily, product.fabric, product.pattern,
    product.fit, product.length, product.description, product.gender,
    ...(product.occasion || []), ...(product.tags || []),
  ].join(" ").toLowerCase();

  let score = 0;
  let signals = [];

  if (intent.category && product.category === intent.category) { score += 3.2; signals.push(product.category); }
  if (intent.subcategory && product.subcategory === intent.subcategory) { score += 3.6; signals.push(product.subcategory); }
  if (intent.gender && (product.gender === intent.gender)) score += 1.6;

  const colourMatches = (intent.colours || []).filter(
    (c) => product.colorFamily === c || product.color.toLowerCase().includes(c.toLowerCase())
  );
  if (colourMatches.length) { score += 2.2 * colourMatches.length; signals.push(`${colourMatches.join(", ")} palette`); }

  const occMatches = (intent.occasions || []).filter((o) => product.occasion.includes(o));
  if (occMatches.length) { score += 1.9 * occMatches.length; signals.push(occMatches.join(", ")); }

  const fabricMatches = (intent.fabrics || []).filter((f) => product.fabric.toLowerCase().includes(f));
  if (fabricMatches.length) { score += 1.7 * fabricMatches.length; signals.push(fabricMatches.join(", ")); }

  const fitMatches = (intent.fits || []).filter((f) => product.fit.toLowerCase().includes(f.toLowerCase()) || product.fitEase === f.toLowerCase());
  if (fitMatches.length) { score += 1.2; signals.push(`${fitMatches[0]} fit`); }

  const tokens = [...new Set(intent.keywords || [])];
  let tokenHits = 0;
  tokens.forEach((token) => {
    if (token.length < 3) return;
    if (haystack.includes(token)) { tokenHits += 1; }
    else if (token.length > 4 && haystack.includes(token.slice(0, token.length - 1))) { tokenHits += 0.5; }
  });
  score += tokenHits * 1.1;

  // Slight quality prior so equally-matching products surface the better ones.
  score += (product.rating - 4) * 0.5;
  score += Math.min(0.4, product.unitsSold30d / 100);

  return { score, signals: [...new Set(signals)].slice(0, 4) };
}

export function visualScore(product, intent, visual) {
  if (!visual) return { score: 0, signals: [] };
  const productRgb = hexToRgb(product.colorHex || "#cccccc");
  const distances = visual.palette.map((c) => colourDistance(productRgb, [c.r, c.g, c.b]));
  const closeness = 1 - Math.min(...distances);
  const familyHit = visual.families.includes(product.colorFamily) ? 0.2 : 0;
  const toneBonus =
    visual.tone === "Light" && ["Ivory", "White", "Beige"].includes(product.colorFamily) ? 0.08 :
    visual.tone === "Deep" && ["Black", "Blue", "Rust", "Brown"].includes(product.colorFamily) ? 0.08 : 0;
  return {
    score: Math.max(0, closeness + familyHit + toneBonus),
    signals: [familyHit ? `${product.colorFamily} palette` : "", visual.detail > 0.55 ? "texture match" : "solid tone"].filter(Boolean),
  };
}

export function hardFilter(products, intent) {
  const excluded = { price: 0, category: 0, stock: 0, colour: 0, status: 0 };
  const kept = [];
  products.forEach((p) => {
    if (p.status !== "live") { excluded.status += 1; return; }
    if (intent.maxPrice && p.price > intent.maxPrice) { excluded.price += 1; return; }
    if (intent.minPrice && p.price < intent.minPrice) { excluded.price += 1; return; }
    if (intent.category && p.category !== intent.category) { excluded.category += 1; return; }
    if (intent.subcategory && p.subcategory !== intent.subcategory) { excluded.category += 1; return; }
    if (intent.exclusions?.colours?.includes(p.colorFamily)) { excluded.colour += 1; return; }
    if (p.stock <= 0) { excluded.stock += 1; return; }
    kept.push(p);
  });
  return { kept, excluded };
}

export function search(products, { query, visual, overrides }) {
  const intent = mergeIntent(threadA(query, visual), visual, overrides);
  const { kept, excluded } = hardFilter(products, intent);
  const results = kept
    .map((p) => {
      const t = textScore(p, intent);
      const v = visualScore(p, intent, visual);
      const total = t.score * intent.weights.text + v.score * 8 * intent.weights.image;
      return {
        product: p,
        score: Math.round(total * 100) / 100,
        signals: [...new Set([...t.signals, ...v.signals])].slice(0, 3),
        colourFromImage: intent.coloursFromImage,
      };
    })
    .sort((a, b) => b.score - a.score);
  return {
    results,
    intent,
    excluded,
    weights: intent.weights,
    noResults: results.length === 0,
  };
}

export function explainIntent(intent) {
  const chips = [];
  if (intent.subcategory) chips.push({ key: "subcategory", label: intent.subcategory });
  else if (intent.category) chips.push({ key: "category", label: intent.category });
  if (intent.gender) chips.push({ key: "gender", label: intent.gender });
  (intent.colours || []).forEach((c) => chips.push({ key: `colour:${c}`, label: c }));
  (intent.occasions || []).forEach((o) => chips.push({ key: `occasion:${o}`, label: o }));
  (intent.fabrics || []).forEach((f) => chips.push({ key: `fabric:${f}`, label: f }));
  (intent.fits || []).forEach((f) => chips.push({ key: `fit:${f}`, label: `${f} fit` }));
  if (intent.maxPrice) chips.push({ key: "maxPrice", label: `Under ${intent.maxPrice}` });
  if (intent.minPrice) chips.push({ key: "minPrice", label: `Over ${intent.minPrice}` });
  (intent.exclusions?.colours || []).forEach((c) => chips.push({ key: `exclude:${c}`, label: `No ${c}` }));
  return chips;
}
