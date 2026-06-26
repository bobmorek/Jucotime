/**
 * Scrapes live wind + tide data from the Falmouth port-log display.
 *
 * Source: https://apfalmouth.port-log.net/live/Display.php (OceanWise / Port of
 * Falmouth). The page is server-rendered HTML with no CORS headers, so the
 * browser can't read it directly — this function fetches it server-side and
 * returns a small JSON payload the app can consume.
 *
 *   Queens Met  (Site 213, Dataset 5 "Met")   — wind speed/dir + gust speed/dir
 *   Docks Tide  (Site 212, Dataset 1 "Tides")  — observed / predicted / surge (m)
 *
 * Each value lives in:
 *   <td ... id="parameter-<site>-<param>" ...>
 *     <span title="...; Value: <raw>; DateTime: <ts>; ...">DISPLAYED</span>
 *   </td>
 * The displayed span text is in the units shown on the page (wind in knots,
 * tide in metres); the title's "Value:" is the raw sensor value (wind in m/s),
 * so we read the displayed text and pull DateTime/Quality from the title.
 */

const SOURCE_URL = "https://apfalmouth.port-log.net/live/Display.php";

// Parameter ids on the page (site-param)
const PARAMS = {
  queens: {
    site: 213,
    name: "Queens Met",
    fields: {
      windDir: 50003,    // Wind Direction (compass text, e.g. "WSW")
      windSpeed: 50002,  // Wind Speed (knots, as displayed)
      gustSpeed: 50006,  // Gust Speed (knots, as displayed)
      gustDir: 50007,    // Gust Direction (compass text)
    },
  },
  docks: {
    site: 212,
    name: "Docks Tide",
    fields: {
      observed: 10003,   // Observed level (m)
      predicted: 10004,  // Predicted level (m)
      surge: 10005,      // Surge = observed - predicted (m)
    },
  },
};

// Pull the displayed value + title metadata for one parameter id out of the HTML.
function extractParam(html, site, param) {
  const id = `parameter-${site}-${param}`;
  // Find the cell by id, then the first <span title="...">value</span> after it.
  const re = new RegExp(
    `id="${id}"[\\s\\S]*?<span[^>]*title="([^"]*)"[^>]*>([\\s\\S]*?)</span>`,
    "i"
  );
  const m = html.match(re);
  if (!m) return null;
  const title = m[1];
  const displayed = m[2].replace(/<[^>]*>/g, "").trim();
  const dtMatch = title.match(/DateTime:\s*([^;]+?)\s*(?:\([^)]*\))?;/);
  const qMatch = title.match(/Quality:\s*([^;]+);/);
  return {
    displayed,
    dateTime: dtMatch ? dtMatch[1].trim() : null,
    quality: qMatch ? qMatch[1].trim() : null,
  };
}

// Some fields are numeric (speeds, levels), some are compass text (directions).
function num(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function buildStation(html, cfg, numericKeys) {
  const out = { site: cfg.site, name: cfg.name };
  let dateTime = null;
  let quality = null;
  let any = false;
  for (const [key, param] of Object.entries(cfg.fields)) {
    const ex = extractParam(html, cfg.site, param);
    if (!ex) {
      out[key] = null;
      continue;
    }
    any = true;
    out[key] = numericKeys.includes(key) ? num(ex.displayed) : ex.displayed;
    // Use the freshest available timestamp/quality for the station.
    if (ex.dateTime) dateTime = ex.dateTime;
    if (ex.quality) quality = ex.quality;
  }
  out.dateTime = dateTime;
  out.quality = quality;
  return any ? out : null;
}

exports.handler = async function () {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    // Cache at the CDN for 60s; the source updates roughly every 30-60s.
    "Cache-Control": "public, max-age=30, s-maxage=60",
  };

  try {
    const res = await fetch(SOURCE_URL, {
      headers: {
        // Identify politely; some hosts reject blank user agents.
        "User-Agent": "JucoTime/1.0 (+https://juco-time.netlify.app)",
        Accept: "text/html",
      },
    });
    if (!res.ok) {
      return {
        statusCode: 502,
        headers: cors,
        body: JSON.stringify({ error: `source returned HTTP ${res.status}` }),
      };
    }
    const html = await res.text();

    const queens = buildStation(html, PARAMS.queens, [
      "windSpeed",
      "gustSpeed",
    ]);
    const docks = buildStation(html, PARAMS.docks, [
      "observed",
      "predicted",
      "surge",
    ]);

    if (!queens && !docks) {
      return {
        statusCode: 502,
        headers: cors,
        body: JSON.stringify({
          error: "could not parse any data from source",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        source: SOURCE_URL,
        fetchedAt: new Date().toISOString(),
        queens,
        docks,
      }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: cors,
      body: JSON.stringify({ error: String((e && e.message) || e) }),
    };
  }
};
