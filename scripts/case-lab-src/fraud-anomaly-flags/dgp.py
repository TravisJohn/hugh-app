"""
Case Lab — "The anomaly model flagged 1% as fraud — freeze those accounts?"
Archetype: anomaly-score precision.

Data-generating process. A small true-fraud population (~1.5%) has an unusual
feature signature (bigger amount, new device, odd hour, billing/shipping
country mismatch). But so do two entirely legitimate customer types: frequent
travelers (new devices abroad, odd local hours, gifts shipped to another
country) and bulk purchasers (big, unusual-sized orders). An unsupervised
isolation forest fit on those features can't tell "unusual because fraud" from
"unusual because legitimate but atypical" — it just flags whatever's furthest
from normal. Flagging the top 1% by anomaly score catches most of the fraud,
but the flagged bucket is mostly innocent travelers and bulk buyers.

Run:  python scripts/case-lab-src/fraud-anomaly-flags/dgp.py
Emits: public/case-lab/fraud-anomaly-flags/data.csv  (12,000 rows)
Prints: naive framing (flag rate) vs honest precision/recall of the flag
        against confirmed fraud.
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

SEED = 11
N = 12_000
OUT = os.path.join("public", "case-lab", "fraud-anomaly-flags", "data.csv")


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    customer_type = rng.choice(
        ["normal", "frequent_traveler", "bulk_purchaser"], N, p=[0.85, 0.08, 0.07]
    )
    true_fraud = rng.binomial(1, 0.015, N)

    is_traveler = customer_type == "frequent_traveler"
    is_bulk = customer_type == "bulk_purchaser"

    # Amount: elevated for bulk purchasers and for fraud.
    amount = rng.lognormal(
        mean=np.select(
            [is_bulk, true_fraud == 1], [5.4, 5.1], default=4.0
        ),
        sigma=0.5,
        size=N,
    ).round(2)

    # New device: common for travelers (new logins abroad) and fraud.
    p_new_device = np.select(
        [is_traveler, true_fraud == 1], [0.55, 0.65], default=0.06
    )
    is_new_device = rng.binomial(1, p_new_device)

    # Hour of day: travelers and fraud skew to odd local hours.
    odd_hour_prob = np.select([is_traveler, true_fraud == 1], [0.5, 0.6], default=0.08)
    is_odd_hour = rng.binomial(1, odd_hour_prob)
    hour_of_day = np.where(
        is_odd_hour == 1,
        rng.integers(0, 6, N),
        rng.integers(7, 23, N),
    )

    # Country mismatch: travelers (gifts, shipping abroad) and fraud.
    p_mismatch = np.select([is_traveler, true_fraud == 1], [0.45, 0.55], default=0.03)
    country_mismatch = rng.binomial(1, p_mismatch)

    df = pd.DataFrame(
        {
            "transaction_id": np.arange(1, N + 1),
            "customer_type": customer_type,
            "amount": amount,
            "is_new_device": is_new_device,
            "hour_of_day": hour_of_day,
            "country_mismatch": country_mismatch,
            "confirmed_fraud": true_fraud,
        }
    )
    return df


def flag_anomalies(df: pd.DataFrame, contamination: float = 0.01) -> np.ndarray:
    features = df[["amount", "is_new_device", "hour_of_day", "country_mismatch"]].to_numpy()
    model = IsolationForest(contamination=contamination, random_state=SEED, n_estimators=200)
    pred = model.fit_predict(features)  # -1 = anomaly, 1 = normal
    return (pred == -1).astype(int)


def main() -> None:
    df = generate()
    df["flagged_anomalous"] = flag_anomalies(df)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    flagged = df[df.flagged_anomalous == 1]
    tp = int(((df.flagged_anomalous == 1) & (df.confirmed_fraud == 1)).sum())
    fp = int(((df.flagged_anomalous == 1) & (df.confirmed_fraud == 0)).sum())
    total_fraud = int(df.confirmed_fraud.sum())

    stats = {
        "rows": len(df),
        "n_flagged": int(df.flagged_anomalous.sum()),
        "n_confirmed_fraud": total_fraud,
        "precision": round(tp / max(tp + fp, 1), 3),
        "recall": round(tp / max(total_fraud, 1), 3),
        "flagged_breakdown_by_customer_type": flagged.customer_type.value_counts().to_dict(),
        "flagged_traveler_or_bulk_share": round(
            flagged.customer_type.isin(["frequent_traveler", "bulk_purchaser"]).mean(), 3
        ),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
