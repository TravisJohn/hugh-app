"""
Case Lab — Case #4: "Team A's win rate beats Team B — B is underperforming."
Archetype: Simpson's paradox.

Team A works mostly small (easy) deals; Team B works mostly enterprise (hard)
deals. Within EVERY deal-size band, Team B wins more. But the deal mix flips the
aggregate, so Team A's overall win rate looks higher. Judging B by the raw rate
is comparing apples to oranges.

Emits: public/case-lab/sales-team-winrate/data.csv (12,000 rows)
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 23
N = 12_000
OUT = os.path.join("public", "case-lab", "sales-team-winrate", "data.csv")
BASE = {"smb": 0.45, "mid": 0.30, "enterprise": 0.18}
B_LIFT = 0.06  # Team B is genuinely better within each band
BANDS = ["smb", "mid", "enterprise"]
MIX = {"A": [0.6, 0.3, 0.1], "B": [0.1, 0.3, 0.6]}
VAL = {"smb": (2, 20), "mid": (20, 100), "enterprise": (100, 800)}  # $k range


def generate():
    rng = np.random.default_rng(SEED)
    team = rng.choice(["A", "B"], N)
    band = np.array([rng.choice(BANDS, p=MIX[t]) for t in team])
    base = np.array([BASE[b] for b in band])
    won = rng.binomial(1, np.clip(base + B_LIFT * (team == "B"), 0, 1))
    deal_value = np.array([round(rng.uniform(*VAL[b]), 1) for b in band])

    return pd.DataFrame(
        {
            "opportunity_id": np.arange(1, N + 1),
            "team": team,
            "deal_size_band": band,
            "deal_value_k": deal_value,
            "won": won,
        }
    )


def rate(df, team):
    return df.loc[df.team == team, "won"].mean()


def within(df, band):
    d = df[df.deal_size_band == band]
    return d.loc[d.team == "B", "won"].mean() - d.loc[d.team == "A", "won"].mean()


def standardized(df):
    diffs, w = [], []
    for band, g in df.groupby("deal_size_band"):
        diffs.append(within(df, band))
        w.append(len(g))
    return float(np.average(diffs, weights=w))


def main():
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)
    stats = {
        "rows": len(df),
        "winrate_A": round(rate(df, "A") * 100, 1),
        "winrate_B": round(rate(df, "B") * 100, 1),
        "naive_B_minus_A_pts": round((rate(df, "B") - rate(df, "A")) * 100, 1),
        "within_smb_pts": round(within(df, "smb") * 100, 1),
        "within_mid_pts": round(within(df, "mid") * 100, 1),
        "within_ent_pts": round(within(df, "enterprise") * 100, 1),
        "standardized_B_minus_A_pts": round(standardized(df) * 100, 1),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(8).to_json(orient="records"))


if __name__ == "__main__":
    main()
