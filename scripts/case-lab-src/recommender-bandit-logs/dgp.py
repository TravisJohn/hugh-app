"""
Case Lab — "Variant B gets a higher average reward in the logs — roll it out
to everyone?"
Archetype: off-policy evaluation bias (logged bandit selection bias).

Data-generating process. A phased rollout showed the new recommender (policy
B) preferentially to already-engaged users (the logging policy's probability
of choosing B rises with user_engagement_score — a common "ramp to power
users first" rollout pattern). Reward (click) depends mostly on
user_engagement_score, with only a small TRUE effect from the arm itself. The
naive average reward by arm is confounded by who got shown which arm; the
honest fix is inverse-propensity weighting (using the LOGGED propensity of
each assignment) to estimate what reward each arm would earn across the WHOLE
population, not just the users it happened to be shown to.

Run:  python scripts/case-lab-src/recommender-bandit-logs/dgp.py
Emits: public/case-lab/recommender-bandit-logs/data.csv  (12,000 rows)
Prints: naive reward gap vs IPS-corrected reward gap.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 41
N = 12_000
OUT = os.path.join("public", "case-lab", "recommender-bandit-logs", "data.csv")


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    user_engagement_score = np.clip(rng.normal(50, 20, N), 0, 100).round(1)
    engagement_z = (user_engagement_score - 50) / 20

    # LOGGING policy: P(shown variant B) rises with engagement (ramped to
    # power users first) — this is what breaks a naive comparison.
    p_b = sigmoid(-0.3 + 0.9 * engagement_z)
    arm = np.where(rng.random(N) < p_b, "variant_b", "variant_a")
    propensity = np.where(arm == "variant_b", p_b, 1 - p_b).round(4)

    # TRUE reward model: driven mostly by engagement, with a SMALL true arm effect.
    true_arm_effect = 0.08  # log-odds bump for variant_b
    z = -0.5 + 1.3 * engagement_z + true_arm_effect * (arm == "variant_b")
    clicked = rng.binomial(1, sigmoid(z))

    df = pd.DataFrame(
        {
            "session_id": np.arange(1, N + 1),
            "user_engagement_score": user_engagement_score,
            "arm": arm,
            "propensity": propensity,
            "clicked": clicked,
        }
    )
    return df


def hajek_ips(df: pd.DataFrame, arm_name: str) -> float:
    sub = df[df.arm == arm_name]
    w = 1.0 / sub.propensity
    return float((w * sub.clicked).sum() / w.sum())


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    naive_b = float(df.loc[df.arm == "variant_b", "clicked"].mean())
    naive_a = float(df.loc[df.arm == "variant_a", "clicked"].mean())
    ips_b = hajek_ips(df, "variant_b")
    ips_a = hajek_ips(df, "variant_a")

    stats = {
        "rows": len(df),
        "share_variant_b": round(float((df.arm == "variant_b").mean()), 3),
        "mean_engagement_variant_a": round(float(df.loc[df.arm == "variant_a", "user_engagement_score"].mean()), 1),
        "mean_engagement_variant_b": round(float(df.loc[df.arm == "variant_b", "user_engagement_score"].mean()), 1),
        "naive_reward_a": round(naive_a, 4),
        "naive_reward_b": round(naive_b, 4),
        "naive_gap": round(naive_b - naive_a, 4),
        "ips_reward_a": round(ips_a, 4),
        "ips_reward_b": round(ips_b, 4),
        "ips_gap": round(ips_b - ips_a, 4),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
