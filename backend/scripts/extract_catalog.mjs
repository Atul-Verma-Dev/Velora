import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = scriptDir + "/../..";
const catalogPath = projectRoot + "/frontend/src/data/catalog.js";
const outPath = scriptDir + "/catalog-extract.json";

const src = readFileSync(catalogPath, "utf8");

// Extract all top-level `const NAME = ...;` definitions using bracket matching for arrays.
// This handles semicolons inside string values correctly.
const defs = {};
const constRe = /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
let match;
while ((match = constRe.exec(src)) !== null) {
  const name = match[1];
  const start = match.index + match[0].length - 1; // position of '=' ... actually we need the value start

  // Find the actual start of the value (after '=' and whitespace)
  let valStart = match.index + match[0].length;
  while (valStart < src.length && (src[valStart] === ' ' || src[valStart] === '\t' || src[valStart] === '\n')) {
    valStart++;
  }

  const firstChar = src[valStart];
  let end;

  if (firstChar === '[' || firstChar === '{') {
    // Bracket-matched array or object
    let depth = 0;
    let inStr = null;
    let i = valStart;
    while (i < src.length) {
      const ch = src[i];
      if (inStr) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === inStr) inStr = null;
      } else {
        if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
        else if (ch === '[' || ch === '{') depth++;
        else if (ch === ']' || ch === '}') {
          depth--;
          if (depth === 0) { end = i + 1; break; }
        }
      }
      i++;
    }
  } else {
    // Simple value (string, number, boolean) - find end of line
    const semi = src.indexOf(';', valStart);
    const nl = src.indexOf('\n', valStart);
    end = Math.min(semi !== -1 ? semi : src.length, nl !== -1 ? nl : src.length);
  }

  if (end === undefined) continue;

  const valueText = src.slice(valStart, end).replace(/;+\s*$/, '').trim();

  // Resolve references to previously defined array variables.
  let resolved = valueText;
  for (const [prevName, prevValue] of Object.entries(defs)) {
    if (Array.isArray(prevValue)) {
      resolved = resolved.replace(new RegExp(`\\b${prevName}\\b`, 'g'), JSON.stringify(prevValue));
    }
  }

  try {
    defs[name] = eval(`(${resolved})`);
  } catch (e) {
    // Skip definitions that can't be evaluated.
  }
}

const result = {
  sellers: defs.sellers || [],
  categories: defs.categories || [],
  raw: defs.raw || [],
};

writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(
  `Extracted ${result.sellers.length} sellers, ${result.categories.length} categories, ${result.raw.length} products`
);
