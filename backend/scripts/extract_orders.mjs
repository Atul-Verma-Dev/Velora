// Extract the demo orders from frontend/src/data/orders.js into JSON so the
// backend seed can insert them without duplicating the dataset.
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { seedOrders } from "../../frontend/src/data/orders.js";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const outPath = scriptDir + "orders-extract.json";

writeFileSync(outPath, JSON.stringify({ orders: seedOrders }, null, 2));
console.log(`Extracted ${seedOrders.length} demo orders to ${outPath}`);
