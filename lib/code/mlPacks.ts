// Machine-learning practice packs — real scikit-learn syntax (not from-scratch
// math, unlike the Linear Regression pack): .fit/.predict/.score, train_test_split,
// cross_val_score, the works. Pyodide loads scikit-learn the same way it loads
// pandas (an extra `preloadPackages` entry so the download happens during boot,
// outside the per-run timeout — see DrillMock's `bootPackages`).
//
// Every pack shares one small telecom-style customer table (20 rows, dataKind
// "dataframe"): age, income_k, tenure_months, monthly_usage, plan, churn. Two
// rows are deliberately "hard cases" (a loyal-looking customer who churned, and
// a risky-looking one who didn't) so no single feature perfectly separates the
// classes — models land at realistic ~90% accuracy, not a trivial 100%. Every
// solution + assertion was verified against the EXACT package versions Pyodide
// 0.26.4 ships (numpy 1.26.4, pandas 2.2.0, scikit-learn 1.4.2, scipy 1.12.0) in
// a pinned local venv — not whatever's newest locally — so results match what
// actually runs in the browser. Float-producing cells (probabilities, R²,
// coefficients, inertia) assert on rounded values; anything that goes through
// an iterative/BLAS-backed solver (logistic regression, k-means, the neural
// net) is rounded to 1-2dp specifically to absorb tiny native-vs-WASM
// floating-point differences.

import { pdDataFrameLiteral, type DataRow, type DrillContent } from "./drillContent";
import type { DrillPack } from "./packs";

const CUSTOMERS_ROWS: DataRow[] = [
  { age: 25, income_k: 32, tenure_months: 2,  monthly_usage: 5,  plan: "basic", churn: 1 },
  { age: 34, income_k: 55, tenure_months: 24, monthly_usage: 40, plan: "pro",   churn: 0 },
  { age: 45, income_k: 80, tenure_months: 36, monthly_usage: 55, plan: "pro",   churn: 0 },
  { age: 23, income_k: 28, tenure_months: 1,  monthly_usage: 3,  plan: "basic", churn: 1 },
  { age: 31, income_k: 47, tenure_months: 18, monthly_usage: 30, plan: "pro",   churn: 0 },
  { age: 29, income_k: 30, tenure_months: 3,  monthly_usage: 6,  plan: "basic", churn: 1 },
  { age: 52, income_k: 90, tenure_months: 48, monthly_usage: 60, plan: "pro",   churn: 0 },
  { age: 41, income_k: 65, tenure_months: 30, monthly_usage: 45, plan: "pro",   churn: 0 },
  { age: 22, income_k: 25, tenure_months: 1,  monthly_usage: 4,  plan: "basic", churn: 1 },
  { age: 38, income_k: 58, tenure_months: 20, monthly_usage: 35, plan: "pro",   churn: 0 },
  { age: 27, income_k: 33, tenure_months: 2,  monthly_usage: 7,  plan: "basic", churn: 1 },
  { age: 48, income_k: 85, tenure_months: 40, monthly_usage: 58, plan: "pro",   churn: 0 },
  { age: 40, income_k: 60, tenure_months: 28, monthly_usage: 42, plan: "pro",   churn: 1 },
  { age: 24, income_k: 27, tenure_months: 2,  monthly_usage: 5,  plan: "basic", churn: 1 },
  { age: 44, income_k: 75, tenure_months: 33, monthly_usage: 50, plan: "pro",   churn: 0 },
  { age: 26, income_k: 31, tenure_months: 3,  monthly_usage: 8,  plan: "basic", churn: 1 },
  { age: 36, income_k: 52, tenure_months: 22, monthly_usage: 38, plan: "pro",   churn: 0 },
  { age: 28, income_k: 29, tenure_months: 2,  monthly_usage: 6,  plan: "basic", churn: 1 },
  { age: 50, income_k: 88, tenure_months: 45, monthly_usage: 62, plan: "pro",   churn: 0 },
  { age: 27, income_k: 31, tenure_months: 3,  monthly_usage: 7,  plan: "basic", churn: 0 },
];

const ML_IMPORTS = `from sklearn.model_selection import train_test_split, cross_val_score, KFold, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.naive_bayes import GaussianNB
from sklearn.cluster import KMeans
from sklearn.neural_network import MLPClassifier
from sklearn.dummy import DummyClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, confusion_matrix,
    classification_report, mean_squared_error, root_mean_squared_error,
    mean_absolute_error, r2_score,
)
import numpy as np`;

// Preprocessing builds X/y itself (that's what it teaches), so its setup stops
// at df. Every other pack pre-derives X/y in setup since they all share the
// same feature set and just want to get straight to the algorithm.
const PREPROCESSING_SETUP = `${pdDataFrameLiteral(CUSTOMERS_ROWS)}\n${ML_IMPORTS}`;
const MODEL_SETUP = `${pdDataFrameLiteral(CUSTOMERS_ROWS)}\nX = df[["age", "income_k", "tenure_months", "monthly_usage"]]\ny = df["churn"]\n${ML_IMPORTS}`;

const NEW_CUST = `pd.DataFrame([{"age": 26, "income_k": 30, "tenure_months": 2, "monthly_usage": 6}])`;

