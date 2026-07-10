/*
 * Falmouth Docks live tide gauge proxy.
 *
 * The browser can't fetch apfalmouth.port-log.net directly (no CORS, HTML only),
 * so this function fetches the Port-Log "Latest" page server-side and extracts the
 * Falmouth Docks gauge reading. Parsing lives in the shared module so it stays in
 * sync with the scheduled logger (scripts/log-tide.mjs).
 */

const { parseDocksTide, SOURCE } = require("../../scripts/parse-portlog.cjs");

function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async () => {
  try {
    const res = await fetch(SOURCE, {
      headers: {
        "user-agent":
          "JucoTime/1.0 (Falmouth launch planner; +https://jucotime.netlify.app)",
        accept: "text/html",
      },
    });
    if (!res.ok) return json(502, { error: `source HTTP ${res.status}` });
    const html = await res.text();
    const data = parseDocksTide(html);
    if (!data) return json(502, { error: "could not parse Docks tide from source" });
    // Port-Log refreshes ~every 290s; let the CDN cache briefly.
    return json(200, data, { "cache-control": "public, max-age=120" });
  } catch (e) {
    return json(502, { error: String((e && e.message) || e) });
  }
};
