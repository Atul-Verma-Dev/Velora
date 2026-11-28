// Static worker for the Vite build: serve dist assets, fall back to index.html
// for client-side routes (/shop, /product/:id, ...), which have no file extension.
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status === 404 && request.method === "GET") {
      const url = new URL(request.url);
      if (!/\.[a-z0-9]+$/i.test(url.pathname)) {
        return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
      }
    }
    return response;
  },
};