// ── Pack 1: Preprocessing ───────────────────────────────────────────────────
const PREPROCESSING: DrillContent = {
  dataKind: "dataframe",
  cumulative: false,
  preloadPackages: ["pandas", "scikit-learn"],
  scenario: {
    title: "Preprocessing — train/test prep",
    role: "20 customers in `df`, a churn label to predict. Before any model sees this data, it needs splitting, scaling, encoding, and a check for gaps.",
    goal: "Each cell is one standard prep move — feature/target split, train_test_split, scaling, one-hot encoding, filling a missing value, checking class balance. Independent reps; write each from memory.",
    outcome: "That's the scikit-learn prep kit — X/y split, train_test_split, StandardScaler, get_dummies, fillna. Every model pack after this assumes data already looks like this.",
    setupCode: PREPROCESSING_SETUP,
    dataset: CUSTOMERS_ROWS,
  },
  cells: [
    { id: "X", task: "Create X — every column except churn (the feature matrix).", why: "Separating features from the target is the first move before any model call — X is what .fit(X, y) expects first.",
      focus: ["age", "income_k", "tenure_months", "monthly_usage", "plan", "churn"], solution: `X = df.drop(columns=["churn"])`,
      assertions: `assert list(X.columns) == ["age", "income_k", "tenure_months", "monthly_usage", "plan"] and len(X) == 20`,
      narrative: `df.drop(columns=["churn"]) returns every column except the target — the feature matrix a model's .fit(X, y) expects as its first argument.`,
      steps: [{ do: "Drop the target column", code: `df.drop(columns=["churn"])` }] },
    { id: "y", task: "Create y — the churn column (the target).", why: "The target stays separate from X — the second argument every .fit(X, y) call expects.",
      focus: ["churn"], solution: `y = df["churn"]`, assertions: `assert set(y) == {0, 1} and len(y) == 20`,
      narrative: `df["churn"] selects just the label column, kept apart from the features.`,
      steps: [{ do: "Select the churn column", code: `df["churn"]` }] },
    { id: "train_size", task: "Create train_size — split X and y into a 75/25 train/test set and note how many rows landed in train.", why: "train_test_split is the standard first move — always evaluate on rows the model never trained on.",
      focus: [], solution: `X_train, X_test, y_train, y_test = train_test_split(df.drop(columns=["churn"]), df["churn"], test_size=0.25, random_state=0)
train_size = len(X_train)`,
      assertions: `assert train_size == 15
assert len(X_test) == 5
assert set(X_train.index) | set(X_test.index) == set(df.index)
assert set(X_train.index) & set(X_test.index) == set()`,
      narrative: `train_test_split(X, y, test_size=0.25, random_state=0) shuffles and splits both X and y together, in matching order; random_state fixes the shuffle so the split is reproducible. train_size confirms 15 of the 20 rows landed in train.`,
      steps: [
        { do: "Split features and target together", code: `train_test_split(X, y, test_size=0.25, random_state=0)` },
        { do: "Unpack the four pieces", code: `X_train, X_test, y_train, y_test = ...` },
      ] },
    { id: "scaled", task: "Create scaled — age and income_k standardised to zero mean, unit variance.", why: "StandardScaler puts features on the same scale — essential for distance- or gradient-based models.",
      focus: ["age", "income_k"], solution: `scaled = StandardScaler().fit_transform(df[["age", "income_k"]])`,
      assertions: `assert scaled.shape == (20, 2)
assert abs(scaled.mean(axis=0)).max() < 1e-8
assert abs(scaled.std(axis=0) - 1).max() < 1e-8`,
      narrative: `StandardScaler().fit_transform(...) subtracts each column's mean and divides by its standard deviation, so every feature ends up centred at 0 with a spread of 1 — the standard numeric prep before distance- or gradient-based models.`,
      steps: [{ do: "Fit a scaler to the two numeric columns", code: `StandardScaler().fit_transform(df[["age", "income_k"]])` }] },
    { id: "encoded", task: "Create encoded — df with plan one-hot encoded (drop the first level).", why: "Models need numbers, not category strings — pd.get_dummies is the standard one-hot encode.",
      focus: ["plan"], solution: `encoded = pd.get_dummies(df, columns=["plan"], drop_first=True)`,
      assertions: `assert "plan_pro" in encoded.columns and "plan" not in encoded.columns
assert int(encoded["plan_pro"].sum()) == 11`,
      narrative: `pd.get_dummies(df, columns=["plan"], drop_first=True) replaces the plan column with plan_pro (1 where the plan is "pro", "basic" left as the reference level) — one-hot encoding without a separate encoder object.`,
      steps: [{ do: "One-hot encode the plan column", code: `pd.get_dummies(df, columns=["plan"], drop_first=True)` }] },
    { id: "filled", task: "Create filled — income_k with one missing value (row 3) imputed with the column mean.", why: "fillna(mean) is the standard, defensible default for a missing numeric value.",
      focus: ["income_k"], solution: `df_missing = df.copy()
df_missing.loc[3, "income_k"] = None
filled = df_missing["income_k"].fillna(df_missing["income_k"].mean())`,
      assertions: `assert filled.isna().sum() == 0
assert round(filled[3], 2) == 52.26`,
      narrative: `Setting row 3's income_k to None simulates a real gap; .fillna(df_missing["income_k"].mean()) replaces just that gap with the column's average, keeping every row usable.`,
      steps: [
        { do: "Blank out one value", code: `df_missing.loc[3, "income_k"] = None` },
        { do: "Fill it with the column mean", code: `.fillna(df_missing["income_k"].mean())` },
      ] },
    { id: "balance", task: "Create balance — the fraction of customers in each churn class, rounded to 2dp.", why: "Checking class balance before modelling tells you whether accuracy alone will be a meaningful metric.",
      focus: ["churn"], solution: `balance = df["churn"].value_counts(normalize=True).round(2)`,
      assertions: `assert balance.to_dict() == {0: 0.55, 1: 0.45}`,
      narrative: `value_counts(normalize=True) turns raw counts into proportions in one call — a quick read on whether your classes are balanced enough for plain accuracy to mean much.`,
      steps: [{ do: "Count each class as a share of the whole", code: `df["churn"].value_counts(normalize=True)` }] },
    { id: "combined", task: "Create combined — X_train with y_train attached as a churn column, for a quick sanity check.", why: "Rejoining features and target on the train split lets you eyeball rows before fitting anything.",
      focus: [], solution: `X_train, X_test, y_train, y_test = train_test_split(df.drop(columns=["churn"]), df["churn"], test_size=0.25, random_state=0)
combined = pd.concat([X_train, y_train], axis=1)`,
      assertions: `assert combined.shape == (15, 6)
assert list(combined.columns) == ["age", "income_k", "tenure_months", "monthly_usage", "plan", "churn"]`,
      narrative: `pd.concat([X_train, y_train], axis=1) glues the split features back to their labels side-by-side — handy for a last look at the train set before fitting.`,
      steps: [{ do: "Split, then glue X_train and y_train back together", code: `pd.concat([X_train, y_train], axis=1)` }] },
    { id: "dropped", task: "Create dropped — the feature matrix without tenure_months.", why: "Dropping a feature by name is how you test whether a model actually needs it.",
      focus: ["tenure_months"], solution: `dropped = df.drop(columns=["churn", "tenure_months"])`,
      assertions: `assert list(dropped.columns) == ["age", "income_k", "monthly_usage", "plan"]`,
      narrative: `df.drop(columns=[...]) accepts a list, so the target and any feature you want to leave out drop in one call.`,
      steps: [{ do: "Drop both the target and a feature", code: `df.drop(columns=["churn", "tenure_months"])` }] },
    { id: "strat_train_counts", task: "Create strat_train_counts — churn class counts in the train split when the split is stratified.", why: "stratify=y keeps the train/test class ratio close to the original — important on imbalanced data.",
      focus: [], solution: `X_train, X_test, y_train, y_test = train_test_split(df.drop(columns=["churn"]), df["churn"], test_size=0.25, random_state=0, stratify=df["churn"])
strat_train_counts = y_train.value_counts().to_dict()`,
      assertions: `assert strat_train_counts == {0: 8, 1: 7}`,
      narrative: `Adding stratify=y makes train_test_split preserve each class's proportion in both splits, instead of leaving it to an unlucky shuffle.`,
      steps: [{ do: "Split, holding the class ratio steady", code: `train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)` }] },
  ],
};

