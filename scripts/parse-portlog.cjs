/*
 * Shared parser for the Port-Log "Latest" page — Falmouth Docks gauge (Site 212).
 *
 * Each parameter's value + measurement time live in a <span title="..."> attribute:
 *
 *   <td ... id="parameter-212-10003" ...>
 *     <span title="Site: ... Docks Tide (212); Parameter: Observed (10003);
 *                  Value: 2.02; DateTime: 2026-06-26 09:45:03 UTC (115 secs); ...">2.02</span>
 *
 * Parameter 10003 = Observed sea level, 10004 = Predicted. Heights are metres on
 * the Docks gauge datum (chart datum).
 *
 * Used by both the Netlify proxy (netlify/functions/falmouth-tide.js) and the
 * scheduled logger (scripts/log-tide.mjs) so the parsing logic never drifts.
 */

const SOURCE = "https://apfalmouth.port-log.net/live/Display.php";

const OBSERVED = "10003";
const PREDICTED = "10004";

function parseParam(html, paramId) {
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

// Parse the Port-Log HTML into a compact reading object, or null if the observed
// value can't be found (page layout changed or gauge offline).
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

module.exports = { parseDocksTide, parseParam, SOURCE };
