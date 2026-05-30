const SHARED_SECRET = process.env.PROXY_SHARED_SECRET;
const PORT = Number(process.env.PORT ?? 8080);
const ALLOWED_HOSTS = new Set(["api.binance.com", "api1.binance.com", "api2.binance.com", "api3.binance.com"]);

if (!SHARED_SECRET) {
  console.error("FATAL: PROXY_SHARED_SECRET not set");
  process.exit(1);
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok", { status: 200 });
    if (url.pathname !== "/forward") return new Response("Not found", { status: 404 });
    if (req.headers.get("x-proxy-secret") !== SHARED_SECRET) return new Response("Unauthorized", { status: 401 });

    let payload: { url: string; method: string; headers?: Record<string, string>; body?: string };
    try { payload = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }

    let target: URL;
    try { target = new URL(payload.url); } catch { return new Response("Bad target URL", { status: 400 }); }
    if (!ALLOWED_HOSTS.has(target.hostname)) return new Response(`Host not allowed: ${target.hostname}`, { status: 403 });

    try {
      const upstream = await fetch(target.toString(), {
        method: payload.method ?? "GET",
        headers: payload.headers ?? {},
        body: payload.body,
      });
      const text = await upstream.text();
      return new Response(JSON.stringify({
        status: upstream.status,
        headers: Object.fromEntries(upstream.headers.entries()),
        body: text,
      }), { status: 200, headers: { "content-type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }),
        { status: 502, headers: { "content-type": "application/json" } });
    }
  },
});
console.log(`Proxy listening on :${PORT}`);