// ── Pack 2: Model validation ────────────────────────────────────────────────
const VALIDATION: DrillContent = {
  dataKind: "dataframe",
  cumulative: false,
  preloadPackages: ["pandas", "scikit-learn"],
  scenario: {
    title: "Model validation — checking a model honestly",
    role: "Same 20 customers, features already split into `X`/`y`. Before trusting any model, validate it properly: a baseline, cross-validation, RMSE, a confusion matrix.",
    goal: "Each cell is one validation move — a dummy baseline, cross_val_score, KFold/StratifiedKFold, RMSE/MAE/R², a confusion matrix, classification_report. Independent reps; write each from memory.",
    outcome: "That's the validation toolkit: a baseline to beat, cross-validated scores instead of one lucky split, RMSE/R² for regression, confusion matrices and reports for classification.",
    setupCode: MODEL_SETUP,
    dataset: CUSTOMERS_ROWS,
  },
  cells: [
    { id: "baseline_acc", task: "Create baseline_acc — the accuracy of a classifier that always predicts the majority class.", why: "A baseline you must beat — if your model can't top this, it isn't learning anything.",
      focus: ["churn"], solution: `baseline = DummyClassifier(strategy="most_frequent")
baseline.fit(X, y)
baseline_acc = baseline.score(X, y)`,
      assertions: `assert baseline_acc == 0.55`,
      narrative: `DummyClassifier(strategy="most_frequent") always guesses the more common class; its .score(X, y) is the accuracy any real model needs to beat to prove it learned something.`,
      steps: [{ do: "Fit a majority-class baseline", code: `DummyClassifier(strategy="most_frequent").fit(X, y)` }, { do: "Score it", code: `.score(X, y)` }] },
    { id: "cv_mean", task: "Create cv_mean — 5-fold cross-validated accuracy of a logistic regression, averaged and rounded to 2dp.", why: "A single train/test split can get lucky or unlucky — cross-validation averages across several splits for a steadier estimate.",
      focus: [], solution: `cv_scores = cross_val_score(LogisticRegression(max_iter=1000), X, y, cv=5)
cv_mean = round(cv_scores.mean(), 2)`,
      assertions: `assert len(cv_scores) == 5
assert cv_mean == 0.9`,
      narrative: `cross_val_score(model, X, y, cv=5) fits and scores the model 5 times, each on a different slice, and hands back all 5 scores; averaging them is far steadier than trusting any single split.`,
      steps: [{ do: "Score across 5 folds", code: `cross_val_score(LogisticRegression(max_iter=1000), X, y, cv=5)` }, { do: "Average the folds", code: `.mean()` }] },
    { id: "fold_sizes", task: "Create fold_sizes — the size of each test fold from a 5-fold KFold split.", why: "KFold is the mechanics cross_val_score runs under the hood — seeing the folds directly builds the intuition.",
      focus: [], solution: `fold_sizes = [len(test_idx) for _, test_idx in KFold(n_splits=5).split(X)]`,
      assertions: `assert fold_sizes == [4, 4, 4, 4, 4]`,
      narrative: `KFold(n_splits=5).split(X) yields 5 (train_idx, test_idx) pairs in turn; with 20 rows split 5 ways, every fold holds out exactly 4.`,
      steps: [{ do: "Split indices into 5 folds", code: `KFold(n_splits=5).split(X)` }, { do: "Take each fold's test size", code: `len(test_idx) for _, test_idx in ...` }] },
    { id: "strat_fold_counts", task: "Create strat_fold_counts — each fold's churn class counts under a stratified 5-fold split.", why: "StratifiedKFold keeps each fold's class mix close to the whole dataset's — plain KFold doesn't guarantee that.",
      focus: [], solution: `strat_fold_counts = [y.iloc[test_idx].value_counts().to_dict() for _, test_idx in StratifiedKFold(n_splits=5).split(X, y)]`,
      assertions: `assert len(strat_fold_counts) == 5
assert all(sum(c.values()) == 4 for c in strat_fold_counts)`,
      narrative: `StratifiedKFold(n_splits=5).split(X, y) — note it takes y too — balances each fold's class mix, so no fold ends up missing one of your classes.`,
      steps: [{ do: "Split with class balance preserved", code: `StratifiedKFold(n_splits=5).split(X, y)` }] },
    { id: "rmse", task: "Create rmse — the root-mean-squared error of a linear regression predicting monthly_usage from tenure_months.", why: "RMSE is the standard headline error metric for a regression — same units as the target, big misses punished harder.",
      focus: ["tenure_months", "monthly_usage"], solution: `reg = LinearRegression()
reg.fit(X[["tenure_months"]], df["monthly_usage"])
preds = reg.predict(X[["tenure_months"]])
rmse = round(root_mean_squared_error(df["monthly_usage"], preds), 2)`,
      assertions: `assert rmse == 2.84`,
      narrative: `root_mean_squared_error(actual, predicted) squares each miss, averages them, then square-roots back to the target's own units — big misses are penalised more than small ones.`,
      steps: [{ do: "Fit and predict", code: `reg.fit(...); reg.predict(...)` }, { do: "Score the misses", code: `root_mean_squared_error(actual, preds)` }] },
    { id: "r2", task: "Create r2 — the R² of that same regression, rounded to 3dp.", why: "R² answers \"how much of the variance did the model explain\" — a scale-free companion to RMSE.",
      focus: ["tenure_months", "monthly_usage"], solution: `reg = LinearRegression()
reg.fit(X[["tenure_months"]], df["monthly_usage"])
preds = reg.predict(X[["tenure_months"]])
r2 = round(r2_score(df["monthly_usage"], preds), 3)`,
      assertions: `assert r2 == 0.983`,
      narrative: `r2_score(actual, predicted) is 1 minus the ratio of leftover error to the target's total variance — 0.983 means tenure_months alone explains 98.3% of the spread in monthly_usage here.`,
      steps: [{ do: "Fit, predict", code: `reg.fit(...)` }, { do: "Score the fit", code: `r2_score(actual, preds)` }] },
    { id: "cm", task: "Create cm — the confusion matrix of a logistic regression evaluated on a held-out test split.", why: "Accuracy hides WHICH mistakes a model makes — a confusion matrix breaks it down by predicted vs actual class.",
      focus: [], solution: `X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0)
clf = LogisticRegression(max_iter=1000)
clf.fit(X_train, y_train)
cm = confusion_matrix(y_test, clf.predict(X_test)).tolist()`,
      assertions: `assert cm == [[2, 1], [0, 2]]`,
      narrative: `confusion_matrix(actual, predicted) counts every combination of true class vs predicted class in a grid — the diagonal is correct, everything off it is a specific kind of mistake (here, one false positive).`,
      steps: [{ do: "Fit on train, predict on test", code: `clf.fit(X_train, y_train); clf.predict(X_test)` }, { do: "Tabulate actual vs predicted", code: `confusion_matrix(y_test, ...)` }] },
    { id: "test_report", task: "Create test_report — the precision/recall/F1 report for that same test-set evaluation.", why: "classification_report gives per-class precision/recall/F1 in one call — the fuller picture beyond accuracy.",
      focus: [], solution: `X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0)
clf = LogisticRegression(max_iter=1000)
clf.fit(X_train, y_train)
test_report = classification_report(y_test, clf.predict(X_test), output_dict=True)`,
      assertions: `assert round(test_report["accuracy"], 2) == 0.8
assert round(test_report["1"]["recall"], 2) == 1.0`,
      narrative: `classification_report(actual, predicted, output_dict=True) returns precision/recall/F1 per class plus overall accuracy as a dict — output_dict=True is what makes it script-friendly instead of print-only.`,
      steps: [{ do: "Predict on the held-out test set", code: `clf.predict(X_test)` }, { do: "Build the report", code: `classification_report(y_test, ..., output_dict=True)` }] },
    { id: "cv_rmse", task: "Create cv_rmse — the 5-fold cross-validated RMSE of the tenure_months regression, rounded to 2dp.", why: "Cross-validating a regression's RMSE, not just a single split, is the honest way to report error.",
      focus: ["tenure_months", "monthly_usage"], solution: `neg_rmse = cross_val_score(LinearRegression(), X[["tenure_months"]], df["monthly_usage"], cv=5, scoring="neg_root_mean_squared_error")
cv_rmse = round(-neg_rmse.mean(), 2)`,
      assertions: `assert cv_rmse == 2.99`,
      narrative: `scikit-learn's scorers are "higher is better", so RMSE is exposed as its negative; cross_val_score(..., scoring="neg_root_mean_squared_error") averages 5 folds, and flipping the sign back gives the cross-validated RMSE.`,
      steps: [{ do: "Cross-validate the negative RMSE", code: `cross_val_score(..., scoring="neg_root_mean_squared_error")` }, { do: "Average and flip the sign", code: `round(-scores.mean(), 2)` }] },
  ],
};

