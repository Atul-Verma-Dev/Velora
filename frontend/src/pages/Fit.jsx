import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle, ArrowRight, Camera, Check, Info, Lock, Ruler, ScanFace, ShieldCheck,
  Sparkles, Trash2, UserRound, Wand2,
} from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { estimateBody, fitProfileFor, garmentSpec, recommend, sizeChart, toIn } from "../lib/fit.js";
import { fitRecommend, backendEnabled as fitBackendEnabled } from "../lib/api/fit.js";
import { money } from "../lib/format.js";
import { Badge, Breadcrumbs, Btn, Field, InfoNote, PageHead, Progress } from "../components/ui.jsx";

const SHAPES = ["Balanced", "Triangle", "Inverted triangle", "Oval", "Hourglass"];
const BRANDS = ["Zara", "H&M", "Fabindia", "Westside", "Marks & Spencer", "Uniqlo", "Other"];
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

function ScanUpload({ label, step, url, onChange }) {
  return (
    <label className="scan-upload">
      {url ? (
        <img src={url} alt={`${label} reference`} />
      ) : (
        <>
          <span className="scan-step">{step}</span>
          <Camera size={20} />
          <b>{label}</b>
          <small>Choose a photo from your device</small>
        </>
      )}
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(URL.createObjectURL(f));
        }}
      />
    </label>
  );
}

