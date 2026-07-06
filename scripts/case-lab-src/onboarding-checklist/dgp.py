"""
Case Lab — "Checklist-completers retain 3x — force everyone through it?"
Archetype: self-selection (intent is the confounder).

Data-generating process. Users who FINISH the onboarding checklist retain far
better — but finishing is voluntary, and the users who bother are the high-intent
ones (measured here by how many setup actions they took in their first hour, before
the checklist). Intent drives both completing the checklist and retaining, so the
naive completer-vs-not gap is mostly self-selection. Forcing low-intent users
through the checklist won't hand them the motivation. The checklist's TRUE effect
is small.

Run:  python scripts/case-lab-src/onboarding-checklist/dgp.py
Emits: public/case-lab/onboarding-checklist/data.csv  (12,000 rows)
Prints: naive vs intent-adjusted retention effect + samples.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 42
N = 12_000
OUT = os.path.join("public", "case-lab", "onboarding-checklist", "data.csv")


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    signup_source = rng.choice(["organic", "paid", "referral"], N, p=[0.45, 0.35, 0.20])
    plan = rng.choice(["free", "pro"], N, p=[0.80, 0.20])

    # First-hour setup actions — the OBSERVABLE intent signal, before the checklist.
    setup_actions = np.clip(rng.poisson(4, N) + rng.poisson(2, N), 0, 25).astype(int)
    intent = (setup_actions - setup_actions.mean()) / (setup_actions.std() + 1e-9)

    # COMPLETION is voluntary and driven by intent (self-selection).
    completed_checklist = rng.binomial(1, sigmoid(-0.2 + 1.35 * intent))

    # RETENTION is driven mostly by intent; the checklist's TRUE effect is small.
    tau = 0.18
    w = -0.35 + 1.15 * intent + tau * completed_checklist
    w += np.where(plan == "pro", 0.30, 0.0)
    retained_30d = rng.binomial(1, sigmoid(w))

    return pd.DataFrame(
        {
            "user_id": np.arange(1, N + 1),
            "signup_source": signup_source,
            "plan": plan,
            "setup_actions_first_hour": setup_actions,
            "completed_checklist": completed_checklist,
            "retained_30d": retained_30d,
        }
    )


def naive_effect(df: pd.DataFrame) -> float:
    a = df.loc[df.completed_checklist == 1, "retained_30d"].mean()
    b = df.loc[df.completed_checklist == 0, "retained_30d"].mean()
    return (a - b) * 100.0


def adjusted_effect(df: pd.DataFrame, bins: int = 10) -> float:
    """Compare completers vs not WITHIN first-hour-setup-actions strata, weighted."""
    df = df.copy()
    df["stratum"] = pd.qcut(
        df.setup_actions_first_hour.rank(method="first"), bins, labels=False, duplicates="drop"
    )
    diffs, weights = [], []
    for _, g in df.groupby("stratum"):
        t = g.loc[g.completed_checklist == 1, "retained_30d"]
        c = g.loc[g.completed_checklist == 0, "retained_30d"]
        if len(t) and len(c):
            diffs.append(t.mean() - c.mean())
            weights.append(len(g))
    return float(np.average(diffs, weights=weights)) * 100.0


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    a = df.loc[df.completed_checklist == 1, "retained_30d"].mean()
    b = df.loc[df.completed_checklist == 0, "retained_30d"].mean()
    stats = {
        "rows": len(df),
        "share_completed": round(df.completed_checklist.mean(), 3),
        "retention_completed": round(a * 100, 1),
        "retention_not": round(b * 100, 1),
        "naive_ratio": round(a / b, 2),
        "naive_effect_pts": round(naive_effect(df), 1),
        "adjusted_effect_pts": round(adjusted_effect(df), 1),
        "mean_setup_completed": round(df.loc[df.completed_checklist == 1, "setup_actions_first_hour"].mean(), 1),
        "mean_setup_not": round(df.loc[df.completed_checklist == 0, "setup_actions_first_hour"].mean(), 1),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