// ── Pack 3: Decision trees ───────────────────────────────────────────────────
const DECISION_TREES: DrillContent = {
  dataKind: "dataframe",
  cumulative: false,
  preloadPackages: ["pandas", "scikit-learn"],
  scenario: {
    title: "Decision trees — fit, read, and query",
    role: "Same 20 customers, `X`/`y` ready. A decision tree splits on one feature at a time — readable rules, not a black box.",
    goal: "Each cell fits a DecisionTreeClassifier and reads one thing off it — depth, leaves, feature importance, the rules as text, a prediction. Independent reps; write each from memory.",
    outcome: "That's a decision tree end-to-end: fit, measure its shape, see which feature drove it, read its rules as plain text, and use it to predict.",
    setupCode: MODEL_SETUP,
    dataset: CUSTOMERS_ROWS,
  },
  cells: [
    { id: "depth", task: "Fit a depth-3 decision tree on X, y and create depth — how deep it actually grew.", why: "max_depth is a cap, not a guarantee — the tree may stop earlier if it runs out of useful splits.",
      focus: [], solution: `tree = DecisionTreeClassifier(max_depth=3, random_state=0)
tree.fit(X, y)
depth = tree.get_depth()`,
      assertions: `assert depth == 3`,
      narrative: `DecisionTreeClassifier(max_depth=3).fit(X, y) grows the tree; .get_depth() reads back how many levels it actually used.`,
      steps: [{ do: "Fit a capped tree", code: `DecisionTreeClassifier(max_depth=3, random_state=0).fit(X, y)` }, { do: "Read its depth", code: `.get_depth()` }] },
    { id: "n_leaves", task: "Fit the same tree and create n_leaves — how many leaves it has.", why: "Leaves are the tree's final buckets — more leaves means a more finely-carved decision surface.",
      focus: [], solution: `tree = DecisionTreeClassifier(max_depth=3, random_state=0)
tree.fit(X, y)
n_leaves = tree.get_n_leaves()`,
      assertions: `assert n_leaves == 6`,
      narrative: `.get_n_leaves() counts the tree's terminal nodes — each one a distinct rule path ending in a prediction.`,
      steps: [{ do: "Fit the tree", code: `tree.fit(X, y)` }, { do: "Count its leaves", code: `.get_n_leaves()` }] },
    { id: "importances", task: "Fit the tree and create importances — each feature's importance, rounded to 2dp, as a {feature: score} dict.", why: "feature_importances_ shows which columns actually drove the splits — the tree's own read on what mattered.",
      focus: [], solution: `tree = DecisionTreeClassifier(max_depth=3, random_state=0)
tree.fit(X, y)
importances = {col: round(float(imp), 2) for col, imp in zip(X.columns, tree.feature_importances_)}`,
      assertions: `assert importances == {"age": 0.04, "income_k": 0.71, "tenure_months": 0.07, "monthly_usage": 0.18}`,
      narrative: `tree.feature_importances_ scores each feature by how much it reduced impurity across all its splits; zipping it with the column names turns the array into a readable dict.`,
      steps: [{ do: "Pair each column with its importance", code: `zip(X.columns, tree.feature_importances_)` }] },
    { id: "top_feature", task: "Fit the tree and create top_feature — the name of the single most important feature.", why: "argmax on the importances array picks out the biggest driver directly.",
      focus: [], solution: `tree = DecisionTreeClassifier(max_depth=3, random_state=0)
tree.fit(X, y)
top_feature = X.columns[tree.feature_importances_.argmax()]`,
      assertions: `assert top_feature == "income_k"`,
      narrative: `.argmax() on the importances array gives the position of the biggest score; indexing X.columns with it names that feature.`,
      steps: [{ do: "Find the biggest importance's position", code: `tree.feature_importances_.argmax()` }, { do: "Name that column", code: `X.columns[ ... ]` }] },
    { id: "tree_acc", task: "Fit the tree and create tree_acc — its training accuracy, rounded to 2dp.", why: "Training accuracy is the quickest sanity check that a model learned the data it saw.",
      focus: [], solution: `tree = DecisionTreeClassifier(max_depth=3, random_state=0)
tree.fit(X, y)
tree_acc = round(accuracy_score(y, tree.predict(X)), 2)`,
      assertions: `assert tree_acc == 0.95`,
      narrative: `accuracy_score(actual, predicted) is the fraction of rows the tree got right — a starting sanity check before trusting it on new data.`,
      steps: [{ do: "Predict on the training rows", code: `tree.predict(X)` }, { do: "Score against actual", code: `accuracy_score(y, ...)` }] },
    { id: "new_pred", task: "Fit the tree and create new_pred — its prediction for a brand-new customer (age 26, income 30k, 2 months tenure, 6 units usage).", why: "Predicting on a single new row is exactly what a deployed model does — one row in, one label out.",
      focus: [], solution: `tree = DecisionTreeClassifier(max_depth=3, random_state=0)
tree.fit(X, y)
new_cust = ${NEW_CUST}
new_pred = int(tree.predict(new_cust)[0])`,
      assertions: `assert new_pred == 1`,
      narrative: `.predict() takes a DataFrame with the same columns as X, even for a single row; [0] pulls that one prediction out of the returned array.`,
      steps: [{ do: "Build a one-row DataFrame for the new customer", code: `pd.DataFrame([{...}])` }, { do: "Predict on it", code: `tree.predict(new_cust)[0]` }] },
    { id: "rule_lines", task: "Fit the tree and create rule_lines — its decision rules as text, split into lines.", why: "export_text renders the tree's actual if/else logic — the whole point of a tree over a black-box model.",
      focus: [], solution: `tree = DecisionTreeClassifier(max_depth=3, random_state=0)
tree.fit(X, y)
rule_lines = export_text(tree, feature_names=list(X.columns)).strip().splitlines()`,
      assertions: `assert len(rule_lines) == 16
assert rule_lines[0] == "|--- income_k <= 40.00"`,
      narrative: `export_text(tree, feature_names=...) prints the tree as nested if/else text, one line per branch — the readable rules a linear model or neural net can't hand you.`,
      steps: [{ do: "Render the tree as text", code: `export_text(tree, feature_names=list(X.columns))` }, { do: "Split into lines", code: `.strip().splitlines()` }] },
    { id: "depth1_acc", task: "Fit a depth-1 tree (a single split) and create depth1_acc — its training accuracy, rounded to 2dp.", why: "Comparing a stump to the deeper tree shows how much each extra split is actually buying you.",
      focus: [], solution: `stump = DecisionTreeClassifier(max_depth=1, random_state=0)
stump.fit(X, y)
depth1_acc = round(accuracy_score(y, stump.predict(X)), 2)`,
      assertions: `assert depth1_acc == 0.9`,
      narrative: `A single split (max_depth=1) already gets to 90% here — the two extra levels in the depth-3 tree buy back the last 5 percentage points on the two "hard case" rows.`,
      steps: [{ do: "Fit a one-split tree", code: `DecisionTreeClassifier(max_depth=1, random_state=0).fit(X, y)` }, { do: "Score it", code: `accuracy_score(y, stump.predict(X))` }] },
  ],
};

