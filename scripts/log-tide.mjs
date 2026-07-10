/*
 * Scheduled Falmouth Docks tide logger ("git scraping").
 *
 * Fetches the Port-Log "Latest" page, extracts the Docks gauge reading, and
 * appends it to a dated CSV under data/tide/falmouth-docks/. Designed to be run
 * on a cron by GitHub Actions, which commits the growing files back to the repo,
 * building an indefinite record for later harmonic analysis.
 *
 * Idempotent: readings are keyed by their measurement time (UTC), so re-running
 * within the same interval — or a cron firing faster than the gauge updates —
 * never writes a duplicate row.
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { parseDocksTide, SOURCE } = require("./parse-portlog.cjs");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data", "tide", "falmouth-docks");
const CSV_HEADER = "time_utc,observed_m,predicted_m,surge_m";

function num(v) {
  return v === null || v === undefined || Number.isNaN(v) ? "" : String(v);
}

// Parse HTML and append the reading to its dated CSV. Pure filesystem work, so
// it's unit-testable against a saved page. Returns a short status string.
export function logReading(html) {
  const r = parseDocksTide(html);
  if (!r) throw new Error("could not parse Docks tide from source");
  if (!r.time) throw new Error("reading has no measurement time");

  // Daily file grouped by month: data/tide/falmouth-docks/YYYY-MM/YYYY-MM-DD.csv
  const day = r.time.slice(0, 10); // YYYY-MM-DD (UTC)
  const month = r.time.slice(0, 7); // YYYY-MM
  const monthDir = join(DATA_DIR, month);
  const file = join(monthDir, `${day}.csv`);

  let lines = [];
  if (existsSync(file)) {
    lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  }
  if (lines.length === 0) lines.push(CSV_HEADER);

  // Dedupe by measurement time (first CSV column).
  const seen = new Set(lines.slice(1).map((l) => l.split(",")[0]));
  if (seen.has(r.time)) {
    return `no new reading (latest still ${r.time}, observed ${r.observed} m)`;
  }

  const row = `${r.time},${num(r.observed)},${num(r.predicted)},${num(r.surge)}`;
  lines.push(row);
  mkdirSync(monthDir, { recursive: true });
  writeFileSync(file, lines.join("\n") + "\n");

  // Rolling pointer to the most recent reading (handy for the app/quick checks).
  writeFileSync(
    join(DATA_DIR, "latest.json"),
    JSON.stringify(
      { ...r, rows_today: lines.length - 1, file: `${month}/${day}.csv` },
      null,
      2
    ) + "\n"
  );

  return `logged ${r.time}  observed ${r.observed} m  (surge ${num(r.surge)} m) -> ${month}/${day}.csv`;
}

export async function fetchAndLog() {
  try {
    const res = await fetch(SOURCE, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        accept: "text/html",
      },
    });
    if (!res.ok) throw new Error(`source HTTP ${res.status}`);
    const html = await res.text();
    console.log(logReading(html));
  } catch (e) {
    // Transient source/network hiccups shouldn't spam failed-run notifications;
    // just skip this tick without committing anything.
    console.warn(`skip: ${String((e && e.message) || e)}`);
  }
}

// Auto-run only when invoked directly (not when imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  fetchAndLog().then(() => process.exit(0));
}
