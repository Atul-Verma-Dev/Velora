// Velora API client — flag-gated backend integration.
// Set VITE_API_BACKEND=true to route Complete the Look recommendations
// through the FastAPI backend. Otherwise the local ctl.js logic is used.

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_ENABLED = import.meta.env.VITE_API_BACKEND === "true";

let _token = null;

export function setToken(token) {
  _token = token;
}

export function isBackendEnabled() {
  return BACKEND_ENABLED;
}

async function request(path, { method = "GET", body, headers = {} } = {}) {
  if (!BACKEND_ENABLED) {
    throw new Error("Backend integration is disabled. Set VITE_API_BACKEND=true.");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
};