// ── Pack 4: Naive Bayes ──────────────────────────────────────────────────────
const NAIVE_BAYES: DrillContent = {
  dataKind: "dataframe",
  cumulative: false,
  preloadPackages: ["pandas", "scikit-learn"],
  scenario: {
    title: "Naive Bayes — a fast probabilistic classifier",
    role: "Same 20 customers, `X`/`y` ready. GaussianNB assumes each feature is normally distributed within a class — cheap to fit, surprisingly hard to beat as a baseline.",
    goal: "Each cell fits a GaussianNB and reads one thing off it — accuracy, class priors, a probability, a prediction on held-out data. Independent reps; write each from memory.",
    outcome: "That's Naive Bayes end-to-end: fit, read its learned priors, get a probability instead of just a label, and validate it on unseen rows.",
    setupCode: MODEL_SETUP,
    dataset: CUSTOMERS_ROWS,
  },
  cells: [
    { id: "nb_acc", task: "Fit a GaussianNB on X, y and create nb_acc — its training accuracy, rounded to 2dp.", why: ".fit then .predict is the same two-call shape as every other scikit-learn classifier.",
      focus: [], solution: `nb = GaussianNB()
nb.fit(X, y)
nb_acc = round(accuracy_score(y, nb.predict(X)), 2)`,
      assertions: `assert nb_acc == 0.9`,
      narrative: `GaussianNB().fit(X, y) fits one Gaussian per feature per class; accuracy_score against its own predictions is the quick sanity check.`,
      steps: [{ do: "Fit the classifier", code: `GaussianNB().fit(X, y)` }, { do: "Score it", code: `accuracy_score(y, nb.predict(X))` }] },
    { id: "class_prior", task: "Fit the model and create class_prior — the learned prior probability of each class, rounded to 2dp, as {class: prob}.", why: "class_prior_ is what the model believed about each class BEFORE looking at any features — the base rate it starts from.",
      focus: ["churn"], solution: `nb = GaussianNB()
nb.fit(X, y)
class_prior = {int(c): round(float(p), 2) for c, p in zip(nb.classes_, nb.class_prior_)}`,
      assertions: `assert class_prior == {0: 0.55, 1: 0.45}`,
      narrative: `nb.class_prior_ is just each class's share of the training data; zipping it with nb.classes_ labels which probability belongs to which class.`,
      steps: [{ do: "Pair each class with its prior", code: `zip(nb.classes_, nb.class_prior_)` }] },
    { id: "nb_new_pred", task: "Fit the model and create nb_new_pred — its prediction for a brand-new customer (age 26, income 30k, 2 months tenure, 6 units usage).", why: "Same predict() call shape as every other scikit-learn model — the API is consistent across algorithms.",
      focus: [], solution: `nb = GaussianNB()
nb.fit(X, y)
new_cust = ${NEW_CUST}
nb_new_pred = int(nb.predict(new_cust)[0])`,
      assertions: `assert nb_new_pred == 1`,
      narrative: `Same predict() call as the decision tree and logistic regression cells — the model changes, the calling shape doesn't.`,
      steps: [{ do: "Predict on the new row", code: `nb.predict(new_cust)[0]` }] },
    { id: "nb_new_proba", task: "Fit the model and create nb_new_proba — the predicted probability that the new customer churns, rounded to 2dp.", why: "predict_proba is the payoff of a probabilistic model — a confidence, not just a label.",
      focus: [], solution: `nb = GaussianNB()
nb.fit(X, y)
new_cust = ${NEW_CUST}
nb_new_proba = round(float(nb.predict_proba(new_cust)[0][1]), 2)`,
      assertions: `assert nb_new_proba == 1.0`,
      narrative: `.predict_proba() returns [P(class 0), P(class 1)] for each row; [0][1] takes the first row's probability of the positive class — the model isn't just saying "churn", it's saying how sure it is.`,
      steps: [{ do: "Get class probabilities", code: `nb.predict_proba(new_cust)` }, { do: "Take P(churn) for the first row", code: `[0][1]` }] },
    { id: "means", task: "Fit the model and create means — the learned average of each feature within the churned class (class 1), rounded to 1dp.", why: "theta_ is what GaussianNB actually learned — the mean of each feature, per class, that its Gaussian is centred on.",
      focus: [], solution: `nb = GaussianNB()
nb.fit(X, y)
means = {col: round(float(m), 1) for col, m in zip(X.columns, nb.theta_[1])}`,
      assertions: `assert means == {"age": 27.1, "income_k": 32.8, "tenure_months": 4.9, "monthly_usage": 9.6}`,
      narrative: `nb.theta_ holds each class's per-feature mean (row 1 is the churned class here); this is the actual "model" inside Naive Bayes — a mean and variance per feature per class, nothing more.`,
      steps: [{ do: "Read the churned class's feature means", code: `nb.theta_[1]` }] },
    { id: "nb_test_acc", task: "Split X, y 75/25, fit a fresh GaussianNB on the train set, and create nb_test_acc — accuracy on the held-out test set, rounded to 2dp.", why: "Training accuracy flatters every model — a held-out test set is the honest number.",
      focus: [], solution: `X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0)
nb2 = GaussianNB()
nb2.fit(X_train, y_train)
nb_test_acc = round(accuracy_score(y_test, nb2.predict(X_test)), 2)`,
      assertions: `assert nb_test_acc == 0.8`,
      narrative: `Fitting only on X_train and scoring on X_test — rows the model never saw — is the honest evaluation the training-accuracy cells above skip.`,
      steps: [{ do: "Fit on train only", code: `nb2.fit(X_train, y_train)` }, { do: "Score on held-out test", code: `accuracy_score(y_test, nb2.predict(X_test))` }] },
  ],
};

