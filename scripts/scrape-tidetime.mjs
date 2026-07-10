/*
 * Scrape official Falmouth tide predictions from tidetime.org's month calendars
 * and emit them in the app's RAW format:
 *
 *   "YYYY-MM-DD": [["L","01:14",1.07],["H","07:32",5.20], ...]
 *
 * tidetime.org publishes one HTML page per month. Each day is a table row:
 *   <tr><th>01 <i>Wed</i></th>
 *     <td><div class="tidal-state">Low</div>
 *         <div class="tidal-time">1:14 am</div>
 *         <div class="tidal-height">(<span class="m">1.07 m</span>...)</div></td>
 *     ... up to 4 tides ...
 *   </tr>
 * Times are local (GMT/BST, matching the app's existing table); heights are
 * metres above chart datum.
 *
 * Usage:
 *   node scripts/scrape-tidetime.mjs            # print a JS RAW fragment to stdout
 *   node scripts/scrape-tidetime.mjs --json     # print raw JSON instead
 * Test the parser offline against a saved page:
 *   import { parseMonth } from "./scrape-tidetime.mjs"
 */

const BASE = "https://www.tidetime.org/europe/united-kingdom";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NUM = Object.fromEntries(MONTHS.map((m, i) => [m, i + 1]));
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function to24h(t) {
  // "1:14 am" -> "01:14", "12:05 am" -> "00:05", "1:14 pm" -> "13:14", "12:05 pm" -> "12:05"
  const m = t.trim().match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const pm = /pm/i.test(m[3]);
  if (h === 12) h = pm ? 12 : 0;
  else if (pm) h += 12;
  return `${String(h).padStart(2, "0")}:${min}`;
}

// Parse one month page's HTML -> { "YYYY-MM-DD": [[type,hhmm,height], ...] }.
export function parseMonth(html) {
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || "";
  const ym = title.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (!ym) throw new Error(`no month/year in title: ${title}`);
  const month = MONTH_NAMES.findIndex((n) => n.toLowerCase() === ym[1].toLowerCase()) + 1;
  const year = Number(ym[2]);

  const out = {};
  // Each day row: <tr><th>DD <i>Day</i></th> ...cells... </tr>
  const rowRe = /<tr><th>\s*(\d{1,2})\s*<i>[^<]*<\/i><\/th>([\s\S]*?)<\/tr>/g;
  let r;
  while ((r = rowRe.exec(html))) {
    const dom = Number(r[1]);
    const cells = r[2];
    const tides = [];
    const cellRe = /<div class="tidal-state">(High|Low)<\/div>\s*<div class="tidal-time">([^<]+)<\/div>\s*<div class="tidal-height">\(<span class="m">([\d.]+)\s*m/gi;
    let c;
    while ((c = cellRe.exec(cells))) {
      const type = /high/i.test(c[1]) ? "H" : "L";
      const hhmm = to24h(c[2]);
      const h = Number(c[3]);
      if (hhmm && !Number.isNaN(h)) tides.push([type, hhmm, h]);
    }
    if (tides.length) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(dom).padStart(2, "0")}`;
      out[key] = tides;
    }
  }
  return out;
}

async function fetchMonth(slug) {
  const url = slug === "current" ? `${BASE}/falmouth-calendar.htm` : `${BASE}/falmouth-calendar-${slug}.htm`;
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

async function main() {
  // The 12 month-named pages each self-report their year in the title, so we
  // fetch all of them and let the titles place them on the calendar.
  const all = {};
  for (const slug of MONTHS) {
    try {
      const html = await fetchMonth(slug);
      Object.assign(all, parseMonth(html));
    } catch (e) {
      console.error(`skip ${slug}: ${e.message}`);
    }
  }
  const keys = Object.keys(all).sort();
  console.error(`parsed ${keys.length} days: ${keys[0]} … ${keys[keys.length - 1]}`);

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(all, null, 2) + "\n");
    return;
  }
  // Emit a JS fragment in the app's RAW style.
  const lines = keys.map((k) => {
    const arr = all[k].map(([t, hm, h]) => `["${t}","${hm}",${h.toFixed(2)}]`).join(",");
    return `  "${k}": [${arr}],`;
  });
  process.stdout.write(lines.join("\n") + "\n");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
