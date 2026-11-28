// Seeded demo reviews. Marked as demo data in the UI; every product rating on
// cards is the synthetic catalogue rating, while published review cards below
// are explicit demo content used to exercise the review and summary flows.

const r = (productId, id, name, rating, title, body, extra = {}) => ({
  id,
  productId,
  name,
  rating,
  title,
  body,
  date: extra.date || "12 Nov 2026",
  verified: extra.verified ?? true,
  status: extra.status || "approved",
  fit: extra.fit || "Just right",
  sizeWorn: extra.sizeWorn || "",
  helpful: extra.helpful ?? 0,
  photo: extra.photo || "",
  flagged: extra.flagged || false,
  flagReason: extra.flagReason || "",
  response: extra.response || "",
});

export const seedReviews = {
  "VLR-1001": [
    r("VLR-1001", "rv-101", "Ananya S.", 5, "The shirt I keep reaching for", "The cotton is substantial without feeling stiff, and the collar holds its shape all day. I've washed it four times and it has only got softer.", { date: "18 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 24 }),
    r("VLR-1001", "rv-102", "Rhea M.", 4, "Great, but roomy", "Lovely finish and a proper long length. I have narrow shoulders so the M felt a little generous; the S would have been my pick.", { date: "12 Nov 2026", sizeWorn: "M", fit: "Slightly loose", helpful: 11 }),
    r("VLR-1001", "rv-103", "Kabir V.", 5, "Wears like a much pricier shirt", "Stitching is clean, the buttons are real corozo and the fabric breathes in Mumbai heat. Ordered a second in white.", { date: "04 Nov 2026", sizeWorn: "L", fit: "Just right", helpful: 17 }),
    r("VLR-1001", "rv-104", "Dev P.", 4, "Sleeves run long", "Good shirt overall. I'm 172 cm and the sleeve needed a small turn-up, which is fine but worth knowing.", { date: "29 Oct 2026", sizeWorn: "S", fit: "Just right", helpful: 6 }),
    r("VLR-1001", "rv-105", "Meher T.", 5, "Exactly the ecru I wanted", "Not yellow, not pink — a proper warm ecru. Colour was accurate to the photos.", { date: "21 Oct 2026", sizeWorn: "M", fit: "Just right", helpful: 9 }),
  ],
  "VLR-2002": [
    r("VLR-2002", "rv-201", "Ishita K.", 5, "Beautiful drape", "Wore this to a friend's reception and got asked where it was from all evening. The cupro falls beautifully and does not cling.", { date: "19 Nov 2026", sizeWorn: "S", fit: "Just right", helpful: 31 }),
    r("VLR-2002", "rv-202", "Naina R.", 4, "Size up if you're between", "I'm usually an M and took the L for a less body-hugging line. The rust is slightly deeper than the picture.", { date: "14 Nov 2026", sizeWorn: "L", fit: "Slightly tight", helpful: 18 }),
    r("VLR-2002", "rv-203", "Tara B.", 3, "Lovely but delicate", "Gorgeous dress, but the bias seam at the hip needs careful handling. Hand wash only is a commitment.", { date: "09 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 12 }),
    r("VLR-2002", "rv-204", "Priya N.", 5, "Worth it", "The cowl sits properly and the back is elegant without being fussy. Dressy enough for an evening, simple enough for dinner.", { date: "02 Nov 2026", sizeWorn: "S", fit: "Just right", helpful: 7 }),
  ],
  "VLR-3001": [
    r("VLR-3001", "rv-301", "Sneha J.", 5, "Perfect for a daytime haldi", "The marigold is warm, not neon, and the block print is crisp. I wore it with the matching dupatta and it photographed beautifully.", { date: "20 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 42, photo: "/images/aranya-marigold-dupatta.jpg" }),
    r("VLR-3001", "rv-302", "Aditi G.", 5, "Fabric is lovely in heat", "Breathable cotton, no lining needed. The side slits are deep enough to move comfortably.", { date: "16 Nov 2026", sizeWorn: "L", fit: "Just right", helpful: 19 }),
    r("VLR-3001", "rv-303", "Farah A.", 4, "Colour bleeds a little", "First wash released some dye even in cold water, as expected with hand block. Wash separately and it is fine.", { date: "11 Nov 2026", sizeWorn: "S", fit: "Just right", helpful: 15 }),
    r("VLR-3001", "rv-304", "Kavya S.", 4, "Runs slightly narrow at the shoulder", "I'm a 38 bust and the M fits well through the body, but the shoulder seam sits a touch in.", { date: "07 Nov 2026", sizeWorn: "M", fit: "Slightly tight", helpful: 8 }),
    r("VLR-3001", "rv-305", "Ritu M.", 5, "Handloom authenticity", "You can feel the difference in the cotton. Small irregularities in the print are part of the charm.", { date: "01 Nov 2026", sizeWorn: "XL", fit: "Just right", helpful: 11 }),
    r("VLR-3001", "rv-306", "Nandini P.", 5, "Bought two", "One for me, one for my mother. Both fit true to the size chart.", { date: "26 Oct 2026", sizeWorn: "L", fit: "Just right", helpful: 5 }),
  ],
  "VLR-1008": [
    r("VLR-1008", "rv-401", "Arjun K.", 5, "Proper rigid denim", "Stiff at first, exactly as selvedge should be. After two weeks it has moulded nicely. The straight leg is not baggy.", { date: "17 Nov 2026", sizeWorn: "32", fit: "Just right", helpful: 28 }),
    r("VLR-1008", "rv-402", "Sameer D.", 4, "Waist runs true, length long", "At 175 cm the hem needed a cuff. Waist measurement matched the chart exactly.", { date: "10 Nov 2026", sizeWorn: "32", fit: "Just right", helpful: 13 }),
    r("VLR-1008", "rv-403", "Nikhil R.", 4, "Good value selvedge", "Honest 13.5 oz cloth and clean finishing. The button fly takes getting used to.", { date: "03 Nov 2026", sizeWorn: "34", fit: "Slightly tight", helpful: 9 }),
  ],
  "VLR-3005": [
    r("VLR-3005", "rv-501", "Meghna V.", 5, "So much movement", "The flare is generous without being costume-like. Chanderi catches the light beautifully in the evening.", { date: "15 Nov 2026", sizeWorn: "S", fit: "Just right", helpful: 22 }),
    r("VLR-3005", "rv-502", "Sara I.", 5, "Gota work is exquisite", "The detailing at the yoke is hand-finished. Came with a stitched churidar, which was a nice surprise.", { date: "08 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 16 }),
    r("VLR-3005", "rv-503", "Divya L.", 4, "Slightly long", "I'm 158 cm and had the hem taken up by 5 cm. Otherwise perfect.", { date: "31 Oct 2026", sizeWorn: "XS", fit: "Just right", helpful: 7 }),
  ],
  "VLR-3011": [
    r("VLR-3011", "rv-601", "Lakshmi N.", 5, "Heirloom quality", "The zari border is heavy and the pink is rich. My mother approved, which is the highest praise available.", { date: "13 Nov 2026", sizeWorn: "One size", fit: "Just right", helpful: 34 }),
    r("VLR-3011", "rv-602", "Anuradha S.", 4, "Blouse piece is generous", "Plenty of fabric for a tailored blouse. Saree is a little stiff initially but softens.", { date: "05 Nov 2026", sizeWorn: "One size", fit: "Just right", helpful: 12 }),
  ],
  "VLR-2001": [
    r("VLR-2001", "rv-701", "Pooja H.", 5, "The crisp white shirt", "Oversized without swamping me. I'm 165 cm and the S still has that borrowed-shirt feel.", { date: "18 Nov 2026", sizeWorn: "S", fit: "Slightly loose", helpful: 21 }),
    r("VLR-2001", "rv-702", "Ayesha F.", 4, "Slightly sheer", "Fine for work with a nude camisole. Worth knowing before you buy white.", { date: "09 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 14 }),
  ],
  "VLR-3006": [
    r("VLR-3006", "rv-801", "Ritika B.", 5, "Chikankari done properly", "The embroidery is dense and even. Cotton mul is sheer, so the set includes a lining camisole — thoughtful.", { date: "12 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 18 }),
    r("VLR-3006", "rv-802", "Shalini K.", 4, "Lovely, needs careful washing", "Hand wash only and it takes a while to dry. Worth the care.", { date: "06 Nov 2026", sizeWorn: "L", fit: "Just right", helpful: 6 }),
  ],
  "VLR-1004": [
    r("VLR-1004", "rv-901", "Vivek A.", 5, "No itch, no bulk", "Fine merino that works under a blazer. The charcoal is a true dark grey.", { date: "11 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 9 }),
    r("VLR-1004", "rv-902", "Rahul M.", 4, "Slim but not tight", "Sleeves are a good length for 178 cm. Hand wash is the only downside.", { date: "02 Nov 2026", sizeWorn: "L", fit: "Just right", helpful: 5 }),
  ],
  // Pending / flagged demo reviews for the operations queue.
  "VLR-2006": [
    r("VLR-2006", "rv-p01", "Guest User", 1, "Worst purchase", "Total scam, do not buy. Contact me on my personal number 98xxxxx for a better deal on the same set!!!", { date: "22 Nov 2026", verified: false, status: "pending", fit: "Very tight", flagReason: "Contains personal contact details and promotional link" }),
    r("VLR-2006", "rv-p02", "Neha D.", 4, "Shorts are short", "The shirt is perfect. The shorts are quite short on me at 170 cm, so I wear them with the shirt untucked.", { date: "21 Nov 2026", status: "pending", sizeWorn: "S", fit: "Just right" }),
  ],
  "VLR-3009": [
    r("VLR-3009", "rv-p03", "Anonymous", 1, "Fake", "This is not real gota work, it is plastic. Seller should be banned.", { date: "23 Nov 2026", status: "pending", verified: true, fit: "Just right", flagged: true, flagReason: "Seller reported: possible policy breach — claim needs verification" }),
  ],
  "VLR-4001": [
    r("VLR-4001", "rv-1101", "Aparna V.", 5, "The rosewater is spot on", "A muted, dusty rose rather than a bright pink. The zari stripe catches light without being loud, and the trousers are properly lined.", { date: "23 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 27 }),
    r("VLR-4001", "rv-1102", "Jaya K.", 4, "Lovely, dupatta is sheer", "Exactly as described. The dupatta is very sheer, so it is more styling piece than coverage. Kurta itself is beautifully finished.", { date: "21 Nov 2026", sizeWorn: "L", fit: "Just right", helpful: 12 }),
    r("VLR-4001", "rv-1103", "Mira S.", 5, "Wore it to a mehendi", "Comfortable through a long afternoon and the colour photographed well indoors. Would buy the sage version too.", { date: "19 Nov 2026", sizeWorn: "S", fit: "Slightly loose", helpful: 9 }),
  ],
  "VLR-4002": [
    r("VLR-4002", "rv-1201", "Ritika A.", 5, "Bridal-adjacent without the weight", "The gota edging is hand-finished and the sharara has real volume. I was worried about the length at 161 cm but it grazes the floor perfectly with flats.", { date: "22 Nov 2026", sizeWorn: "S", fit: "Just right", helpful: 34 }),
    r("VLR-4002", "rv-1202", "Noor F.", 4, "Made to order took 9 days", "Worth the wait. The set arrived with a stitched fall and a spare gota button, which I appreciated.", { date: "20 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 15 }),
    r("VLR-4002", "rv-1203", "Shreya M.", 4, "Ivory is warm, not stark", "Closer to a warm cream than paper white — much easier to wear. The kurta is a little long on the sleeve for me.", { date: "17 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 8 }),
  ],
  "VLR-4005": [
    r("VLR-4005", "rv-1301", "Tanvi R.", 5, "My most-worn summer set", "The linen has a proper washed hand and the terracotta does not fade after three washes. Shorts are a generous mid-thigh length.", { date: "24 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 19 }),
    r("VLR-4005", "rv-1302", "Ira D.", 4, "Shirt runs oversized", "I sized down for a cleaner line and it is still relaxed. Wrinkles, but that is linen.", { date: "18 Nov 2026", sizeWorn: "S", fit: "Slightly loose", helpful: 7 }),
  ],
  "VLR-4007": [
    r("VLR-4007", "rv-1401", "Devika N.", 5, "Proper tailoring", "The shoulder is soft but the line is clean, and the lining means it layers over a knit without catching. Worth the price.", { date: "23 Nov 2026", sizeWorn: "M", fit: "Just right", helpful: 22 }),
    r("VLR-4007", "rv-1402", "Anika P.", 4, "Sleeves need a small turn", "I am 158 cm and the sleeve covered my hands. Otherwise a genuinely good blazer — the charcoal is a true dark grey.", { date: "16 Nov 2026", sizeWorn: "S", fit: "Just right", helpful: 6 }),
    r("VLR-4007", "rv-1403", "Leela G.", 5, "Office to dinner", "Wore it over a slip dress for a work dinner. The pockets are real and the internal pocket fits a phone.", { date: "12 Nov 2026", sizeWorn: "L", fit: "Just right", helpful: 10 }),
  ],
  "VLR-4009": [
    r("VLR-4009", "rv-1501", "Sana Q.", 5, "Comfortable from day one", "No break-in period, and the gum sole is quiet on office floors. The cream is easy to keep clean with a damp cloth.", { date: "22 Nov 2026", sizeWorn: "UK 6", fit: "Just right", helpful: 17 }),
    r("VLR-4009", "rv-1502", "Pallavi J.", 4, "True to size, slightly narrow", "I have a wider foot and took a half size up. The leather is soft rather than stiff.", { date: "15 Nov 2026", sizeWorn: "UK 7", fit: "Slightly tight", helpful: 5 }),
  ],
};

export const reviewSummary = (reviews) => {
  const published = (reviews || []).filter((x) => x.status === "approved");
  if (published.length < 3) return null;
  const avg = published.reduce((s, x) => s + x.rating, 0) / published.length;
  const fitCounts = published.reduce((acc, x) => {
    acc[x.fit] = (acc[x.fit] || 0) + 1;
    return acc;
  }, {});
  const fitTop = Object.entries(fitCounts).sort((a, b) => b[1] - a[1])[0];
  const praises = [];
  const concerns = [];
  const text = published.map((x) => `${x.title} ${x.body}`.toLowerCase()).join(" ");
  const themes = [
    ["fabric quality", /fabric|cotton|silk|merino|linen|cloth/],
    ["colour accuracy", /colour|color/],
    ["stitching and finish", /stitch|finish|seam|hem/],
    ["value for money", /price|worth|value/],
  ];
  themes.forEach(([label, re]) => {
    const count = published.filter((x) => re.test(`${x.title} ${x.body}`.toLowerCase())).length;
    if (count >= 2) praises.push({ label, count });
  });
  if (/tight|small|narrow|short sleeve/.test(text)) concerns.push("Some shoppers found the fit narrower than expected.");
  if (/long|hem|take up/.test(text)) concerns.push("A few reviews mention length that needed altering.");
  if (/sheer|bleed|delicate|hand wash/.test(text)) concerns.push("Care instructions matter: some fabrics are sheer or release dye initially.");
  return {
    count: published.length,
    average: Math.round(avg * 10) / 10,
    fit: fitTop ? `${fitTop[1]} of ${published.length} reviewers said the fit was ${fitTop[0].toLowerCase()}` : "",
    praises: praises.slice(0, 3),
    concerns,
    range: `${published[published.length - 1].date} – ${published[0].date}`,
  };
};