// ── Pack 5: K-means clustering ───────────────────────────────────────────────
const KMEANS: DrillContent = {
  dataKind: "dataframe",
  cumulative: false,
  preloadPackages: ["pandas", "scikit-learn"],
  scenario: {
    title: "K-means — grouping customers with no labels",
    role: "Same 20 customers, but this time forget churn — k-means groups rows by how similar their tenure and usage are, with no target at all.",
    goal: "Each cell fits a KMeans on scaled tenure/usage and reads one thing off it — cluster sizes, inertia, which cluster is the \"loyal\" one, an elbow curve. Independent reps; write each from memory.",
    outcome: "That's k-means end-to-end: scale first, fit, name the clusters by what's actually in them, assign a new point, and use inertia to sanity-check k.",
    setupCode: MODEL_SETUP,
    dataset: CUSTOMERS_ROWS,
  },
  cells: [
    { id: "cluster_sizes", task: "Scale tenure_months and monthly_usage, fit KMeans with 2 clusters, and create cluster_sizes — how many customers landed in each cluster.", why: "Clustering starts with scaling — otherwise a feature with a bigger numeric range silently dominates the distance calculation.",
      focus: ["tenure_months", "monthly_usage"], solution: `Xk_scaled = StandardScaler().fit_transform(X[["tenure_months", "monthly_usage"]])
km = KMeans(n_clusters=2, random_state=0, n_init=10)
labels = km.fit_predict(Xk_scaled)
cluster_sizes = np.bincount(labels).tolist()`,
      assertions: `assert cluster_sizes == [9, 11]`,
      narrative: `StandardScaler first, so tenure and usage count equally; KMeans(n_clusters=2).fit_predict(...) assigns every row a cluster label; np.bincount counts how many landed in each.`,
      steps: [
        { do: "Scale the two features", code: `StandardScaler().fit_transform(X[["tenure_months", "monthly_usage"]])` },
        { do: "Fit and assign clusters", code: `KMeans(n_clusters=2, random_state=0, n_init=10).fit_predict(...)` },
        { do: "Count each cluster's size", code: `np.bincount(labels)` },
      ] },
    { id: "inertia", task: "Fit the same KMeans and create inertia — the model's inertia, rounded to 2dp.", why: "Inertia is the total squared distance from every point to its cluster's centre — the number k-means is actually minimising.",
      focus: [], solution: `Xk_scaled = StandardScaler().fit_transform(X[["tenure_months", "monthly_usage"]])
km = KMeans(n_clusters=2, random_state=0, n_init=10)
km.fit(Xk_scaled)
inertia = round(float(km.inertia_), 2)`,
      assertions: `assert inertia == 6.43`,
      narrative: `km.inertia_ is the sum of squared distances from each point to its assigned centroid — lower means tighter, more distinct clusters.`,
      steps: [{ do: "Fit the model", code: `km.fit(Xk_scaled)` }, { do: "Read its inertia", code: `km.inertia_` }] },
    { id: "loyal_cluster", task: "Fit the same KMeans and create loyal_cluster — whichever cluster label has the higher average tenure_months.", why: "K-means only gives you cluster NUMBERS — you have to look at what's inside each one to name it.",
      focus: ["tenure_months"], solution: `Xk = X[["tenure_months", "monthly_usage"]]
Xk_scaled = StandardScaler().fit_transform(Xk)
km = KMeans(n_clusters=2, random_state=0, n_init=10)
labels = km.fit_predict(Xk_scaled)
cluster_tenure_means = [Xk["tenure_months"][labels == c].mean() for c in range(2)]
loyal_cluster = int(np.argmax(cluster_tenure_means))`,
      assertions: `assert loyal_cluster == 1`,
      narrative: `Cluster labels (0, 1, …) carry no inherent meaning — comparing each cluster's average tenure and taking the argmax is how you translate "cluster 1" into "the loyal group".`,
      steps: [
        { do: "Average tenure within each cluster", code: `Xk["tenure_months"][labels == c].mean() for c in range(2)` },
        { do: "Pick the higher-tenure cluster", code: `np.argmax(cluster_tenure_means)` },
      ] },
    { id: "new_cluster", task: "Fit the same KMeans and create new_cluster — which cluster a brand-new, 2-month, 5-usage customer gets assigned to.", why: "A fitted KMeans can place a new point without refitting — .predict works on cluster models too, not just classifiers.",
      focus: [], solution: `Xk = X[["tenure_months", "monthly_usage"]]
scaler = StandardScaler().fit(Xk)
km = KMeans(n_clusters=2, random_state=0, n_init=10)
km.fit(scaler.transform(Xk))
new_point = scaler.transform(pd.DataFrame([{"tenure_months": 2, "monthly_usage": 5}]))
new_cluster = int(km.predict(new_point)[0])`,
      assertions: `assert new_cluster == 0`,
      narrative: `Fitting the scaler once and reusing it (scaler.transform) keeps the new point on the same scale as the training data; km.predict then measures its distance to each existing centroid — this customer lands with the low-tenure group, not the loyal one.`,
      steps: [
        { do: "Scale the new point with the SAME fitted scaler", code: `scaler.transform(pd.DataFrame([{...}]))` },
        { do: "Assign it to the nearest centroid", code: `km.predict(new_point)` },
      ] },
    { id: "inertias", task: "Fit KMeans for k = 1, 2, 3, 4 on the scaled features and create inertias — each one's inertia, rounded to 1dp, as a list in order.", why: "Plotting inertia against k is the elbow method — the standard way to pick how many clusters to use.",
      focus: ["tenure_months", "monthly_usage"], solution: `Xk_scaled = StandardScaler().fit_transform(X[["tenure_months", "monthly_usage"]])
inertias = []
for k in [1, 2, 3, 4]:
    km_k = KMeans(n_clusters=k, random_state=0, n_init=10)
    km_k.fit(Xk_scaled)
    inertias.append(round(float(km_k.inertia_), 1))`,
      assertions: `assert inertias == [40.0, 6.4, 1.5, 0.7]`,
      narrative: `Inertia always falls as k grows (more centroids can only fit tighter); the "elbow" — where it stops falling sharply — is the traditional read on a reasonable k. Here it drops hugely from 1 to 2 clusters, then tapers off.`,
      steps: [{ do: "Fit KMeans for each candidate k", code: `for k in [1, 2, 3, 4]: KMeans(n_clusters=k, ...).fit(...)` }, { do: "Collect each inertia", code: `inertias.append(round(km_k.inertia_, 1))` }] },
  ],
};