export default function Fit() {
  const { fitProfile, setFitProfile, products, notify } = useApp();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get("mode") === "precision" ? "precision" : "fast");
  const [form, setForm] = useState(
    fitProfile || {
      height: "170", weight: "68", shape: "Balanced", anchorBrand: "Zara",
      usualSize: "M", fitPreference: "regular", measurements: { chest: "96", waist: "82", hip: "100", footLengthCm: "27" },
    }
  );
  const [photos, setPhotos] = useState({ front: "", side: "" });
  const [frontPreview, setFrontPreview] = useState("");
  const [sidePreview, setSidePreview] = useState("");
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(Boolean(fitProfile));
  const [backendFitLoading, setBackendFitLoading] = useState(false);
  const [backendFitError, setBackendFitError] = useState(null);
  const [backendFitResult, setBackendFitResult] = useState(null);
  const [productId, setProductId] = useState(
    products.find((p) => p.status === "live" && p.category !== "Accessories")?.id || ""
  );

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const updateMeasure = (k, v) => setForm((f) => ({ ...f, measurements: { ...f.measurements, [k]: v } }));

  const validate = () => {
    const e = {};
    if (mode === "fast") {
      if (!form.height || Number(form.height) < 120 || Number(form.height) > 220) e.height = "Enter a height between 120 and 220 cm.";
      if (!form.weight || Number(form.weight) < 30 || Number(form.weight) > 200) e.weight = "Enter a weight between 30 and 200 kg.";
    } else {
      if (!form.measurements.chest) e.chest = "Chest measurement is required.";
      if (!form.measurements.waist) e.waist = "Waist measurement is required.";
      if (!form.measurements.hip) e.hip = "Hip measurement is required.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    setFitProfile({ ...form, mode, updatedAt: new Date().toLocaleDateString("en-IN") });
    setSaved(true);
    notify("Fit profile saved to this browser");
  };

  const body = useMemo(() => {
    if (mode === "precision") {
      return {
        chest: Number(form.measurements.chest) || 96,
        waist: Number(form.measurements.waist) || 82,
        hip: Number(form.measurements.hip) || 100,
        footLengthCm: Number(form.measurements.footLengthCm) || 27,
        source: "measured",
      };
    }
    return { ...estimateBody(form), footLengthCm: 22.5 + ((parseInt(form.usualSize, 10) || 4) - 1) * 0.85, source: "estimate" };
  }, [form, mode]);

  // Map the local form shape to the backend FitProfileIn schema.
  const backendProfile = useMemo(() => ({
    height: Number(form.height) || 170,
    weight: Number(form.weight) || 68,
    shape: form.shape,
    anchor_brand: form.anchorBrand,
    usual_size: form.usualSize,
    fit_preference: form.fitPreference,
    mode,
    measurements: mode === "precision"
      ? {
          chest: Number(form.measurements.chest) || 96,
          waist: Number(form.measurements.waist) || 82,
          hip: Number(form.measurements.hip) || 100,
          footLengthCm: Number(form.measurements.footLengthCm) || 27,
        }
      : null,
  }), [form, mode]);

  const activeProduct = products.find((p) => p.id === productId);

  // Fetch a backend fit recommendation when backend mode is explicitly enabled.
  // Local calculation remains the default when the flag is off.
  useEffect(() => {
    if (!fitBackendEnabled() || !activeProduct) {
      setBackendFitResult(null);
      setBackendFitError(null);
      return;
    }
    let cancelled = false;
    setBackendFitLoading(true);
    setBackendFitError(null);
    fitRecommend(activeProduct.id, backendProfile)
      .then((data) => {
        if (!cancelled) {
          setBackendFitResult(data?.recommendation || null);
          setBackendFitLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBackendFitError(err.message);
          setBackendFitLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [fitBackendEnabled(), activeProduct, backendProfile]);
  const recommendation = backendFitResult
    ? backendFitResult
    : (activeProduct ? recommend(activeProduct, body, form.fitPreference) : null);

  return (
    <main id="main" className="page-shell fit-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Find your fit" }]} />
      <PageHead
        eyebrow="FIT CONFIDENCE"
        title={<>Know your fit.<br /><em>Before it arrives.</em></>}
        caption="Optional, private, and never required to shop. Fast Path takes about ten seconds. Precision Scan accepts measurements you enter yourself."
        action={fitProfile && (
          <div className="fit-saved-chip"><Check size={14} /> Profile saved · {fitProfile.updatedAt}</div>
        )}
      />

      <div className="fit-mode-switch">
        <button type="button" className={mode === "fast" ? "active" : ""} onClick={() => { setMode("fast"); setSaved(Boolean(fitProfile)); }}>
          <span className="mode-no">01</span>
          <span className="mode-copy"><b>Fast Path</b><small>Height, weight, shape and an anchor brand size. No camera.</small></span>
          <Badge tone="soft">Quick</Badge>
        </button>
        <button type="button" className={mode === "precision" ? "active" : ""} onClick={() => { setMode("precision"); setSaved(Boolean(fitProfile)); }}>
          <span className="mode-no">02</span>
          <span className="mode-copy"><b>Precision Scan</b><small>Measurements you enter, with optional photo references.</small></span>
          <Badge tone="light">Detailed</Badge>
        </button>
      </div>

      <div className="fit-layout">
        <section className="fit-form-card">
          {mode === "fast" ? (
            <>
              <div className="fit-card-title">
                <h2>Start with what you already know</h2>
                <p>A brand and size you trust is more useful than a tape measure for a first estimate.</p>
              </div>
              <div className="form-row">
                <Field label="Height (cm)" required error={errors.height}>
                  <input type="number" value={form.height} onChange={(e) => update("height", e.target.value)} inputMode="numeric" />
                </Field>
                <Field label="Weight (kg)" required error={errors.weight}>
                  <input type="number" value={form.weight} onChange={(e) => update("weight", e.target.value)} inputMode="numeric" />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Body shape" hint="Used to adjust waist and hip estimates, not to label you.">
                  <select value={form.shape} onChange={(e) => update("shape", e.target.value)}>
                    {SHAPES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Usual size">
                  <select value={form.usualSize} onChange={(e) => update("usualSize", e.target.value)}>
                    {SIZES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <div className="form-row">
                <Field label="Anchor brand" hint="A brand whose sizing you know well.">
                  <select value={form.anchorBrand} onChange={(e) => update("anchorBrand", e.target.value)}>
                    {BRANDS.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </Field>
                <Field label="How you like clothes to sit">
                  <select value={form.fitPreference} onChange={(e) => update("fitPreference", e.target.value)}>
                    <option value="snug">Close to the body</option>
                    <option value="regular">As designed</option>
                    <option value="loose">Roomier than designed</option>
                  </select>
                </Field>
              </div>
              <div className="fit-form-foot">
                <Btn variant="dark" onClick={save} icon={<Wand2 size={15} />}>Build my fit profile</Btn>
                <small><Lock size={12} /> Stored only in this browser. No account, no upload.</small>
              </div>
            </>
          ) : (
            <>
              <div className="fit-card-title">
                <h2>More detail, entered by you</h2>
                <p>This demo does not run pose estimation. Photos are optional previews kept in this tab; the estimate uses the measurements you type.</p>
              </div>
              <InfoNote tone="warning" icon={<ShieldCheck size={15} />} title="Privacy first">
                Camera access is never requested automatically. In this demo, photos are not uploaded, stored or analysed. Derived
                measurements are kept in this browser and can be deleted at any time.
              </InfoNote>
              <div className="scan-row">
                <ScanUpload label="Front reference" step="01" url={frontPreview} onChange={(u) => { setFrontPreview(u); setPhotos((p) => ({ ...p, front: u })); }} />
                <ScanUpload label="Side reference" step="02" url={sidePreview} onChange={(u) => { setSidePreview(u); setPhotos((p) => ({ ...p, side: u })); }} />
              </div>
              <div className="form-row">
                <Field label="Chest (cm)" required error={errors.chest} hint="Around the fullest point, tape level.">
                  <input type="number" value={form.measurements.chest} onChange={(e) => updateMeasure("chest", e.target.value)} />
                </Field>
                <Field label="Waist (cm)" required error={errors.waist} hint="At the narrowest point, without pulling in.">
                  <input type="number" value={form.measurements.waist} onChange={(e) => updateMeasure("waist", e.target.value)} />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Hip (cm)" required error={errors.hip}>
                  <input type="number" value={form.measurements.hip} onChange={(e) => updateMeasure("hip", e.target.value)} />
                </Field>
                <Field label="Foot length (cm)" hint="Heel to longest toe — used for footwear only.">
                  <input type="number" value={form.measurements.footLengthCm} onChange={(e) => updateMeasure("footLengthCm", e.target.value)} />
                </Field>
              </div>
              <div className="fit-form-foot">
                <Btn variant="dark" onClick={save} icon={<Wand2 size={15} />}>Use these measurements</Btn>
                <small><Lock size={12} /> You can delete this profile any time.</small>
              </div>
            </>
          )}
        </section>

        <aside className="fit-side">
          <span className="eyebrow">YOUR FIT PROFILE</span>
          <div className="body-summary">
            <div><span>Height</span><b>{form.height} cm</b></div>
            <div><span>Weight</span><b>{form.weight} kg</b></div>
            <div><span>Usual size</span><b>{form.usualSize}</b></div>
            <div><span>Anchor</span><b>{form.anchorBrand}</b></div>
            <div><span>Chest (est.)</span><b>{Math.round(toIn(body.chest))} in</b></div>
            <div><span>Waist (est.)</span><b>{Math.round(toIn(body.waist))} in</b></div>
            <div><span>Hip (est.)</span><b>{Math.round(toIn(body.hip))} in</b></div>
          </div>
          <div className="fit-confidence-note">
            <span className="eyebrow">CONFIDENCE</span>
            <Progress value={mode === "precision" ? 78 : 56} label={mode === "precision" ? "Measured inputs" : "Estimated inputs"} />
            <p>
              {mode === "precision"
                ? "Measured inputs are more specific, but still compared against demo garment dimensions."
                : "Fast Path is a starting point. Body proportions vary beyond height and weight, so treat the result as guidance."}
            </p>
          </div>
          {fitProfile && (
            <button type="button" className="danger-link" onClick={() => { setFitProfile(null); setSaved(false); notify("Fit profile deleted from this browser"); }}>
              <Trash2 size={13} /> Delete my fit profile
            </button>
          )}
          <InfoNote tone="soft" icon={<Info size={14} />} title="What this is not">
            Not a guarantee, not an accuracy claim and not a medical measurement. Velora has not validated an accuracy percentage for this demo.
          </InfoNote>
        </aside>
      </div>

      {saved && (
        <section className="fit-result-section">
          <div className="fit-result-head">
            <div>
              <span className="eyebrow">TRY IT ON THE CATALOGUE</span>
              <h2>Your suggested size, per garment.</h2>
              <p>Pick a piece to see how the selected size compares with your profile, zone by zone.</p>
            </div>
            <label className="field compact-field">
              <span className="field-label">Product</span>
              <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.filter((p) => p.status === "live").map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.brand}</option>
                ))}
              </select>
            </label>
          </div>

          {activeProduct && (
            <>
              {fitBackendEnabled() && backendFitLoading && (
                <div className="fit-reco">
                  <div className="fit-reco-main">
                    <img src={activeProduct.image} alt={activeProduct.name} />
                    <div>
                      <Link to={`/product/${activeProduct.id}`} className="text-link">{activeProduct.name} <ArrowRight size={13} /></Link>
                      <p className="reco-explanation">Fetching fit recommendation from the server…</p>
                    </div>
                  </div>
                </div>
              )}
              {fitBackendEnabled() && backendFitError && !backendFitLoading && (
                <div className="fit-reco">
                  <div className="fit-reco-main">
                    <img src={activeProduct.image} alt={activeProduct.name} />
                    <div>
                      <Link to={`/product/${activeProduct.id}`} className="text-link">{activeProduct.name} <ArrowRight size={13} /></Link>
                      <p className="reco-explanation is-error">Fit recommendation unavailable: {backendFitError}</p>
                    </div>
                  </div>
                </div>
              )}
              {(!fitBackendEnabled() || (!backendFitLoading && !backendFitError && backendFitResult)) && recommendation && (
                <div className="fit-reco">
                  <div className="fit-reco-main">
                    <img src={activeProduct.image} alt={activeProduct.name} />
                    <div>
                      <Link to={`/product/${activeProduct.id}`} className="text-link">{activeProduct.name} <ArrowRight size={13} /></Link>
                      <small>{activeProduct.category} · {activeProduct.fit} · {money(activeProduct.price)}</small>
                      <div className="reco-size">
                        <span>Suggested size</span>
                        <b>{recommendation.size}</b>
                        <Badge tone={recommendation.confidence === "Good match" ? "success" : recommendation.confidence === "Close call" ? "warning" : "soft"}>
                          {recommendation.confidence}
                        </Badge>
                      </div>
                      <p className="reco-explanation">{recommendation.explanation}</p>
                      <div className="fit-zones">
                        {recommendation.zones.map((z) => (
                          <span key={z.zone} className={`fit-zone tone-${z.tone}`}><small>{z.zone}</small><b>{z.fit}</b></span>
                        ))}
                      </div>
                      <div className="reco-actions">
                        <Btn to={`/product/${activeProduct.id}`} variant="dark" size="sm">View product</Btn>
                        <span>{activeProduct.sizes.map((s) => `${s}${s === recommendation.size ? " ✓" : ""}`).join(" · ")}</span>
                      </div>
                      <p className="fit-disclaimer"><AlertCircle size={12} /> {recommendation.note}</p>
                    </div>
                  </div>
                  <div className="fit-reco-chart">
                    <span className="eyebrow">GARMENT MEASUREMENTS</span>
                    <table className="data-table">
                      <thead><tr>{sizeChart(activeProduct).headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>
                        {sizeChart(activeProduct).rows.map((row, i) => (
                          <tr key={i} className={row[0] === recommendation.size ? "selected-row" : ""}>
                            {row.map((c, j) => <td key={j}>{c}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <small>{sizeChart(activeProduct).note}</small>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <section className="fit-explainer">
        <div>
          <span className="eyebrow">HOW THE SUGGESTION IS BUILT</span>
          <h2>Garment measurements, not just a label.</h2>
        </div>
        <div className="explainer-grid">
          <div><span>01</span><b>Your body, estimated</b><p>Height, weight, shape and an anchor size — or measurements you enter — give a body target.</p></div>
          <div><span>02</span><b>The garment, measured</b><p>Finished chest, waist and length for the exact size, plus its intended ease and fabric stretch.</p></div>
          <div><span>03</span><b>Ease compared, zone by zone</b><p>Each zone is compared with the silhouette's acceptable ease band, then labelled in words.</p></div>
          <div><span>04</span><b>Confidence, not certainty</b><p>If the inputs are close, we say so. We don't display a fabricated accuracy percentage.</p></div>
        </div>
        <div className="explainer-foot">
          <p><Badge tone="soft">Demo note</Badge> Garment measurements and ratings in this build are synthetic demo data. Fit modelling must be calibrated against real fit outcomes before launch.</p>
          <Btn to="/shop" variant="outline" iconRight={<ArrowRight size={15} />}>Shop with your profile</Btn>
        </div>
      </section>
    </main>
  );
}
