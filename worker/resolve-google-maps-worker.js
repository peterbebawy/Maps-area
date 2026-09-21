/**
 * Cloudflare Worker اختياري لفك روابط maps.app.goo.gl القصيرة.
 * بعد نشره، ضع URL الخاص به داخل shortLinkResolverUrl في config.js.
 */
const ALLOWED_INPUT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);
const ALLOWED_FINAL_HOSTS = new Set([
  "www.google.com",
  "google.com",
  "maps.google.com",
  "www.google.com.eg"
]);

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: corsHeaders()
      });
    }

    const requestUrl = new URL(request.url);
    const raw = requestUrl.searchParams.get("url");
    if (!raw) {
      return new Response(JSON.stringify({ error: "Missing url parameter" }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    let target;
    try {
      target = new URL(raw);
    } catch (_) {
      return new Response(JSON.stringify({ error: "Invalid URL" }), { status: 400, headers: corsHeaders() });
    }

    if (target.protocol !== "https:" || !ALLOWED_INPUT_HOSTS.has(target.hostname.toLowerCase())) {
      return new Response(JSON.stringify({ error: "Unsupported host" }), { status: 400, headers: corsHeaders() });
    }

    try {
      const response = await fetch(target.toString(), {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 MapsAreaFinder/1.0" }
      });

      const finalUrl = response.url;
      const finalHost = new URL(finalUrl).hostname.toLowerCase();
      if (![...ALLOWED_FINAL_HOSTS].some((host) => finalHost === host || finalHost.endsWith(`.${host}`))) {
        return new Response(JSON.stringify({ error: "Unexpected redirect host" }), { status: 502, headers: corsHeaders() });
      }

      return new Response(JSON.stringify({ url: finalUrl }), { status: 200, headers: corsHeaders() });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Unable to resolve short link" }), { status: 502, headers: corsHeaders() });
    }
  }
};