// ── Pack 6: Logistic regression ──────────────────────────────────────────────
const LOGISTIC_REGRESSION: DrillContent = {
  dataKind: "dataframe",
  cumulative: false,
  preloadPackages: ["pandas", "scikit-learn"],
  scenario: {
    title: "Logistic regression — a classifier you can interpret",
    role: "Same 20 customers, `X`/`y` ready. Logistic regression fits a linear boundary and gives you both a prediction AND a probability behind it.",
    goal: "Each cell fits a LogisticRegression and reads one thing off it — accuracy, a coefficient's sign, an odds ratio, a probability, a held-out test score. Independent reps; write each from memory.",
    outcome: "That's logistic regression end-to-end: fit, interpret a coefficient's direction, turn it into an odds ratio, get a probability instead of just a label, and validate on unseen rows.",
    setupCode: MODEL_SETUP,
    dataset: CUSTOMERS_ROWS,
  },
  cells: [
    { id: "lr_acc", task: "Fit a LogisticRegression on X, y and create lr_acc — its training accuracy, rounded to 2dp.", why: "Same fit/predict/score shape as every other scikit-learn classifier — logistic regression just draws a linear boundary instead of splitting on thresholds.",
      focus: [], solution: `model = LogisticRegression(max_iter=1000)
model.fit(X, y)
lr_acc = round(accuracy_score(y, model.predict(X)), 2)`,
      assertions: `assert lr_acc == 0.9`,
      narrative: `max_iter=1000 gives the solver enough steps to converge on this small dataset; .fit(X, y) then .predict(X) is the same two-call shape as any other classifier.`,
      steps: [{ do: "Fit the model", code: `LogisticRegression(max_iter=1000).fit(X, y)` }, { do: "Score it", code: `accuracy_score(y, model.predict(X))` }] },
    { id: "income_sign", task: "Fit the model and create income_sign — the sign of income_k's coefficient (1 or -1).", why: "A coefficient's SIGN tells you the direction of its pull on the outcome, independent of its exact size.",
      focus: ["income_k"], solution: `model = LogisticRegression(max_iter=1000)
model.fit(X, y)
income_idx = list(X.columns).index("income_k")
income_sign = int(np.sign(model.coef_[0][income_idx]))`,
      assertions: `assert income_sign == -1`,
      narrative: `model.coef_[0] holds one coefficient per feature, in column order; a negative sign on income_k means higher income pulls the prediction toward "no churn" — exactly the intuitive direction.`,
      steps: [{ do: "Find income_k's position among the columns", code: `list(X.columns).index("income_k")` }, { do: "Read that coefficient's sign", code: `np.sign(model.coef_[0][ ... ])` }] },
    { id: "odds_income", task: "Fit the model and create odds_income — income_k's coefficient converted to an odds ratio, rounded to 2dp.", why: "exp(coefficient) is how you turn a raw logistic-regression coefficient into something interpretable: a multiplier on the odds.",
      focus: ["income_k"], solution: `model = LogisticRegression(max_iter=1000)
model.fit(X, y)
income_idx = list(X.columns).index("income_k")
odds_income = round(float(np.exp(model.coef_[0][income_idx])), 2)`,
      assertions: `assert odds_income == 0.77`,
      narrative: `np.exp(coefficient) converts the log-odds scale logistic regression fits internally into an odds ratio: 0.77 means each extra $1k of income multiplies the odds of churning by about 0.77 — a 23% reduction.`,
      steps: [{ do: "Exponentiate the coefficient", code: `np.exp(model.coef_[0][income_idx])` }] },
    { id: "lr_new_proba", task: "Fit the model and create lr_new_proba — the predicted probability that a brand-new customer (age 26, income 30k, 2 months tenure, 6 units usage) churns, rounded to 2dp.", why: "predict_proba is the whole reason to reach for logistic regression over a plain classifier — a calibrated probability, not just a label.",
      focus: [], solution: `model = LogisticRegression(max_iter=1000)
model.fit(X, y)
new_cust = ${NEW_CUST}
lr_new_proba = round(float(model.predict_proba(new_cust)[0][1]), 2)`,
      assertions: `assert lr_new_proba == 0.88`,
      narrative: `.predict_proba(new_cust)[0][1] gives P(churn) for the first (only) row — 0.88 is a much more useful answer to "how worried should we be" than a bare 0/1 label.`,
      steps: [{ do: "Get class probabilities for the new row", code: `model.predict_proba(new_cust)` }, { do: "Take P(churn)", code: `[0][1]` }] },
    { id: "lr_test_acc", task: "Split X, y 75/25, fit a fresh LogisticRegression on the train set, and create lr_test_acc — accuracy on the held-out test set, rounded to 2dp.", why: "Training accuracy flatters every model — a held-out test set is the number that actually matters.",
      focus: [], solution: `X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0)
model2 = LogisticRegression(max_iter=1000)
model2.fit(X_train, y_train)
lr_test_acc = round(accuracy_score(y_test, model2.predict(X_test)), 2)`,
      assertions: `assert lr_test_acc == 0.8`,
      narrative: `Fitting on X_train only and scoring on X_test — rows the model never saw — is the honest evaluation; it's lower than the training accuracy above, which is expected.`,
      steps: [{ do: "Fit on train only", code: `model2.fit(X_train, y_train)` }, { do: "Score on held-out test", code: `accuracy_score(y_test, model2.predict(X_test))` }] },
    { id: "n_churn_pred", task: "Fit the model on X, y and create n_churn_pred — how many customers it predicts will churn.", why: "Summing a 0/1 prediction array is the fast way to count how many rows landed in the positive class.",
      focus: [], solution: `model = LogisticRegression(max_iter=1000)
model.fit(X, y)
n_churn_pred = int(model.predict(X).sum())`,
      assertions: `assert n_churn_pred == 9`,
      narrative: `model.predict(X) returns an array of 0s and 1s; summing it counts the 1s — a quick read on how many the model flags, to compare against the actual 9 churners in the data.`,
      steps: [{ do: "Predict on every row", code: `model.predict(X)` }, { do: "Sum the 1s", code: `.sum()` }] },
  ],
};

