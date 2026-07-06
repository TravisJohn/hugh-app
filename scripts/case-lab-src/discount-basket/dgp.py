"""
Case Lab — "Discount-code orders are bigger — push codes to grow baskets?"
Archetype: reverse causality (intent drives code use, not the other way).

Data-generating process. Orders that used a promo code have a higher basket value.
But shoppers planning a big, considered purchase are the ones who go hunting for a
code first — so a large intended basket CAUSES code use, not the reverse. Code use
is driven by pre-existing purchase intent (proxied by items_in_cart and whether the
order is a big-ticket category); the code's TRUE effect on basket size is ~zero, and
because the code gives margin away, "send more codes" loses money on purchases that
would have happened anyway.

Run:  python scripts/case-lab-src/discount-basket/dgp.py
Emits: public/case-lab/discount-basket/data.csv  (12,000 rows)
Prints: naive vs intent-adjusted basket effect + the margin implication.
"""
import json
import os

import numpy as np
import pandas as pd

SEED = 42
N = 12_000
OUT = os.path.join("public", "case-lab", "discount-basket", "data.csv")


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def generate() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)

    big_ticket = rng.binomial(1, 0.30, N)
    category = np.where(big_ticket == 1, "big_ticket", "everyday")
    customer_type = rng.choice(["new", "repeat"], N, p=[0.45, 0.55])

    # Items in the cart — a proxy for purchase intent. Bigger for big-ticket buys.
    items_in_cart = np.clip(
        rng.poisson(np.where(big_ticket == 1, 5, 2)) + 1, 1, 30
    ).astype(int)

    # Per-item price is higher for big-ticket categories.
    unit_price = np.where(
        big_ticket == 1,
        rng.lognormal(mean=4.6, sigma=0.4, size=N),   # ~$100 items
        rng.lognormal(mean=2.8, sigma=0.5, size=N),   # ~$16 items
    )

    # CODE USE is driven by intent: big planned baskets go looking for a code.
    intent = (items_in_cart - items_in_cart.mean()) / items_in_cart.std()
    z = -0.4 + 0.9 * intent + 0.8 * big_ticket
    used_code = rng.binomial(1, sigmoid(z))
    discount_pct = np.where(used_code == 1, rng.uniform(0.10, 0.20, N), 0.0).round(3)

    # ORDER VALUE (gross basket) is set by items and price. The code's TRUE effect
    # on basket size is ~0 (a whisper of threshold-nudging, well inside noise).
    order_value = (items_in_cart * unit_price * (1 + 0.01 * used_code)).round(2)

    return pd.DataFrame(
        {
            "order_id": np.arange(1, N + 1),
            "category": category,
            "customer_type": customer_type,
            "items_in_cart": items_in_cart,
            "used_code": used_code,
            "discount_pct": discount_pct,
            "order_value": order_value,
        }
    )


def naive_gap(df: pd.DataFrame) -> float:
    a = df.loc[df.used_code == 1, "order_value"].mean()
    b = df.loc[df.used_code == 0, "order_value"].mean()
    return a - b


def adjusted_gap(df: pd.DataFrame, bins: int = 10) -> float:
    """Compare coded vs not WITHIN items-in-cart strata AND category, weighted —
    holding purchase intent roughly fixed."""
    df = df.copy()
    df["stratum"] = (
        df.category + "_" + pd.qcut(df.items_in_cart.rank(method="first"), bins, labels=False).astype(str)
    )
    diffs, weights = [], []
    for _, g in df.groupby("stratum"):
        t = g.loc[g.used_code == 1, "order_value"]
        c = g.loc[g.used_code == 0, "order_value"]
        if len(t) and len(c):
            diffs.append(t.mean() - c.mean())
            weights.append(len(g))
    return float(np.average(diffs, weights=weights))


def main() -> None:
    df = generate()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)

    coded = df[df.used_code == 1]
    stats = {
        "rows": len(df),
        "share_coded": round(df.used_code.mean(), 3),
        "value_coded": round(df.loc[df.used_code == 1, "order_value"].mean(), 0),
        "value_not": round(df.loc[df.used_code == 0, "order_value"].mean(), 0),
        "naive_gap": round(naive_gap(df), 0),
        "adjusted_gap": round(adjusted_gap(df), 0),
        "mean_items_coded": round(df.loc[df.used_code == 1, "items_in_cart"].mean(), 1),
        "mean_items_not": round(df.loc[df.used_code == 0, "items_in_cart"].mean(), 1),
        "avg_discount_given_on_coded": round((coded.order_value * coded.discount_pct).mean(), 0),
    }
    print("STATS " + json.dumps(stats))
    print("SAMPLE " + df.head(10).to_json(orient="records"))


if __name__ == "__main__":
    main()
