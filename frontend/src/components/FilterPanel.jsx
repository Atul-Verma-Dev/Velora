import React from "react";
import { Check } from "lucide-react";
import { money } from "../lib/format.js";
import { Chip } from "./ui.jsx";

const COLOUR_HEX = {
  Yellow: "#e3b13c", Green: "#8ea283", Ivory: "#e9e2d3", White: "#f4f2ec",
  Blue: "#3f5f8f", Pink: "#c98d9a", Rust: "#b06a4c", Black: "#25252a",
  Grey: "#8f918f", Beige: "#cbbfa9", Brown: "#8b6244", Gold: "#c3a45f",
  Silver: "#b7bac0",
};

function Group({ title, children, defaultOpen = true }) {
  return (
    <details className="filter-group" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="filter-group-body">{children}</div>
    </details>
  );
}

function CheckList({ options, selected, onToggle, format = (v) => v, limit = 6 }) {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? options : options.slice(0, limit);
  return (
    <div className="check-list">
      {visible.map(({ value, count }) => {
        const checked = selected.includes(value);
        return (
          <label className="check-row" key={value}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(value)} />
            <span className="check-box" aria-hidden="true">{checked && <Check size={11} />}</span>
            <span className="check-label">{format(value)}</span>
            <span className="check-count">{count}</span>
          </label>
        );
      })}
      {options.length > limit && (
        <button type="button" className="filter-more" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : `+ ${options.length - limit} more`}
        </button>
      )}
    </div>
  );
}

export default function FilterPanel({ facets, filters, setFilters, hide = [] }) {
  const toggle = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const show = (key) => !hide.includes(key);

  return (
    <div className="filter-panel">
      {show("gender") && (
        <Group title="Department">
          <CheckList options={facets.genders.filter((g) => g.value !== "Unisex")} selected={filters.gender} onToggle={(v) => toggle("gender", v)} />
        </Group>
      )}
      {show("category") && (
        <Group title="Category">
          <CheckList options={facets.categories} selected={filters.category} onToggle={(v) => toggle("category", v)} />
        </Group>
      )}
      {show("subcategory") && (
        <Group title="Type" defaultOpen={false}>
          <CheckList options={facets.subcategories} selected={filters.subcategory} onToggle={(v) => toggle("subcategory", v)} limit={8} />
        </Group>
      )}
      <Group title="Price">
        <div className="price-presets">
          {[
            ["Under ₹1,000", "", "999"],
            ["₹1,000 – ₹2,500", "1000", "2500"],
            ["₹2,500 – ₹5,000", "2500", "5000"],
            ["Above ₹5,000", "5000", ""],
          ].map(([label, min, max]) => (
            <Chip
              key={label}
              active={String(filters.priceMin) === min && String(filters.priceMax) === max}
              onClick={() => setFilters((f) => ({ ...f, priceMin: min, priceMax: max }))}
            >
              {label}
            </Chip>
          ))}
        </div>
        <div className="price-inputs">
          <label>
            <span>Min ₹</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={filters.priceMin}
              placeholder={String(facets.minPrice)}
              onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))}
            />
          </label>
          <span className="price-dash">—</span>
          <label>
            <span>Max ₹</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={filters.priceMax}
              placeholder={money(facets.maxPrice)}
              onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))}
            />
          </label>
        </div>
      </Group>
      <Group title="Brand">
        <CheckList options={facets.brands} selected={filters.brands} onToggle={(v) => toggle("brands", v)} limit={5} />
      </Group>
      {show("sizes") && facets.sizes.length > 0 && (
        <Group title="Size">
          <div className="size-filter-row">
            {facets.sizes.map(({ value, count }) => (
              <button
                key={value}
                type="button"
                className={filters.sizes.includes(value) ? "active" : ""}
                onClick={() => toggle("sizes", value)}
                aria-pressed={filters.sizes.includes(value)}
                title={`${count} styles`}
              >
                {value}
              </button>
            ))}
          </div>
        </Group>
      )}
      <Group title="Colour">
        <div className="colour-filter-grid">
          {facets.colours.map(({ value, count }) => (
            <button
              key={value}
              type="button"
              className={filters.colours.includes(value) ? "active" : ""}
              onClick={() => toggle("colours", value)}
              aria-pressed={filters.colours.includes(value)}
            >
              <i style={{ background: COLOUR_HEX[value] || "#ccc" }} aria-hidden="true" />
              <span>{value}</span>
              <small>{count}</small>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Occasion" defaultOpen={false}>
        <CheckList options={facets.occasions} selected={filters.occasions} onToggle={(v) => toggle("occasions", v)} limit={6} />
      </Group>
      {show("fabric") && (
        <Group title="Fabric" defaultOpen={false}>
          <CheckList
            options={facets.fabrics}
            selected={filters.fabrics}
            onToggle={(v) => toggle("fabrics", v)}
            format={(v) => v.replace(/\b\w/g, (c) => c.toUpperCase())}
            limit={6}
          />
        </Group>
      )}
      {show("fit") && (
        <Group title="Fit" defaultOpen={false}>
          <CheckList options={facets.fits} selected={filters.fits} onToggle={(v) => toggle("fits", v)} limit={5} />
        </Group>
      )}
      <Group title="Rating & offers">
        <div className="pill-filter-row">
          {["4.5", "4", "3.5"].map((r) => (
            <Chip key={r} active={filters.rating === r} onClick={() => setFilters((f) => ({ ...f, rating: f.rating === r ? "" : r }))}>
              {r}★ & above
            </Chip>
          ))}
          {["30", "50"].map((d) => (
            <Chip key={d} active={filters.discount === d} onClick={() => setFilters((f) => ({ ...f, discount: f.discount === d ? "" : d }))}>
              {d}% off & above
            </Chip>
          ))}
          <Chip active={filters.inStock} onClick={() => setFilters((f) => ({ ...f, inStock: !f.inStock }))}>
            In stock only
          </Chip>
        </div>
      </Group>
    </div>
  );
}

export function activeChips(filters, setFilters, facets) {
  const chips = [];
  const remove = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: Array.isArray(f[key]) ? f[key].filter((v) => v !== value) : "",
    }));
  ["gender", "category", "subcategory", "brands", "colours", "occasions", "fabrics", "fits", "sizes"].forEach((key) => {
    filters[key].forEach((value) => chips.push({ key: `${key}:${value}`, label: value, onRemove: () => remove(key, value) }));
  });
  if (filters.priceMin) chips.push({ key: "min", label: `Above ${money(filters.priceMin)}`, onRemove: () => setFilters((f) => ({ ...f, priceMin: "" })) });
  if (filters.priceMax) chips.push({ key: "max", label: `Under ${money(filters.priceMax)}`, onRemove: () => setFilters((f) => ({ ...f, priceMax: "" })) });
  if (filters.rating) chips.push({ key: "rating", label: `${filters.rating}★ & above`, onRemove: () => setFilters((f) => ({ ...f, rating: "" })) });
  if (filters.discount) chips.push({ key: "discount", label: `${filters.discount}% off & above`, onRemove: () => setFilters((f) => ({ ...f, discount: "" })) });
  if (filters.inStock) chips.push({ key: "stock", label: "In stock", onRemove: () => setFilters((f) => ({ ...f, inStock: false })) });
  return chips;
}
