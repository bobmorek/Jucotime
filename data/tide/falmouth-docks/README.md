# Falmouth Docks tide log

An indefinitely-growing record of observed sea level at the **Falmouth Docks**
gauge, scraped from [Port-Log](https://apfalmouth.port-log.net/live/Display.php)
(OceanWise) by the `Log Falmouth tide` GitHub Action (`.github/workflows/tide-log.yml`),
which runs every ~30 minutes and commits each new reading.

## Layout

```
data/tide/falmouth-docks/
├── latest.json              # most recent reading (rolling pointer)
├── YYYY-MM/
│   └── YYYY-MM-DD.csv        # one file per UTC day
└── ...
```

## CSV schema

| column        | meaning                                             |
| ------------- | --------------------------------------------------- |
| `time_utc`    | measurement time from the gauge, ISO 8601 UTC       |
| `observed_m`  | observed sea level, metres on the Docks gauge datum |
| `predicted_m` | Port-Log's own astronomical prediction, metres      |
| `surge_m`     | `observed − predicted` (residual), metres           |

Rows are keyed by `time_utc` and de-duplicated, so re-runs never double-log.
Heights are on the Docks gauge datum (chart datum); treat as a self-consistent
series — don't assume it's identical to Admiralty Chart Datum to the centimetre.

## Roadmap → harmonic predictions

The point of this log is to derive Falmouth's own **tidal harmonic constituents**
(M2, S2, N2, K1, O1, …) and generate independent predictions.

- **Sampling:** ~30-min observed heights. Fine for the major semidiurnal/diurnal
  constituents; can be decimated to hourly for classical analysis.
- **How much data:** ≥ ~29 days resolves the main constituents; ~6–12 months gives
  a solid standard set (and the seasonal Sa/Ssa terms). Longer is better.
- **Analysis:** run `scripts/harmonic-analysis.py` (uses [`utide`](https://github.com/wesleybowman/UTide))
  once enough days have accumulated. It reads these CSVs, solves for constituents,
  and can emit a prediction series.
