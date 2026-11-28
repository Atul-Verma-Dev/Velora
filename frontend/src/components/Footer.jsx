import React from "react";
import { Link } from "react-router-dom";
import { GlowField } from "./fx.jsx";
import { Instagram, Facebook, Twitter, ShieldCheck, Truck, RotateCcw, Ruler } from "lucide-react";

const columns = [
  {
    title: "Shop",
    links: [
      ["New arrivals", "/new"],
      ["Women", "/shop?gender=Women"],
      ["Men", "/shop?gender=Men"],
      ["Ethnic wear", "/shop?category=Ethnic%20Wear"],
      ["Accessories", "/shop?category=Accessories"],
      ["Sale", "/shop?discount=30"],
    ],
  },
  {
    title: "Help",
    links: [
      ["Customer support", "/help"],
      ["Shipping information", "/help/shipping"],
      ["Returns & refunds", "/help/returns"],
      ["Size guide", "/size-guide"],
      ["Track an order", "/account/orders"],
      ["Grievance officer", "/help/grievance"],
    ],
  },
  {
    title: "Velora",
    links: [
      ["About Velora", "/about"],
      ["Fit intelligence", "/fit"],
      ["Visual search", "/search"],
      ["Complete the Look", "/help/complete-the-look"],
      ["Careers", "/about#careers"],
      ["Press", "/about#press"],
    ],
  },
  {
    title: "Sell",
    links: [
      ["Become a seller", "/sell"],
      ["Partner Hub", "/partner"],
      ["Seller policies", "/policies/returns"],
      ["Commission & fees", "/help/seller-fees"],
      ["Seller support", "/help/seller-support"],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="footer">
      <GlowField />
      <div className="footer-trust">
        <div><Truck size={18} /><span><b>Free delivery</b><small>On orders above ₹1,499</small></span></div>
        <div><RotateCcw size={18} /><span><b>7-day returns</b><small>Easy pickup on eligible items</small></span></div>
        <div><Ruler size={18} /><span><b>Fit guidance</b><small>Fast Path or Precision Scan</small></span></div>
        <div><ShieldCheck size={18} /><span><b>Verified sellers</b><small>KYC-checked partner studios</small></span></div>
      </div>

      <div className="footer-main">
        <div className="footer-brand">
          <Link to="/" className="logo footer-logo" aria-label="Velora home">
            <span className="logo-word">VELORA</span>
            <span className="logo-rule" aria-hidden="true" />
            <span className="logo-sub">INDIA</span>
          </Link>
          <p>Considered Indian fashion, better discovery and a little more fit confidence.</p>
          <div className="footer-social">
            <a href="https://instagram.com" target="_blank" rel="noreferrer noopener" aria-label="Velora on Instagram"><Instagram size={16} /></a>
            <a href="https://facebook.com" target="_blank" rel="noreferrer noopener" aria-label="Velora on Facebook"><Facebook size={16} /></a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer noopener" aria-label="Velora on X"><Twitter size={16} /></a>
          </div>
          <small className="footer-note">
            Demo storefront. Catalogue, reviews, sellers and orders are synthetic sample data. No real payments are collected.
          </small>
        </div>
        {columns.map((col) => (
          <div className="footer-col" key={col.title}>
            <b>{col.title}</b>
            {col.links.map(([label, to]) => <Link key={label} to={to}>{label}</Link>)}
          </div>
        ))}
      </div>

      <div className="footer-bottom">
        <span>© 2026 Velora Commerce Pvt Ltd (demo)</span>
        <div className="footer-legal">
          <Link to="/policies/privacy">Privacy</Link>
          <Link to="/policies/terms">Terms</Link>
          <Link to="/policies/returns">Returns policy</Link>
          <Link to="/help/grievance">Grievance</Link>
        </div>
        <span>India · INR ₹</span>
      </div>
    </footer>
  );
}
