/*
 * Falmouth Docks live tide gauge proxy.
 *
 * The browser can't fetch apfalmouth.port-log.net directly (no CORS, HTML only),
 * so this function fetches the Port-Log "Latest" page server-side and extracts the
 * Falmouth Docks gauge reading (Site 212). Each parameter's value + measurement
 * time live in a <span title="..."> attribute, e.g.:
 *
 *   <td ... id="parameter-212-10003" ...>
 *     <span title="Site: ... Docks Tide (212); Parameter: Observed (10003);
 *                  Value: 2.02; DateTime: 2026-06-26 09:45:03 UTC (115 secs); ...">2.02</span>
 *
 * Parameter 10003 = Observed sea level, 10004 = Predicted. Heights are metres on
 * the Docks gauge datum (chart datum). Only one live reading is exposed per poll,
 * so the client accumulates readings over time to build a trace.
 */

const SOURCE = "https://apfalmouth.port-log.net/live/Display.php";

// Parameter ids on the Docks Tide site (212).
const OBSERVED = "10003";
const PREDICTED = "10004";

function parseParam(html, paramId) {
  // The <td id="parameter-212-XXXXX"> ... <span title="..."> is unique per parameter.
  const re = new RegExp(
    `id="parameter-212-${paramId}"[\\s\\S]*?title="([^"]*)"`,
    "i"
  );
  const m = html.match(re);
  if (!m) return null;
  const title = m[1];
  const vm = title.match(/Value:\s*(-?\d+(?:\.\d+)?)/i);
  if (!vm) return null;
  const dm = title.match(
    /DateTime:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s*UTC/i
  );
  return {
    value: Number(vm[1]),
    time: dm ? `${dm[1]}T${dm[2]}Z` : null, // ISO 8601, UTC
  };
}

// Parse the Port-Log HTML into a compact reading object. Returns null if the
// observed value can't be found (page layout changed or gauge offline).
function parseDocksTide(html) {
  const observed = parseParam(html, OBSERVED);
  if (!observed || Number.isNaN(observed.value)) return null;
  const predicted = parseParam(html, PREDICTED);
  const surge =
    predicted && !Number.isNaN(predicted.value)
      ? Number((observed.value - predicted.value).toFixed(2))
      : null;
  return {
    station: "Falmouth Docks",
    observed: observed.value,
    predicted: predicted ? predicted.value : null,
    surge,
    time: observed.time,
    datum: "m (Docks gauge · chart datum)",
    source: SOURCE,
  };
}

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

// Exported for unit testing against a saved copy of the page.
exports.parseDocksTide = parseDocksTide;
