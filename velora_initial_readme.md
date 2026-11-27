# Velora — Fashion, Found Better.
**Unstop Buildathon • Nov 28-29 • Team Zeolite**

> **STATUS: INITIAL COMMIT (HOUR 0)** 🚀
> Repository initialized and architecture locked for the 48-hour sprint. 

---

## ⚡ The Defining Identity
Velora is not an e-commerce store. It is a **Zero-Return Checkout Engine**. 

It connects frontend buyer intent directly to backend seller logistics in under 1.2 seconds. It replaces the traditional, disconnected e-commerce experience with a surgical pipeline that solves the multi-billion dollar return crisis and dead-stock crisis simultaneously.

## 📐 The "Invisible Triad" Architecture
This repository will house the MVP of our 3-part algorithmic pipeline:

1. **Multimodal Vibe-to-Outfit Search (Discovery Layer):**
   - Dual-thread AI proxy running `gemini-3.5-flash-lite` (JSON constraints) and `gemini-embedding-2` (visual vectors) concurrently.
   - Hybrid `pgvector` retrieval (fusing hard SQL filters with cosine similarity).
2. **Zero-Latency Fit Predictor (Reverse-Logistics Killer):**
   - Two-tier input mapping user measurements to a Garment Ease & Stretch Matrix to guarantee fit before checkout.
3. **Inventory-Aware Stylist (Dead-Stock Bundler):**
   - A margin-protected algorithmic bundler. 
   - Strict 3-way intersection: Aesthetic Match (>0.78) + Verified Size Guarantee + Financial Need (>60 days in inventory).

## 🛠️ Buildathon Execution Plan (Current Sprint)
- [ ] **Phase 1: The Money Maker** - Dead-Stock Bundler logic + B2B Seller Studio dashboard (proving the unit economics).
- [ ] **Phase 2: The Reverse-Logistics Killer** - Anchor-Brand Fast Path fit calculation.
- [ ] **Phase 3: Accessibility & Support (Stretch)** - Voice-to-text search & fallback support widgets.

## 💻 Tech Stack
*   **Frontend UI:** Next.js, React, Tailwind, Framer Motion
*   **AI Inference:** Google GenAI (`gemini-3.5-flash-lite`, `gemini-embedding-2`)
*   **Database:** PostgreSQL + `pgvector`
*   **Computer Vision (Planned):** `@mediapipe/tasks-vision` (WASM)

---
*Built with discipline by Team Zeolite for the Unstop Buildathon.*