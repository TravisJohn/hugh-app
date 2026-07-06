"""
Case Lab — "Did the validation layer cut data-quality incidents?"
Archetype: regression to the mean (selection on an extreme).

Data-generating process. The platform team added schema/contract validation to
the tables with the WORST data-quality incident counts in H1. In H2 those tables'
incidents fell sharply. But each table has a stable latent incident rate; H1
counts are noisy draws around it, so the tables picked for being highest in H1
were partly unlucky and fall back toward their own average in H2 whether or not
they were treated. The validation layer's TRUE effect is small.

Run:  python scripts/case-lab-src/schema-validation/dgp.py
Emits: public/case-lab/schema-validation/data.csv  (12,000 rows)
Prints: naive within-treated drop vs matched (diff-in-diff) effect + samples.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 42
N = 12_000
OUT = os.path.join("public", "case-lab", "schema-validation", "data.csv")


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    domain = rng.choice(
        ["finance", "marketing", "product", "ops", "growth"], N,
        p=[0.20, 0.24, 0.26, 0.15, 0.15],
    )
    owner_team = rng.choice(
        ["ingest", "core-model", "activation", "reporting"], N,
        p=[0.30, 0.30, 0.20, 0.20],
    )

    # Latent per-table incident rate (stable quality) — the thing that persists.
    lam = rng.gamma(shape=1.6, scale=2.2, size=N)  # mean ~3.5 incidents / half

    # H1 and H2 are noisy Poisson draws around the SAME latent rate.
    incidents_h1 = rng.poisson(lam)

    # TREATMENT: validation targeted the tables with the worst H1 counts
    # (mostly the top ~20%), plus a little slack.
    thresh = np.quantile(incidents_h1, 0.80)
    p_treat = np.where(incidents_h1 >= thresh, 0.85, 0.06)
    got_validation = rng.binomial(1, p_treat)

    # TRUE effect of validation: a modest ~7% reduction in the rate.
    true_mult = np.where(got_validation == 1, 0.93, 1.0)
    incidents_h2 = rng.poisson(lam * true_mult)

    return pd.DataFrame(
        {
            "table_id": np.arange(1, N + 1),
            "domain": domain,
            "owner_team": owner_team,
            "incidents_h1": incidents_h1,
            "got_validation": got_validation,
            "incidents_h2": incidents_h2,
        }
    )


def naive_treated_drop(df: pd.DataFrame) -> float:
    t = df[df.got_validation == 1]
    return float((t.incidents_h2 - t.incidents_h1).mean())


def control_high_drop(df: pd.DataFrame) -> float:
    """Regression-to-mean witness: untreated tables that were ALSO high in H1
    (>= the treatment threshold) — how much do THEY fall with no validation?"""
    thresh = np.quantile(df.incidents_h1, 0.80)
    c = df[(df.got_validation == 0) & (df.incidents_h1 >= thresh)]
    return float((c.incidents_h2 - c.incidents_h1).mean())


def matched_effect(df: pd.DataFrame) -> float:
    """Diff-in-diff within H1-count strata: treated change minus control change,
    count-weighted. Isolates validation from the mean-reversion both groups share."""
    df = df.copy()
    df["stratum"] = df.incidents_h1
    diffs, weights = [], []
    for _, g in df.groupby("stratum"):
        t = g[g.got_validation == 1]
        c = g[g.got_validation == 0]
        if len(t) and len(c):
            dt = (t.incidents_h2 - t.incidents_h1).mean()
            dc = (c.incidents_h2 - c.incidents_h1).mean()
            diffs.append(dt - dc)
            weights.append(len(t))
    return float(np.average(diffs, weights=weights))


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    stats = {
        "rows": len(df),
        "share_treated": round(df.got_validation.mean(), 3),
        "naive_treated_drop": round(naive_treated_drop(df), 2),
        "control_high_drop": round(control_high_drop(df), 2),
        "matched_diff_in_diff": round(matched_effect(df), 2),
        "mean_h1_treated": round(df.loc[df.got_validation == 1, "incidents_h1"].mean(), 2),
        "mean_h1_not": round(df.loc[df.got_validation == 0, "incidents_h1"].mean(), 2),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