// ── Pack 7: Neural network construct ─────────────────────────────────────────
const NEURAL_NETWORK: DrillContent = {
  dataKind: "dataframe",
  cumulative: false,
  preloadPackages: ["pandas", "scikit-learn"],
  scenario: {
    title: "Neural network — a small MLP from scikit-learn",
    role: "Same 20 customers, `X`/`y` ready. MLPClassifier is scikit-learn's feed-forward neural net — a stack of weighted layers trained by gradient descent, same .fit/.predict shape as everything else.",
    goal: "Each cell fits a small MLPClassifier and reads one thing off it — accuracy, its layer count, whether it converged, weight-matrix shapes, a prediction. Independent reps; write each from memory.",
    outcome: "That's an MLP end-to-end: scale first (neural nets are sensitive to feature scale), fit, check it actually converged, inspect its shape, and predict.",
    setupCode: MODEL_SETUP,
    dataset: CUSTOMERS_ROWS,
  },
  cells: [
    { id: "mlp_acc", task: "Scale X, fit an MLPClassifier with one 8-unit hidden layer, and create mlp_acc — training accuracy, rounded to 2dp.", why: "Neural nets train by gradient descent on the input scale, so unscaled features (age in years vs income in thousands) would badly skew learning.",
      focus: [], solution: `Xs = StandardScaler().fit_transform(X)
mlp = MLPClassifier(hidden_layer_sizes=(8,), max_iter=2000, random_state=0)
mlp.fit(Xs, y)
mlp_acc = round(accuracy_score(y, mlp.predict(Xs)), 2)`,
      assertions: `assert mlp_acc == 0.9`,
      narrative: `hidden_layer_sizes=(8,) means one hidden layer of 8 neurons; scaling first (StandardScaler) is standard practice for any gradient-trained model, not just this one.`,
      steps: [
        { do: "Scale the features", code: `StandardScaler().fit_transform(X)` },
        { do: "Fit a one-hidden-layer network", code: `MLPClassifier(hidden_layer_sizes=(8,), max_iter=2000, random_state=0).fit(Xs, y)` },
      ] },
    { id: "n_layers", task: "Fit the same network and create n_layers — its total layer count (input + hidden + output).", why: "n_layers_ counts every layer scikit-learn built, not just the hidden ones you asked for.",
      focus: [], solution: `Xs = StandardScaler().fit_transform(X)
mlp = MLPClassifier(hidden_layer_sizes=(8,), max_iter=2000, random_state=0)
mlp.fit(Xs, y)
n_layers = mlp.n_layers_`,
      assertions: `assert n_layers == 3`,
      narrative: `n_layers_ counts input + hidden + output — one hidden_layer_sizes entry means 1 hidden layer, so 3 total (input, hidden, output).`,
      steps: [{ do: "Read the layer count", code: `mlp.n_layers_` }] },
    { id: "converged", task: "Fit the same network and create converged — whether it stopped before hitting the max_iter cap.", why: "A network that hits max_iter without converging is a real risk sign — you'd want to raise the cap or check the data.",
      focus: [], solution: `Xs = StandardScaler().fit_transform(X)
mlp = MLPClassifier(hidden_layer_sizes=(8,), max_iter=2000, random_state=0)
mlp.fit(Xs, y)
converged = bool(mlp.n_iter_ < 2000)`,
      assertions: `assert converged is True`,
      narrative: `mlp.n_iter_ is how many training iterations it actually ran; if that number equals max_iter, the solver was cut off before it finished improving — this run stopped well short of the cap.`,
      steps: [{ do: "Compare iterations run to the cap", code: `mlp.n_iter_ < 2000` }] },
    { id: "coef_shapes", task: "Fit the same network and create coef_shapes — the shape of each weight matrix, as a list of [rows, cols].", why: "coefs_ is the network's actual learned parameters — one weight matrix per layer transition.",
      focus: [], solution: `Xs = StandardScaler().fit_transform(X)
mlp = MLPClassifier(hidden_layer_sizes=(8,), max_iter=2000, random_state=0)
mlp.fit(Xs, y)
coef_shapes = [list(c.shape) for c in mlp.coefs_]`,
      assertions: `assert coef_shapes == [[4, 8], [8, 1]]`,
      narrative: `mlp.coefs_ is a list of weight matrices, one per layer transition: [4, 8] connects the 4 input features to the 8 hidden units, [8, 1] connects those 8 units to the single output.`,
      steps: [{ do: "Read each weight matrix's shape", code: `c.shape for c in mlp.coefs_` }] },
    { id: "mlp_new_pred", task: "Fit the same network, scale a brand-new customer (age 26, income 30k, 2 months tenure, 6 units usage) with the SAME scaler, and create mlp_new_pred — its prediction.", why: "Reusing the fitted scaler (not a fresh one) is essential — a new StandardScaler on one row would have nothing to scale against.",
      focus: [], solution: `scaler = StandardScaler().fit(X)
Xs = scaler.transform(X)
mlp = MLPClassifier(hidden_layer_sizes=(8,), max_iter=2000, random_state=0)
mlp.fit(Xs, y)
new_cust = ${NEW_CUST}
new_cust_scaled = scaler.transform(new_cust)
mlp_new_pred = int(mlp.predict(new_cust_scaled)[0])`,
      assertions: `assert mlp_new_pred == 1`,
      narrative: `scaler.transform(new_cust) applies the SAME mean/scale learned from training — never refit a scaler on a single new row, or it has no spread to standardise against.`,
      steps: [
        { do: "Fit the scaler once, on training data", code: `StandardScaler().fit(X)` },
        { do: "Reuse it to scale the new row", code: `scaler.transform(new_cust)` },
        { do: "Predict on the scaled row", code: `mlp.predict(new_cust_scaled)[0]` },
      ] },
    { id: "small_acc", task: "Fit a smaller network (4 hidden units instead of 8) and create small_acc — its training accuracy, rounded to 2dp.", why: "Comparing hidden-layer sizes shows whether the extra capacity of a bigger network is actually buying anything on this data.",
      focus: [], solution: `Xs = StandardScaler().fit_transform(X)
mlp_small = MLPClassifier(hidden_layer_sizes=(4,), max_iter=2000, random_state=0)
mlp_small.fit(Xs, y)
small_acc = round(accuracy_score(y, mlp_small.predict(Xs)), 2)`,
      assertions: `assert small_acc == 0.9`,
      narrative: `Half the hidden units (4 instead of 8) reaches the same 0.9 accuracy here — on a small, simple dataset like this, more capacity doesn't automatically mean a better fit.`,
      steps: [{ do: "Fit a smaller network", code: `MLPClassifier(hidden_layer_sizes=(4,), max_iter=2000, random_state=0).fit(Xs, y)` }] },
  ],
};

export const ML_PACKS: DrillPack[] = [
  { id: "preprocessing", title: "Preprocessing", blurb: "Feature/target splits, scaling, one-hot encoding, filling gaps. 10 reps.", tag: "scikit-learn", lang: "python", content: PREPROCESSING },
  { id: "validation", title: "Model validation", blurb: "Cross-validation, RMSE/R², confusion matrices — checking a model honestly.", tag: "scikit-learn", lang: "python", content: VALIDATION },
  { id: "decision-trees", title: "Decision trees", blurb: "Fit, read, and query a DecisionTreeClassifier — depth, importances, rules as text.", tag: "scikit-learn", lang: "python", content: DECISION_TREES },
  { id: "naive-bayes", title: "Naive Bayes", blurb: "A fast probabilistic classifier — priors, probabilities, held-out validation.", tag: "scikit-learn", lang: "python", content: NAIVE_BAYES },
  { id: "kmeans", title: "K-means clustering", blurb: "Group customers with no labels — scale, fit, name the clusters, the elbow method.", tag: "scikit-learn", lang: "python", content: KMEANS },
  { id: "logistic-regression", title: "Logistic regression", blurb: "A classifier you can interpret — coefficients, odds ratios, probabilities.", tag: "scikit-learn", lang: "python", content: LOGISTIC_REGRESSION },
  { id: "neural-network", title: "Neural network", blurb: "A small MLPClassifier — layers, convergence, weight shapes, prediction.", tag: "scikit-learn", lang: "python", content: NEURAL_NETWORK },
];
