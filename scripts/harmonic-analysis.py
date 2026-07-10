#!/usr/bin/env python3
"""
Harmonic analysis of the Falmouth Docks tide log.

Reads the committed observed-height CSVs (data/tide/falmouth-docks/**/*.csv),
solves for tidal harmonic constituents with UTide, prints the amplitudes/phases,
and optionally writes a predicted-height series.

This is the "ultimately" step: run it once enough data has accumulated.
    >= ~29 days  -> the main constituents (M2, S2, N2, K1, O1, ...)
    ~6-12 months -> a solid standard set, incl. seasonal terms

Requirements:
    pip install utide pandas numpy

Usage:
    python scripts/harmonic-analysis.py                 # analyse, print constituents
    python scripts/harmonic-analysis.py --predict out.csv --days 7
"""

import argparse
import glob
import os
import sys

FALMOUTH_LAT = 50.152  # degrees N — needed for the nodal corrections

DATA_GLOB = os.path.join(
    os.path.dirname(__file__), "..", "data", "tide", "falmouth-docks", "*", "*.csv"
)


def load_series():
    import numpy as np
    import pandas as pd

    files = sorted(glob.glob(DATA_GLOB))
    if not files:
        sys.exit("No CSV data found yet — let the logger run for a while first.")

    df = pd.concat((pd.read_csv(f) for f in files), ignore_index=True)
    df = df.dropna(subset=["time_utc", "observed_m"])
    df["time_utc"] = pd.to_datetime(df["time_utc"], utc=True)
    df = df.drop_duplicates(subset="time_utc").sort_values("time_utc")

    span_days = (df["time_utc"].iloc[-1] - df["time_utc"].iloc[0]).total_seconds() / 86400
    print(f"{len(df)} readings over {span_days:.1f} days "
          f"({df['time_utc'].iloc[0]:%Y-%m-%d} -> {df['time_utc'].iloc[-1]:%Y-%m-%d})")
    if span_days < 29:
        print("  ! under ~29 days — constituents will be poorly resolved. Keep logging.")

    # UTide wants matplotlib datenums and a float height array.
    from matplotlib.dates import date2num
    t = date2num(df["time_utc"].dt.tz_convert(None).dt.to_pydatetime())
    h = df["observed_m"].to_numpy(dtype=float)
    return t, h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--predict", metavar="OUT.csv",
                    help="write a predicted-height series to this file")
    ap.add_argument("--days", type=float, default=7,
                    help="length of the prediction series in days (default 7)")
    ap.add_argument("--step-min", type=float, default=10,
                    help="prediction time step in minutes (default 10)")
    args = ap.parse_args()

    try:
        import numpy as np
        from utide import solve, reconstruct
        from matplotlib.dates import num2date
    except ImportError:
        sys.exit("Missing deps. Run:  pip install utide pandas numpy")

    t, h = load_series()

    coef = solve(t, h, lat=FALMOUTH_LAT, method="ols", conf_int="MC", verbose=False)

    print("\nConstituent   amplitude(m)   phase(deg)")
    order = np.argsort(coef["A"])[::-1]
    for i in order:
        name = coef["name"][i]
        if coef["A"][i] < 0.005:
            continue
        print(f"  {name:<6}      {coef['A'][i]:7.3f}       {coef['g'][i]:7.1f}")

    if args.predict:
        step = args.step_min / (24 * 60)
        tp = np.arange(t[-1], t[-1] + args.days, step)
        pred = reconstruct(tp, coef, verbose=False)
        with open(args.predict, "w") as fh:
            fh.write("time_utc,predicted_m\n")
            for ti, hi in zip(tp, pred["h"]):
                fh.write(f"{num2date(ti).strftime('%Y-%m-%dT%H:%M:%SZ')},{hi:.3f}\n")
        print(f"\nWrote {len(tp)} predicted heights -> {args.predict}")


if __name__ == "__main__":
    main()
