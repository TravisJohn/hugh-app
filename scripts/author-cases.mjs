// ── The Case Room — offline case authoring pipeline ─────────────────────────
// generate (Sonnet) → deterministic schema check → critic (Sonnet, rubric) →
// revise loop → write. The HUMAN provides the pedagogical skeleton (each brief's
// belief-vs-real-driver + lesson — the judgment); the model does the mechanical
// drafting; the critic + validator raise the hit rate; you review the output.
//
//   node scripts/author-cases.mjs            → author every brief not yet written
//   node scripts/author-cases.mjs --force    → re-author even if a file exists
//   node scripts/author-cases.mjs --only=id  → just one brief
//
// Needs ANTHROPIC_API_KEY in .env.local. Writes public/case-data/<id>.json and
// rebuilds public/case-data/manifest.json (churn + all authored cases).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "case-data");
const MODEL = "claude-sonnet-4-6"; // repo convention; reasoning-heavy generation
const FORCE = process.argv.includes("--force");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").split("=")[1];
// --manifest-only: skip authoring entirely — just re-validate every case file on
// disk and rebuild manifest.json. Needs no API key, so hand-authored cases (and
// facet edits) can be published without a Claude call.
const MANIFEST_ONLY = process.argv.includes("--manifest-only");

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  const raw = readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}
const env = loadEnv();
if (!MANIFEST_ONLY && !env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}
const anthropic = MANIFEST_ONLY ? null : new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// ── The gold-standard example (the hand-authored churn case) ─────────────────
const CHURN = readFileSync(path.join(DATA_DIR, "freshbox-churn.json"), "utf8");

// ── The 9 briefs — each a planted insight the model must build a case toward ──
// belief = the plausible-but-wrong stakeholder hypothesis (the red herring).
// realDriver = the actual cause the segmentation/normalized metric reveals.
// lesson = the transferable analytical principle.
const BRIEFS = [
  {
    id: "retail-promo-lift", title: "The Promo That Worked", company: "RetailCo",
    domain: "Marketing Analytics", difficulty: "core", estMinutes: 6,
    tags: ["incrementality", "counterfactual", "cannibalization"],
    role: "Junior Marketing Analyst",
    situation: "Sales spiked 18% the week of the 20%-off promo.",
    belief: "The Head of Growth is convinced the promo drove it and wants to run it every month.",
    realDriver: "The lift is mostly pull-forward plus a seasonal peak the promo happened to coincide with. Measured against a holdout region that got no promo, incremental lift is near zero — and full-price sales were cannibalized.",
    lesson: "Measure incrementality against a counterfactual (a holdout/baseline), not a raw before/after that a season or pull-forward can fake.",
  },
  {
    id: "saas-activation-dip", title: "The Activation Dip", company: "Flowdesk",
    domain: "Product Analytics", difficulty: "hard", estMinutes: 7,
    tags: ["Simpson's paradox", "mix shift", "segmentation"],
    role: "Product Analyst",
    situation: "Activation rate dropped from 41% to 34% right after the onboarding redesign.",
    belief: "The PM is convinced the redesign hurt activation and wants to roll it back this week.",
    realDriver: "A large paid-marketing push flooded signups with low-intent free users (a mix shift). Within every acquisition segment, activation actually improved after the redesign — the blended number fell only because the mix changed.",
    lesson: "Simpson's paradox / mix shift: a pooled rate can move opposite to every segment. Segment before you conclude a change caused a drop.",
  },
  {
    id: "neobank-fraud-spike", title: "The Fraud Spike", company: "NeoBank",
    domain: "Risk Analytics", difficulty: "hard", estMinutes: 7,
    tags: ["base rates", "distribution shift", "precision"],
    role: "Risk Analyst",
    situation: "The fraud model's flagged transactions tripled last month.",
    belief: "The Head of Risk assumes the model has broken and wants it retrained immediately.",
    realDriver: "A new product launched to a genuinely riskier customer cohort — the base rate of fraud rose, so more true positives is expected. On the new population the model's precision is unchanged; the raw flag count rose because the input distribution shifted, not because the model degraded.",
    lesson: "A raw flag count conflates base rate with model quality. Judge a classifier on precision/recall within the current population, not the volume of flags.",
  },
  {
    id: "shipfast-carrier", title: "The Slower Deliveries", company: "ShipFast",
    domain: "Operations Analytics", difficulty: "intro", estMinutes: 5,
    tags: ["confounding", "like-for-like", "segmentation"],
    role: "Operations Analyst",
    situation: "Average delivery time rose from 2.1 to 2.9 days after switching to a new carrier.",
    belief: "The Ops lead blames the new carrier and wants to switch back.",
    realDriver: "Two confounders landed the same week: a holiday volume surge, and a newly-served remote region far from any hub. On like-for-like lanes and volumes, the new carrier is actually faster.",
    lesson: "Confounding: a headline average can move because the mix of what you're averaging changed. Compare like-for-like before blaming the one thing that changed.",
  },
  {
    id: "cartly-checkout", title: "The Checkout Cliff", company: "Cartly",
    domain: "Product Analytics", difficulty: "core", estMinutes: 6,
    tags: ["segmentation", "funnel", "aggregation trap"],
    role: "Growth Analyst",
    situation: "Checkout abandonment jumped from 68% to 76% the week the checkout was redesigned.",
    belief: "The design lead assumes the redesign is worse and wants an immediate revert.",
    realDriver: "Desktop abandonment actually improved. The entire jump is on mobile, where a new address field broke browser autofill. The aggregate hid a concentrated, fixable failure.",
    lesson: "An aggregate funnel metric can hide a failure concentrated in one segment. Cut by device/platform before reverting the whole thing.",
  },
  {
    id: "streamly-abtest", title: "The Winning Test", company: "Streamly",
    domain: "Experimentation", difficulty: "hard", estMinutes: 7,
    tags: ["peeking", "sample ratio mismatch", "novelty effect"],
    role: "Experimentation Analyst",
    situation: "The new paywall variant is up 6% and hit p<0.05 three days into the test.",
    belief: "The PM wants to call it a winner and ship it now.",
    realDriver: "Stopping the moment it crossed significance inflates false positives (peeking). There's also a sample-ratio mismatch from bot traffic skewing the split, and a novelty effect. Run to the pre-registered duration and the lift is indistinguishable from zero.",
    lesson: "Don't peek and stop early — it manufactures false winners. Check the sample-ratio and run the pre-registered horizon before calling a result.",
  },
  {
    id: "subly-ltv", title: "The Golden Cohort", company: "Subly",
    domain: "Growth Analytics", difficulty: "core", estMinutes: 6,
    tags: ["survivorship bias", "cohort immaturity", "LTV"],
    role: "Growth Analyst",
    situation: "Reported LTV looks huge, so leadership wants to pour more into acquisition.",
    belief: "The CFO wants to raise the acquisition budget on the strength of the headline LTV.",
    realDriver: "LTV was computed only on still-active users and extrapolated from young cohorts whose churn hasn't landed yet. Cohort-complete LTV is far lower — below CAC for recent cohorts.",
    lesson: "Survivorship bias + immature cohorts inflate LTV. Use cohort-complete or churn-adjusted LTV, and compare like-aged cohorts, before acting on it.",
  },
  {
    id: "helply-csat", title: "The CSAT Drop", company: "Helply",
    domain: "CX Analytics", difficulty: "intro", estMinutes: 5,
    tags: ["response bias", "mix shift", "metric validity"],
    role: "CX Analyst",
    situation: "CSAT fell from 4.4 to 3.9 this month.",
    belief: "The Support Director assumes the agents are slipping and wants to put them on a coaching plan.",
    realDriver: "A new post-chat survey trigger changed who responds (angrier customers now get surveyed), and ticket mix shifted toward a broken billing feature. Agent-level quality is unchanged.",
    lesson: "A metric's own population can change under you (response/selection bias + mix shift). Check who is being measured before blaming the people measured.",
  },
  {
    id: "pantree-stockouts", title: "The Stockout Surge", company: "Pantree",
    domain: "Supply Analytics", difficulty: "core", estMinutes: 6,
    tags: ["aggregation trap", "concentration", "Pareto"],
    role: "Supply Chain Analyst",
    situation: "Stockout incidents rose 40% last quarter.",
    belief: "The Ops VP wants to raise safety stock across the entire catalogue.",
    realDriver: "About 80% of the stockouts come from just 3 SKUs sharing one supplier whose lead time blew out. The rest of the catalogue is fine. A blanket restock ties up capital for no reason.",
    lesson: "Aggregation hides concentration. Disaggregate (Pareto) to find where the problem actually lives before taking a blanket, expensive action.",
  },
  {
    id: "hospital-readmission", title: "The Readmission Rise", company: "Mercy General",
    domain: "Healthcare Analytics", difficulty: "hard", estMinutes: 7,
    role: "Healthcare Data Analyst",
    situation: "30-day readmissions rose from 12% to 16% after a new discharge protocol shipped.",
    belief: "The chief of medicine blames the new discharge protocol and wants it scrapped.",
    realDriver: "The hospital opened a cardiac unit that admits sicker, higher-risk patients — a case-mix shift. Risk-adjusted, readmission rates held or improved within every severity tier.",
    lesson: "Case-mix / risk adjustment: a raw outcome rate confounds patient severity with care quality. Adjust for the population before judging an intervention.",
  },
  {
    id: "gaming-arpu", title: "The ARPU Slide", company: "PixelForge",
    domain: "Gaming Analytics", difficulty: "core", estMinutes: 6,
    role: "Games Data Analyst",
    situation: "Average revenue per user (ARPU) fell 22% after the monetization update.",
    belief: "The monetization lead assumes the update backfired and wants to revert it.",
    realDriver: "A handful of 'whale' spenders churned for seasonal reasons; the mean collapsed while the median spend and paying-user conversion held. The average was dominated by a few outliers, not the typical player.",
    lesson: "Mean vs median on a skewed distribution: a mean ruled by outliers misrepresents the typical user. Look at the distribution, not just the average.",
  },
  {
    id: "b2b-pipeline", title: "The Win-Rate Wobble", company: "Cloudspan",
    domain: "Sales Analytics", difficulty: "hard", estMinutes: 7,
    role: "Revenue Operations Analyst",
    situation: "Win rate on deals created since the new sales script looks 9 points lower.",
    belief: "The VP Sales blames the new script and wants to roll back to the old one.",
    realDriver: "Recent deals haven't had time to close (the sales cycle is ~90 days), so the recent cohort is right-censored — its 'win rate' only counts the fast losses. Age-matched cohorts show no difference.",
    lesson: "Right-censoring / immature cohorts: measuring outcomes on entities that haven't had time to resolve understates success. Compare age-matched cohorts.",
  },
  {
    id: "social-engagement", title: "The Engagement Cliff", company: "Chatter",
    domain: "Product Analytics", difficulty: "intro", estMinutes: 5,
    role: "Product Data Analyst",
    situation: "Daily engagement events dropped 15% overnight after an app release.",
    belief: "The PM assumes the new feed algorithm tanked engagement and wants it reverted.",
    realDriver: "A logging change in the new iOS build under-fires the 'engagement' event; server-side sessions are flat. It's an instrumentation bug, not a behavior change.",
    lesson: "Data quality / instrumentation: a metric can move because measurement changed, not behavior. Validate the pipeline before trusting a sudden step-change.",
  },
  {
    id: "pharma-endpoint", title: "The Promising Endpoint", company: "Helixa Bio",
    domain: "Clinical Analytics", difficulty: "hard", estMinutes: 7,
    role: "Biostatistics Analyst",
    situation: "A secondary endpoint came back significant (p=0.03) in the trial readout.",
    belief: "The clinical lead wants to headline it as evidence of efficacy in the report.",
    realDriver: "Eighteen secondary endpoints were tested; at least one crossing p<0.05 by chance is expected. After multiple-comparison correction the endpoint is not significant.",
    lesson: "Multiple comparisons: testing many endpoints inflates the false-positive rate. Correct for it (or pre-register) before claiming a finding.",
  },
  {
    id: "telco-churn-model", title: "The Perfect Model", company: "Telcom",
    domain: "Data Science", difficulty: "hard", estMinutes: 7,
    role: "Data Scientist",
    situation: "A new churn model scores AUC 0.95 offline — the team wants to deploy it.",
    belief: "The DS manager wants to ship it on the strength of the standout offline performance.",
    realDriver: "One feature is a 'cancellation request submitted' flag that only exists after a customer decides to churn — target leakage. With a leakage-free, time-respecting split the model is barely above baseline.",
    lesson: "Data leakage: a feature that encodes the outcome inflates offline metrics and collapses in production. Validate with temporal, leakage-free splits.",
  },
  {
    id: "edtech-completion", title: "The Completion Drop", company: "Lernly",
    domain: "Product Analytics", difficulty: "core", estMinutes: 6,
    role: "Learning Data Analyst",
    situation: "Course completion fell from 58% to 43% after quizzes were added to modules.",
    belief: "The content lead assumes the quizzes are driving learners away and wants them removed.",
    realDriver: "Adding quizzes changed the definition of 'complete' (it now requires passing them), so the metric isn't comparable across the change. Under the old definition, finish and engagement rates are steady.",
    lesson: "Metric definition change: comparing a metric across a redefinition compares two different things. Hold the definition constant before reading a trend.",
  },
  {
    id: "ride-cancellations", title: "The Cancellation Climb", company: "Zipp",
    domain: "Marketplace Analytics", difficulty: "core", estMinutes: 6,
    role: "Marketplace Analyst",
    situation: "Rider cancellations rose 30% the month surge pricing was tweaked.",
    belief: "The pricing PM blames the surge change and wants it reverted city-wide.",
    realDriver: "Cancellations concentrate in two outer zones at peak hours where driver supply collapsed — a supply/demand imbalance, not price. Most zones are unchanged; a city-wide revert misdiagnoses it.",
    lesson: "Aggregation hides a localized supply problem. Segment by zone and time before attributing a city-wide metric to the one thing that changed.",
  },
  {
    id: "energy-forecast", title: "The Forecast Miss", company: "Voltiq",
    domain: "Forecasting", difficulty: "core", estMinutes: 6,
    role: "Forecasting Analyst",
    situation: "The demand-forecast model's error tripled last week.",
    belief: "The analytics lead assumes the model degraded and wants an emergency retrain.",
    realDriver: "A record heatwave pushed demand far outside the model's training range — an out-of-distribution regime, not model rot. On normal days it's still accurate; retraining on one anomaly would overfit.",
    lesson: "Distribution shift / extrapolation: a model can be fine yet fail outside its training regime. Distinguish an anomaly from degradation before retraining.",
  },
  {
    id: "insurance-approval", title: "The Approval Slowdown", company: "Assura",
    domain: "Operations Analytics", difficulty: "intro", estMinutes: 5,
    role: "Claims Operations Analyst",
    situation: "Average claim approval time rose from 4 to 6 days after onboarding new adjusters.",
    belief: "The claims manager blames the new adjusters and wants to extend their training.",
    realDriver: "A surge of complex commercial claims (which always take longer) shifted the mix; within each claim-complexity tier, approval time is flat. The new adjusters aren't slower.",
    lesson: "Mix shift / confounding: a blended average can rise purely because the composition of work changed. Compare within like-for-like tiers.",
  },

  // ── Cloud-architecture (data-engineering) batch ────────────────────────────
  // Same three-muscle spine, retargeted to system-design judgment: the belief is
  // an over- or under-engineered stack; framing = scope the requirement first;
  // evidence = read the workload/cost/SLA number that exposes the real need;
  // interpretation = match the tool to the need (don't over-build). `stack` facet
  // carries the cloud/tools dimension.
  {
    id: "realtime-dashboard", title: "The Real-Time Mandate", company: "Marketly",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6,
    role: "Data Engineer",
    situation: "The CEO asked for 'real-time' sales dashboards; the lead scoped a Kafka + Flink streaming pipeline delivering events within seconds.",
    belief: "The lead is convinced the business needs true real-time streaming and that batch would look second-rate.",
    realDriver: "The dashboard drives a once-daily merchandising review with an 8am deadline; any pipeline fresher than hourly meets the SLA. Streaming's sub-second freshness is unconsumed and buys permanent 24/7 ops cost.",
    lesson: "Derive the freshness SLA from the decision cadence the data serves, not the loudest adjective in the request. Match the tool to the real need.",
  },
  {
    id: "partition-skew", title: "The One Slow Reducer", company: "Adverva",
    domain: "Data Engineering", difficulty: "hard", estMinutes: 7,
    role: "Data Engineer",
    situation: "A nightly Spark aggregation crept from 40 minutes to over 3 hours; the lead wants to double the cluster from 20 to 40 workers.",
    belief: "The lead assumes the job is out of compute and that adding workers will restore the runtime.",
    realDriver: "One task runs for hours while 199 finish in under a minute — a null join key holds 200x the rows of any real key. It's data skew; no number of workers helps because one task can't be split. Salting/isolating the key fixes it on the original cluster.",
    lesson: "In distributed processing the shape of the data (skew) governs performance more than cluster size. Read the per-partition distribution before scaling.",
  },
  {
    id: "warehouse-vs-lakehouse", title: "The Lakehouse Rewrite", company: "Brightform",
    domain: "Data Engineering", difficulty: "hard", estMinutes: 7,
    role: "Analytics Engineer",
    situation: "The platform team wants to migrate the cloud warehouse to a Spark lakehouse on object storage, arguing it's cheaper and more scalable.",
    belief: "The platform lead believes the warehouse won't scale and a lakehouse is the cheaper, inevitable future.",
    realDriver: "The workload is ~1.8 TB, 95% interactive BI SQL, high concurrency. The lakehouse's cheap-storage win is under 10% of cost; on full TCO (standing compute + ops) it costs more and gives worse BI latency. The warehouse fits.",
    lesson: "Size the architecture to the real workload profile and full TCO, not a storage-price headline or an industry trend. Define the concrete trigger to migrate later.",
  },
  {
    id: "orchestration-cron", title: "The Cron That Grew", company: "Ledgerline",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6,
    role: "Data Engineer",
    situation: "30 chained cron jobs on one VM fail silently mid-run; the lead proposes building a custom Kubernetes scheduler.",
    belief: "The lead believes the fix is a bespoke in-house scheduler built on Kubernetes.",
    realDriver: "The real gaps are dependency-aware scheduling, automatic retries, backfills, and run visibility — all standard in an existing orchestrator (Airflow/Composer), which covers them in days vs months to build and years to maintain a custom one.",
    lesson: "Separate the capabilities you need from the instinct to build. Adopt commodity, undifferentiated infrastructure; reserve engineering for what's specific to the business.",
  },
  {
    id: "nosql-vs-sql", title: "The Scale Panic", company: "Trovi",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6,
    role: "Data Engineer",
    situation: "Fearing growth, the lead wants to migrate the core catalog and orders from PostgreSQL to Cassandra 'for web-scale'.",
    belief: "The lead believes relational Postgres is a scaling dead-end and NoSQL is required for growth.",
    realDriver: "At 60 GB and 2,000 qps the DB runs at ~13% of demonstrated capacity, with replicas and vertical scaling untouched — and the join/transaction-heavy access pattern is exactly what Cassandra sacrifices. A growth trend without a capacity ceiling triggered the panic.",
    lesson: "Pick a datastore from the access pattern and load relative to proven capacity, not fear of scale. Keep relational guarantees until a workload actually outgrows them.",
  },
  {
    id: "exactly-once", title: "The Duplicate Rows", company: "Shiplytics",
    domain: "Data Engineering", difficulty: "hard", estMinutes: 7,
    role: "Streaming Data Engineer",
    situation: "A Kafka-to-warehouse stream writes occasional duplicate events; the lead wants to re-architect for end-to-end exactly-once semantics.",
    belief: "The lead believes only true exactly-once streaming semantics will fix the duplicates.",
    realDriver: "The ~0.2% duplicates come from at-least-once retries replaying events the sink already wrote, and every event carries a natural key (event_id). An idempotent upsert on event_id makes replays no-ops in hours — no pipeline-wide transactions.",
    lesson: "Distinguish exactly-once delivery (extraordinarily hard, rarely needed) from idempotent effectively-once results (cheap, usually sufficient). Make the sink absorb replays.",
  },
  {
    id: "file-format-scans", title: "The Slow Scans", company: "Streamhaus",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6,
    role: "Data Engineer",
    situation: "Lake queries are slow and scan costs are climbing; the lead wants to move everything into a larger, pricier warehouse tier.",
    belief: "The lead believes the lake can't serve fast queries and only a bigger warehouse will fix cost and performance.",
    realDriver: "Data is stored as row-oriented, unpartitioned gzipped JSON, so every query full-scans everything. Partitioned columnar Parquet cuts a typical query's scan from 800 GB to 6 GB (~130x) on the same engine.",
    lesson: "In lakes, file format and partitioning govern scan cost more than engine horsepower. Fix the data layout before paying to process it.",
  },
  {
    id: "cdc-vs-fullload", title: "The Nightly Full Reload", company: "Cartwheel",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6,
    role: "Data Engineer",
    situation: "A nightly job reloads an entire 500M-row orders table into the warehouse, now over SLA; the lead wants to buy more warehouse slots.",
    belief: "The lead believes the reload is too big for the current warehouse and more compute is the fix.",
    realDriver: "Only ~0.5% (~2.5M) of rows change daily; the full reload re-copies 99.5% unchanged data. Incremental/CDC loading moves 200x less data and finishes in minutes on the existing compute.",
    lesson: "Move only what changed: match ingestion volume to the actual delta and reach for CDC/incremental before scaling compute. The redundant work, not the engine, is the cost.",
  },
  {
    id: "capacity-autoscale", title: "The Black-Friday Cluster", company: "Peakline",
    domain: "Data Engineering", difficulty: "intro", estMinutes: 5,
    role: "Data / Platform Engineer",
    situation: "For the holiday spike the lead wants to provision a large fixed peak-sized cluster and keep it running all season.",
    belief: "The lead believes a permanently provisioned peak-sized cluster is the safe way to survive the spike.",
    realDriver: "Load is near peak only ~3 hours a day and ~1/8 of peak the rest; a fixed peak cluster sits ~85% idle around the clock. Autoscaling/serverless matches spend to the load curve and still absorbs the spike.",
    lesson: "Size to the shape of the load, not its maximum. The peak figure alone always argues for over-provisioning; the load distribution reveals whether fixed capacity fits.",
  },
  {
    id: "data-quality-gate", title: "The Silent Corruption", company: "Welltrace",
    domain: "Data Engineering", difficulty: "intro", estMinutes: 5,
    role: "Analytics / Data Engineer",
    situation: "A corrupted upstream feed produced a wrong metric that reached an executive report; the lead wants to buy a full data-observability platform.",
    belief: "The lead believes only a comprehensive observability platform can prevent another silent data-quality failure.",
    realDriver: "The pipeline had no validation at ingestion, so a silently changed units field flowed straight through. A few boundary assertions (schema, row-count range, units/enum, freshness) would have failed the run at the source in days, not weeks.",
    lesson: "Put validation where data enters and fail fast. Right-size data quality to the actual failure mode with targeted contracts first; treat a platform as a later, evidence-driven step.",
  },

  // ── Audit batch — statistical & analytical judgment (30) ────────────────────
  {
    id: "store-remodel-regression", title: "The Remodel Bump", company: "Maple & Co",
    domain: "Retail Analytics", difficulty: "core", estMinutes: 6, role: "Retail Analyst",
    situation: "The 20 worst-performing stores were remodeled; their sales rose 12% the next quarter.",
    belief: "The VP credits the remodel and wants to roll it out chain-wide.",
    realDriver: "The stores were chosen because they had an unusually bad quarter; extreme lows drift back up on their own. A control of equally-bad, un-remodeled stores rose about the same.",
    lesson: "Regression to the mean: selecting on an extreme and measuring the change fakes an effect. Compare against a control chosen the same way.",
  },
  {
    id: "referral-channel-selection", title: "The Golden Channel", company: "Flowspace",
    domain: "Growth Analytics", difficulty: "core", estMinutes: 6, role: "Growth Analyst",
    situation: "Customers acquired through the referral channel show by far the highest LTV.",
    belief: "The CMO wants to pour budget into referrals to scale that LTV.",
    realDriver: "Referrals are gated to existing happy customers' friends — a pre-selected, warm population. The channel selects for good customers, it doesn't create them; cold-scaling it won't replicate the LTV.",
    lesson: "Selection bias: a channel that filters for good customers is not one that produces them. Judge it against comparable cold audiences.",
  },
  {
    id: "support-target-goodhart", title: "The Ticket Target", company: "Helpwise",
    domain: "CX Analytics", difficulty: "intro", estMinutes: 5, role: "Support Analyst",
    situation: "Agents hit the new resolve-within-24h target, but CSAT didn't move.",
    belief: "The Support Director wants to tighten the SLA further.",
    realDriver: "Agents close tickets early (then reopen them) to beat the timer; reopen rate spiked. The measure improved while the goal — actual resolution — did not.",
    lesson: "Goodhart's law: once a measure becomes a target it stops measuring the goal. Watch the guardrail metric before pushing the target harder.",
  },
  {
    id: "hiring-collider", title: "The Talented Jerk", company: "Nimbus Labs",
    domain: "People Analytics", difficulty: "hard", estMinutes: 7, role: "People Analyst",
    situation: "Among hired engineers, coding skill and interview charisma are negatively correlated.",
    belief: "The Head of Eng concludes skilled people interview worse and wants to drop the interview.",
    realDriver: "Getting hired requires being strong on at least one axis, so conditioning on hired manufactures a negative correlation (collider). In the full applicant pool the two are unrelated.",
    lesson: "Collider bias: conditioning on a common effect (being hired) induces correlations that don't exist in the population.",
  },
  {
    id: "region-ecological", title: "The Region Signal", company: "Brightreach",
    domain: "Marketing Analytics", difficulty: "core", estMinutes: 6, role: "Marketing Analyst",
    situation: "Regions with more ad spend have higher sales, so budget is set region-by-region on that link.",
    belief: "The team assumes individuals exposed to more ads buy more.",
    realDriver: "The region-level link is confounded by population and wealth; at the individual level ad exposure barely moves purchase. Group correlation does not transfer to individuals.",
    lesson: "Ecological fallacy: aggregate-level correlations don't imply individual-level effects.",
  },
  {
    id: "spam-precision", title: "The Aggressive Filter", company: "Postbox",
    domain: "Product Analytics", difficulty: "core", estMinutes: 6, role: "Product Analyst",
    situation: "A retuned spam filter flags 5x more messages than before.",
    belief: "Leadership assumes it is catching far more spam.",
    realDriver: "Spam is a small share of mail; at this threshold most of the new flags are good mail (false positives). Precision collapsed while recall barely rose.",
    lesson: "Judge a filter by precision at its operating point given the base rate, not by the raw flag count.",
  },
  {
    id: "call-length-bias", title: "The Long Calls", company: "Lineup Telecom",
    domain: "Operations Analytics", difficulty: "hard", estMinutes: 7, role: "Operations Analyst",
    situation: "A snapshot of calls in progress right now shows average handle time far above the logged average.",
    belief: "Ops concludes handle times have ballooned.",
    realDriver: "Sampling calls currently in progress oversamples long calls (they are more likely to be ongoing). The completed-call average is unchanged.",
    lesson: "Length-biased sampling: snapshotting in-progress items overweights the long ones.",
  },
  {
    id: "feature-novelty", title: "The Launch Spike", company: "Tunely",
    domain: "Product Analytics", difficulty: "intro", estMinutes: 5, role: "Product Analyst",
    situation: "A new feature drove a 30% engagement jump in week one.",
    belief: "The PM projects the annual impact straight from that week-one spike.",
    realDriver: "Curiosity drives the launch spike; by week four usage settles near baseline. Extrapolating week one wildly overstates the effect.",
    lesson: "Novelty effect: launch spikes decay — measure at steady state before projecting.",
  },
  {
    id: "yoy-seasonality", title: "The Summer Slump", company: "Cartwell",
    domain: "E-commerce Analytics", difficulty: "intro", estMinutes: 5, role: "E-commerce Analyst",
    situation: "Sales fell 15% month-over-month in July.",
    belief: "The exec reads the MoM drop as the business shrinking.",
    realDriver: "The category is seasonal; July versus last July is up 8%. Month-over-month confounds season with trend.",
    lesson: "Compare like-season (year-over-year) before reading a trend from a month-over-month move.",
  },
  {
    id: "unicorn-survivorship", title: "The Founder Playbook", company: "Launchpad VC",
    domain: "Comparative Analytics", difficulty: "core", estMinutes: 6, role: "Investment Analyst",
    situation: "A study of unicorns finds they all moved fast and skipped process.",
    belief: "The accelerator wants to teach that as the playbook.",
    realDriver: "Failed startups did the same things at least as often, but they're absent from the sample. Without the failures, the pattern is survivorship noise.",
    lesson: "Survivorship bias: studying only winners can't identify what causes winning.",
  },
  {
    id: "backtest-window", title: "The Perfect Window", company: "Northgate Capital",
    domain: "Financial Analytics", difficulty: "hard", estMinutes: 7, role: "Quantitative Analyst",
    situation: "A strategy shows outsized returns over a chosen 18-month backtest window.",
    belief: "The desk wants to deploy capital on the backtest.",
    realDriver: "The window is effectively chosen where it worked; across rolling and out-of-sample windows returns are near random and sometimes negative.",
    lesson: "Cherry-picked windows and researcher degrees of freedom fake performance; test across all windows and out-of-sample.",
  },
  {
    id: "ratio-spurious", title: "The Efficiency Correlation", company: "Forgeworks",
    domain: "Operations Analytics", difficulty: "hard", estMinutes: 7, role: "Operations Analyst",
    situation: "Across plants, cost-per-unit and defects-per-unit correlate strongly.",
    belief: "The team concludes cost-cutting will also cut defects.",
    realDriver: "Both ratios share the denominator (units produced); low-volume plants inflate both. The correlation is an artifact of the shared denominator, not a real link.",
    lesson: "Ratios that share a denominator can correlate spuriously; check the raw numerators and volumes.",
  },
  {
    id: "reverse-causation-notifs", title: "The Notification Effect", company: "Dailyloop",
    domain: "Product Analytics", difficulty: "core", estMinutes: 6, role: "Product Analyst",
    situation: "Users who enable notifications retain far better than those who don't.",
    belief: "The PM wants to auto-enable notifications for everyone to lift retention.",
    realDriver: "Already-engaged users choose to enable notifications — retention drives opt-in, not the reverse. Force-enabling for disengaged users does little and annoys them.",
    lesson: "Reverse causation: the arrow may run the other way; a randomized nudge settles direction.",
  },
  {
    id: "loyalty-immortal-time", title: "The Loyalty Lift", company: "Greenbasket",
    domain: "Retail Analytics", difficulty: "hard", estMinutes: 7, role: "CRM Analyst",
    situation: "Loyalty-program members spend far more over the year than non-members.",
    belief: "Leadership wants to enroll everyone to raise spend.",
    realDriver: "Members had to keep shopping long enough to enroll; that pre-enrollment period guarantees they were already active (immortal time). Age-matched non-members spend similarly.",
    lesson: "Immortal time bias: a period in which the outcome couldn't occur inflates the treated group.",
  },
  {
    id: "course-attrition", title: "The Dropout Skew", company: "Studia",
    domain: "EdTech Analytics", difficulty: "hard", estMinutes: 7, role: "Learning Analyst",
    situation: "An A/B test of a harder course variant shows higher final-exam scores.",
    belief: "The content lead wants to ship the harder variant.",
    realDriver: "The hard variant pushed weaker students to drop before the exam; only strong ones remained to be scored (differential attrition). Intent-to-treat shows no gain.",
    lesson: "Differential attrition breaks randomization; analyze intent-to-treat, not just survivors.",
  },
  {
    id: "unweighted-average", title: "The Blended Rate", company: "Assurico",
    domain: "Sales Analytics", difficulty: "core", estMinutes: 6, role: "Sales Analyst",
    situation: "The blended conversion rate across agents rose this quarter.",
    belief: "Leadership concludes the agents improved.",
    realDriver: "The blended figure is an unweighted mean of per-agent rates; a few tiny-volume agents with high rates pulled it up. Volume-weighted, conversion is flat.",
    lesson: "Averaging rates across unequal groups needs weighting by volume, or a few small groups distort it.",
  },
  {
    id: "ceiling-effect", title: "The Plateau", company: "Onboardly",
    domain: "Product Analytics", difficulty: "core", estMinutes: 6, role: "Product Analyst",
    situation: "A UX improvement showed no lift on the activation metric in the test.",
    belief: "The team concludes the change didn't work and scraps it.",
    realDriver: "Activation was already ~96% for the tested segment — no headroom (ceiling). On the low-activation segment the same change lifted materially.",
    lesson: "Ceiling effects mask real effects; segment by baseline headroom before concluding no impact.",
  },
  {
    id: "confounding-indication", title: "The Sicker Patients", company: "Ridgeway Health",
    domain: "Healthcare Analytics", difficulty: "hard", estMinutes: 7, role: "Clinical Analyst",
    situation: "Patients given the new drug have worse outcomes than those who weren't.",
    belief: "The team fears the drug is harmful and wants it pulled.",
    realDriver: "Physicians prescribe it to the sickest patients; adjusted for baseline severity it actually helps. Treatment was assigned by indication.",
    lesson: "Confounding by indication: when treatment is assigned by severity, raw outcomes mislead; adjust or use a quasi-experiment.",
  },
  {
    id: "leading-lagging", title: "The Pipeline Mirage", company: "Cloudmark",
    domain: "Sales Analytics", difficulty: "core", estMinutes: 6, role: "Revenue Analyst",
    situation: "Qualified leads are up 40% but revenue is flat, and sales is getting blamed.",
    belief: "Leadership assumes sales is dropping the ball on the new leads.",
    realDriver: "The sales cycle is ~6 months; today's revenue reflects leads from two quarters ago. Comparing this month's leads to this month's revenue is a time-window mismatch.",
    lesson: "Align leading and lagging indicators by the lag; don't compare across mismatched time windows.",
  },
  {
    id: "denominator-shift", title: "The Rising Rate", company: "Paywave",
    domain: "Risk Analytics", difficulty: "core", estMinutes: 6, role: "Risk Analyst",
    situation: "The fraud rate per active user jumped this month.",
    belief: "The risk team assumes fraud surged.",
    realDriver: "A churn event shrank the active-user denominator; the absolute fraud count is flat. The rate rose because the base fell, not because fraud grew.",
    lesson: "A rate can move because its denominator moved; inspect numerator and denominator separately.",
  },
  {
    id: "proxy-metric-drift", title: "The Proxy Metric", company: "Scrollhouse",
    domain: "Product Analytics", difficulty: "core", estMinutes: 6, role: "Product Analyst",
    situation: "Time-on-site (a proxy for value) rose after a redesign, but subscriptions fell.",
    belief: "The team reads rising engagement as a win.",
    realDriver: "A confusing redesign made users hunt around (more time) while finding less value; the proxy diverged from the goal it was standing in for.",
    lesson: "Proxy metrics can diverge from the real goal; validate the proxy against the true outcome.",
  },
  {
    id: "test-composition", title: "The Contaminated Arm", company: "Trademart",
    domain: "Experimentation", difficulty: "hard", estMinutes: 7, role: "Experimentation Analyst",
    situation: "A promo test looks positive, but a large partner onboarded mid-test into the treatment arm.",
    belief: "The team calls the promo a winner.",
    realDriver: "The treatment arm's composition changed (a big new partner landed in it), not the promo. Balanced pre-periods show no real lift.",
    lesson: "Composition changes during a test confound it; check arm balance over time, not just at the end.",
  },
  {
    id: "serving-cost-outliers", title: "The Cost Blowout", company: "Stackpoint",
    domain: "FinOps Analytics", difficulty: "core", estMinutes: 6, role: "FinOps Analyst",
    situation: "Mean cost-to-serve per customer spiked, and finance wants an across-the-board price rise.",
    belief: "Leadership assumes serving cost rose broadly.",
    realDriver: "A handful of customers running pathological queries drove the mean; median cost is flat. The average is ruled by the tail.",
    lesson: "Outliers dominate means; read the distribution and address the tail rather than repricing everyone.",
  },
  {
    id: "heterogeneous-effects", title: "The Average That Hid Two Stories", company: "Farely",
    domain: "Experimentation", difficulty: "hard", estMinutes: 7, role: "Experimentation Analyst",
    situation: "A pricing change showed roughly zero average effect, so it's filed as neutral.",
    belief: "The team concludes it had no impact.",
    realDriver: "It lifted revenue for high-intent users and suppressed it for price-sensitive ones — two large opposite effects canceling in the average. A targeted rollout wins.",
    lesson: "A null average can hide large opposing subgroup effects; check for heterogeneity before concluding nothing happened.",
  },
  {
    id: "underpowered-null", title: "The Failed Test", company: "Sproutly",
    domain: "Experimentation", difficulty: "core", estMinutes: 6, role: "Product Analyst",
    situation: "An A/B test on a small segment showed no significant difference, so the feature is killed.",
    belief: "The team reads that as proof the feature does nothing.",
    realDriver: "With ~200 users the test could only detect a huge effect; a plausible 5% lift is undetectable at that sample size. Not significant is not the same as no effect.",
    lesson: "Underpowered tests can't prove the null; compute power and the minimum detectable effect before concluding.",
  },
  {
    id: "network-spillover", title: "The Contaminated Control", company: "Circleback",
    domain: "Experimentation", difficulty: "hard", estMinutes: 7, role: "Experimentation Analyst",
    situation: "In a referral-incentive test, control users also increased activity, muddying the result.",
    belief: "The team thinks the test is broken or inconclusive.",
    realDriver: "Treatment users invited control-group friends, so treatment leaked into control (interference), diluting the measured effect. Cluster randomization is needed.",
    lesson: "Network spillover violates the no-interference assumption; randomize at the cluster level.",
  },
  {
    id: "twymans-law", title: "The Too-Good Result", company: "Metricly",
    domain: "Analytics Engineering", difficulty: "core", estMinutes: 6, role: "Analytics Engineer",
    situation: "A dashboard shows a 10x conversion jump overnight and the team starts celebrating.",
    belief: "Everyone assumes something great just happened.",
    realDriver: "A tracking double-fire after a deploy inflated conversions; the win is a data artifact. A figure that good is almost always an error.",
    lesson: "Twyman's law: any figure that looks surprisingly good is probably a mistake — verify instrumentation first.",
  },
  {
    id: "randomization-unit", title: "The Session Split", company: "Bytecart",
    domain: "Experimentation", difficulty: "hard", estMinutes: 7, role: "Experimentation Analyst",
    situation: "An experiment randomized by session but was analyzed by user, and the result looks significant.",
    belief: "The team wants to ship on that significance.",
    realDriver: "Users span multiple sessions across both arms (contamination), and correlated sessions break independence, understating variance and faking significance.",
    lesson: "Randomize and analyze at the same unit; a unit mismatch invalidates the inference.",
  },
  {
    id: "targeting-confound", title: "The Discount Addicts", company: "Shelfies",
    domain: "Retail Analytics", difficulty: "core", estMinutes: 6, role: "Pricing Analyst",
    situation: "Customers who use discounts have lower margins, so the team wants to cut discounts.",
    belief: "Leadership blames discounts for destroying margin.",
    realDriver: "Discounts are targeted at already price-sensitive, low-margin shoppers; pulling them loses the sale entirely rather than restoring margin.",
    lesson: "A segment defined by a targeted treatment confounds the treatment with who receives it.",
  },
  {
    id: "overlapping-cis", title: "The Overlapping Bars", company: "Gaugely",
    domain: "Experimentation", difficulty: "core", estMinutes: 6, role: "Product Analyst",
    situation: "Two variants' conversion error bars visibly overlap on the chart.",
    belief: "The team concludes there's no significant difference and calls the test a tie.",
    realDriver: "Overlapping confidence intervals do not imply a non-significant difference; the correct test is on the difference itself, which here is significant.",
    lesson: "Overlapping CIs are not a significance test; test the difference (or its CI) directly.",
  },

  // ── Audit batch — ML / data-science modeling (20) ───────────────────────────
  {
    id: "preprocessing-leakage", title: "The Scaled Truth", company: "Vantage AI",
    domain: "Data Science", difficulty: "hard", estMinutes: 7, role: "Data Scientist",
    situation: "A model scores excellently in cross-validation but flops in production.",
    belief: "The team assumes the model is good and production is the problem.",
    realDriver: "Feature scaling and imputation were fit on the whole dataset before the train/test split, leaking test statistics into training. Fitting preprocessing inside each fold drops CV to the realistic, production-matching level.",
    lesson: "Fit all preprocessing inside the CV fold; global preprocessing leaks the test set and inflates offline scores.",
  },
  {
    id: "accuracy-paradox", title: "The 99% Model", company: "Sentrybank",
    domain: "Data Science", difficulty: "core", estMinutes: 6, role: "Data Scientist",
    situation: "A fraud model boasts 99% accuracy and the team wants to deploy it.",
    belief: "High accuracy is taken as proof of a great model.",
    realDriver: "Fraud is ~1% of cases, so a predict-never-fraud baseline also scores 99%; the model catches almost no fraud (recall near zero).",
    lesson: "On imbalanced data accuracy is meaningless; judge with precision, recall, and PR-AUC.",
  },
  {
    id: "concept-drift", title: "The Decaying Model", company: "Streamvault",
    domain: "Machine Learning", difficulty: "core", estMinutes: 6, role: "ML Engineer",
    situation: "A recommender's click-through has slid for months and the team blames the algorithm choice.",
    belief: "The team wants to swap the model architecture.",
    realDriver: "User tastes and the catalog shifted (concept drift); the model is stale, not wrong. Retraining on recent data restores performance — monitoring and a retrain cadence were missing.",
    lesson: "Production models decay as the world shifts; monitor drift and retrain before re-architecting.",
  },
  {
    id: "threshold-cost", title: "The Default Threshold", company: "Churnguard",
    domain: "Data Science", difficulty: "core", estMinutes: 6, role: "Data Scientist",
    situation: "A churn model uses the default 0.5 cutoff and retention spend feels wasted.",
    belief: "The team concludes the model isn't accurate enough.",
    realDriver: "A missed churner costs about 10x a false alarm, so the optimal threshold is ~0.2, not 0.5. The model is fine; the operating point was wrong.",
    lesson: "Set the decision threshold from the business cost matrix, not the 0.5 default.",
  },
  {
    id: "tuning-on-test", title: "The Leaky Leaderboard", company: "Kaggleworks",
    domain: "Data Science", difficulty: "hard", estMinutes: 7, role: "Data Scientist",
    situation: "After 200 tuning trials selected by test-set score, the model tops the leaderboard but disappoints live.",
    belief: "The team believes it's simply the best model they've built.",
    realDriver: "Repeatedly selecting on the test set overfits to it (adaptive overfitting); a locked final holdout shows only mediocre performance.",
    lesson: "Don't tune on the test set; keep a locked final holdout the search never sees.",
  },
  {
    id: "importance-causation", title: "The Feature Blame", company: "Retainly",
    domain: "Data Science", difficulty: "core", estMinutes: 6, role: "Data Scientist",
    situation: "Support-ticket count is the top feature in the churn model, so the team wants to cut tickets to cut churn.",
    belief: "High feature importance is read as the cause of churn.",
    realDriver: "Tickets are a symptom of a deeper product problem that also drives churn; suppressing tickets (e.g. hiding support) won't help and may hurt. Importance is predictive, not causal.",
    lesson: "Feature importance measures prediction, not the effect of intervening on that feature.",
  },
  {
    id: "label-bias", title: "The Biased Ground Truth", company: "Talentgrid",
    domain: "Machine Learning", difficulty: "hard", estMinutes: 7, role: "ML Engineer",
    situation: "A hiring model trained on past successful hires systematically underrates certain schools.",
    belief: "The team assumes the model found real signal.",
    realDriver: "The labels encode historical manager bias; the model faithfully reproduces it. Biased labels in, biased model out.",
    lesson: "Biased labels produce biased models; audit the ground truth, not only the features.",
  },
  {
    id: "offline-online-gap", title: "The Recommender Bakeoff", company: "Shopnest",
    domain: "Machine Learning", difficulty: "hard", estMinutes: 7, role: "ML Engineer",
    situation: "A new recommender wins offline ranking metrics but drops engagement once shipped.",
    belief: "The team treats the offline win as an online win.",
    realDriver: "Offline replay can only score items users happened to see under the old policy (feedback loop); the new model recommends unseen items it can't be rewarded for offline. Only an online test measures it.",
    lesson: "Offline metrics on logged data are biased by the policy that generated them; validate online.",
  },
  {
    id: "calibration", title: "The Confident Model", company: "Underwrite.ai",
    domain: "Data Science", difficulty: "hard", estMinutes: 7, role: "Data Scientist",
    situation: "A risk model has strong AUC, and the business treats a 0.8 score as 80% likely — then mis-prices.",
    belief: "High AUC is taken to mean the probabilities are trustworthy.",
    realDriver: "AUC measures ranking, not calibration; the model's probabilities are systematically overconfident. Calibrating (Platt or isotonic) fixes the pricing.",
    lesson: "AUC is not calibration; calibrate before using scores as probabilities.",
  },
  {
    id: "train-serve-skew", title: "The Feature Skew", company: "Modelworks",
    domain: "Machine Learning", difficulty: "hard", estMinutes: 7, role: "ML Engineer",
    situation: "A model validated well but underperforms in production, and drift is the first suspect.",
    belief: "The team assumes the input distribution drifted.",
    realDriver: "A feature is computed differently in the training pipeline than in the serving path (a units and aggregation-window mismatch) — training-serving skew, not drift. Aligning the feature logic fixes it.",
    lesson: "Training-serving skew: features must be computed identically on both paths; log serving features and compare.",
  },
  {
    id: "reject-inference", title: "The Approved-Only Model", company: "Lendable",
    domain: "Data Science", difficulty: "hard", estMinutes: 7, role: "Credit Data Scientist",
    situation: "A default model trained only on approved loans looks accurate, but mis-ranks new applicants.",
    belief: "The team assumes it generalizes to all applicants.",
    realDriver: "Rejected applicants have no outcome label, so training on approved-only (the survivors) biases the model toward the accepted population. Reject inference is needed.",
    lesson: "Training on only the accepted population (survivorship) skews a model applied to everyone.",
  },
  {
    id: "shortcut-learning", title: "The Ruler Detector", company: "DermaScan",
    domain: "Machine Learning", difficulty: "hard", estMinutes: 7, role: "ML Engineer",
    situation: "A skin-lesion classifier scores high in the lab but fails in clinics.",
    belief: "The team believes it learned the pathology.",
    realDriver: "Malignant training images often included a ruler for scale; the model learned ruler-means-malignant (a shortcut), not the lesion itself.",
    lesson: "Models exploit spurious shortcuts correlated with the label; test on shifted data and inspect what the model attends to.",
  },
  {
    id: "extrapolation-pricing", title: "The Out-of-Range Price", company: "Priceright",
    domain: "Data Science", difficulty: "core", estMinutes: 6, role: "Data Scientist",
    situation: "A demand model recommends a price 40% above anything seen in training, projecting huge revenue.",
    belief: "The team wants to trust the optimizer's recommendation.",
    realDriver: "The model extrapolates a near-linear trend into a region with no data; real demand collapses at that price. Predictions must be constrained to observed support.",
    lesson: "Models are unreliable outside their training support; don't optimize into a region with no data.",
  },
  {
    id: "resample-prior-shift", title: "The Balanced Trap", company: "Flagpost",
    domain: "Data Science", difficulty: "core", estMinutes: 6, role: "Data Scientist",
    situation: "A model trained on a 50/50 rebalanced set predicts far too many positives in production.",
    belief: "The team assumes it's just a threshold that needs nudging.",
    realDriver: "Rebalancing changed the base rate the model assumes; served on the true 2% prior without correction, its probabilities are inflated and miscalibrated.",
    lesson: "Resampling shifts the prior; correct for it (prior adjustment or calibration) at serving time.",
  },
  {
    id: "metric-mismatch", title: "The Wrong Loss", company: "Dispatchly",
    domain: "Data Science", difficulty: "core", estMinutes: 6, role: "Data Scientist",
    situation: "A delivery-time model minimizes RMSE, but dispatchers say it's useless for prioritizing jobs.",
    belief: "The team wants to push RMSE lower still.",
    realDriver: "The decision needs correct ordering of jobs, not minimal squared error; RMSE rewards the wrong thing. A ranking metric aligns the model to how it's used.",
    lesson: "Optimize the metric that matches the decision; RMSE or accuracy may not be it.",
  },
  {
    id: "temporal-cv", title: "The Shuffled Split", company: "Foreside",
    domain: "Data Science", difficulty: "hard", estMinutes: 7, role: "Data Scientist",
    situation: "A sales forecaster validated with random k-fold looks excellent, but lags in production.",
    belief: "The team believes it's a strong model.",
    realDriver: "Random folds let the model train on rows from dates later than the ones it predicts (peeking at the future); time-ordered CV reveals much weaker true performance.",
    lesson: "For temporal data, validate with forward-chaining splits, never random folds.",
  },
  {
    id: "post-outcome-feature", title: "The Future Feature", company: "Coverly",
    domain: "Data Science", difficulty: "hard", estMinutes: 7, role: "Data Scientist",
    situation: "A cancellation model uses a refund_issued field and scores AUC 0.98.",
    belief: "The team wants to deploy the standout model.",
    realDriver: "refund_issued is only set after a cancellation — a feature populated post-outcome. Removing it collapses AUC to a realistic level.",
    lesson: "Features updated after the label event leak the outcome; enforce point-in-time correctness.",
  },
  {
    id: "small-data-overfit", title: "The 12-Feature Wonder", company: "Biotrace",
    domain: "Data Science", difficulty: "core", estMinutes: 6, role: "Data Scientist",
    situation: "With 80 rows and 40 features, a model fits the training data perfectly and the team is thrilled.",
    belief: "The perfect fit is read as a powerful model.",
    realDriver: "With features nearly as many as rows the model memorizes; test performance is near random. Fewer features, regularization, or more data are needed.",
    lesson: "High-dimensional, small-sample models overfit; model complexity must match the data size.",
  },
  {
    id: "prediction-feedback-loop", title: "The Self-Fulfilling Model", company: "Guardrail",
    domain: "Machine Learning", difficulty: "hard", estMinutes: 7, role: "ML Engineer",
    situation: "A targeting model's predictions look more accurate every month, and the team trusts it more.",
    belief: "Rising accuracy is read as the model learning well.",
    realDriver: "The model's own actions generate the future training data (a feedback loop), so it reinforces its priors instead of tracking truth. Accuracy is partly self-fulfilling.",
    lesson: "When predictions shape the data they're later trained on, accuracy can be self-fulfilling; break the loop with exploration or holdouts.",
  },
  {
    id: "group-leakage", title: "The Duplicated Split", company: "Visionary Labs",
    domain: "Machine Learning", difficulty: "core", estMinutes: 6, role: "ML Engineer",
    situation: "An image model scores 97% offline but 70% in the wild, and drift is blamed.",
    belief: "The gap is attributed to distribution shift.",
    realDriver: "Augmented and near-duplicate images of the same subject landed in both train and test (group leakage); grouping by subject before splitting reveals the true, lower accuracy.",
    lesson: "Split by entity or group to avoid near-duplicate leakage across folds.",
  },

  // ── Audit batch — data-engineering / cloud architecture (20) ────────────────
  {
    id: "small-files", title: "The Million Tiny Files", company: "Sensorframe",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "A streaming job writes one file per event and the lake query engine has slowed to a crawl.",
    belief: "The lead assumes the query cluster is undersized.",
    realDriver: "Millions of tiny files crush the engine with per-file metadata and open overhead; compacting into right-sized files (hundreds of MB) fixes it without more compute.",
    lesson: "The small-files problem: file count, not data size, throttles lakes — compact.",
  },
  {
    id: "over-partitioning", title: "The Empty Partitions", company: "Gridpoint",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "A table partitioned by user_id is slow and expensive to query.",
    belief: "The team assumes more partitioning should have made it faster.",
    realDriver: "Partitioning on a high-cardinality column created millions of tiny partitions (a metadata explosion); partitioning by date and clustering by user_id is the right layout.",
    lesson: "Partition on low-cardinality, filter-aligned keys; high-cardinality partitioning backfires.",
  },
  {
    id: "schema-evolution", title: "The Breaking Column", company: "Ledgerloop",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "An upstream field was renamed; nightly loads fail and a rushed fix just drops the column.",
    belief: "The team wants to hard-rename or drop the column to unblock loads.",
    realDriver: "A destructive rename breaks every downstream consumer; an additive, backward-compatible path (add new, dual-write, deprecate) unblocks without breakage.",
    lesson: "Manage schema change with backward/forward compatibility, not destructive edits.",
  },
  {
    id: "backfill-strategy", title: "The Blocking Backfill", company: "Chronoflow",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "A logic fix needs reprocessing two years of data, and the plan halts the daily pipeline for days.",
    belief: "The team plans to pause production and backfill in place.",
    realDriver: "Backfilling into the live table blocks fresh data and risks partial state; a side-table backfill with an atomic swap keeps production running.",
    lesson: "Backfill out-of-band and swap atomically; never block the live pipeline to reprocess.",
  },
  {
    id: "batch-idempotency", title: "The Double-Counted Day", company: "Tallyhub",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "A retried batch job appended a day's rows twice, inflating the metrics.",
    belief: "The team wants to bolt on a nightly dedup cleanup.",
    realDriver: "The job appends instead of writing the target partition atomically; making the write idempotent (partition overwrite or MERGE on key) makes retries safe.",
    lesson: "Batch jobs must be idempotent (partition overwrite or MERGE) so retries don't double-count.",
  },
  {
    id: "star-vs-obt", title: "The One Big Table", company: "Brightmetrics",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Analytics Engineer",
    situation: "BI is slow and metric definitions are inconsistent on a giant denormalized table.",
    belief: "The team wants to throw more warehouse compute at it.",
    realDriver: "One wide table duplicates dimensions and lets definitions drift; a star schema with conformed dimensions restores consistency and prunes scans.",
    lesson: "Model for the query pattern — a star schema often beats one-big-table for BI consistency and cost.",
  },
  {
    id: "denormalization", title: "The Join Storm", company: "Feedly Core",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "A read-heavy API times out doing six-way joins on every request.",
    belief: "The team wants to tune the joins or buy a bigger database.",
    realDriver: "The access pattern is read-dominant and fixed; a denormalized, precomputed read model serves it in a single lookup. Over-normalization was the cost.",
    lesson: "Match normalization to the read/write ratio; denormalize the hot read paths.",
  },
  {
    id: "olap-vs-oltp", title: "The Analytics on Prod", company: "Orderly",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "Heavy analytics queries run against the production OLTP database and slow the app.",
    belief: "The team wants to tune the queries or scale the primary database.",
    realDriver: "A row-store OLTP engine is wrong for big scans; replicating to a columnar OLAP store isolates analytics and fits the workload.",
    lesson: "Separate OLTP and OLAP; don't run analytical scans on the transactional store.",
  },
  {
    id: "materialized-views", title: "The Recomputed Dashboard", company: "Pulsegrid",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Analytics Engineer",
    situation: "A dashboard reruns a huge aggregation on every load and costs are soaring.",
    belief: "The team wants to cache the dashboard or size up the warehouse.",
    realDriver: "The aggregation is stable within a day; a scheduled materialized or incremental view computes it once and serves it cheaply.",
    lesson: "Precompute stable aggregations (materialized/incremental) instead of recomputing per view.",
  },
  {
    id: "consumer-lag", title: "The Growing Lag", company: "Fleetstream",
    domain: "Data Engineering", difficulty: "hard", estMinutes: 7, role: "Streaming Data Engineer",
    situation: "A Kafka consumer's lag grows during peak and alerts fire.",
    belief: "The team assumes the broker is undersized.",
    realDriver: "A slow downstream sink (synchronous per-record inserts) back-pressures the consumer; batching writes and adding partitions clears the lag. The broker was fine.",
    lesson: "Consumer lag usually means a slow sink or too few partitions, not a bigger broker.",
  },
  {
    id: "query-cost-governance", title: "The Runaway Bill", company: "Quantify",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Analytics Engineer",
    situation: "The warehouse bill tripled and finance wants to cap the warehouse size.",
    belief: "The team assumes the warehouse itself is too big.",
    realDriver: "A few unpartitioned SELECT-star dashboards and ad-hoc full scans drive most of the cost; partitioning plus cost controls (max bytes billed, approvals) fix it.",
    lesson: "Warehouse cost is driven by query patterns; govern the queries before capping capacity.",
  },
  {
    id: "storage-tiering", title: "The Hot Archive", company: "Reelstore",
    domain: "Data Engineering", difficulty: "intro", estMinutes: 5, role: "Data Engineer",
    situation: "Storage costs balloon from keeping seven years of raw logs on hot storage.",
    belief: "The team wants to negotiate a storage discount.",
    realDriver: "About 95% of the data is never queried after 90 days; lifecycle policies to cold/archive tiers (and aggregating old data) cut cost far more than a discount.",
    lesson: "Tier storage by access recency; don't keep cold data on hot tiers.",
  },
  {
    id: "pii-at-ingestion", title: "The Leaky Pipeline", company: "Careledger",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "Analysts have raw PII in the warehouse and a rushed plan just restricts dashboard access.",
    belief: "The team wants to lock down the dashboards.",
    realDriver: "PII entered the lake unmasked at ingestion; tokenizing/masking at ingestion with column-level policies is the real control, not last-mile dashboard locks.",
    lesson: "Govern PII where it enters (mask/tokenize at ingestion), not only at the last mile.",
  },
  {
    id: "proprietary-lockin", title: "The Convenient Format", company: "Corewarehouse",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Architect",
    situation: "A team standardizes every dataset on a proprietary warehouse-native format because it's fastest.",
    belief: "The lead assumes fastest-here means use-it-everywhere.",
    realDriver: "Their roadmap needs multi-engine access and portability; open table formats (Parquet/Iceberg) trade a little speed to avoid deep lock-in.",
    lesson: "For foundational storage, weigh raw performance against portability and lock-in.",
  },
  {
    id: "dag-blast-radius", title: "The Monolith Pipeline", company: "Settleworks",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "One giant nightly job fails at step 40 and takes everything down; reruns are all-or-nothing.",
    belief: "The team wants to add more error handling to the script.",
    realDriver: "A monolithic job has a huge blast radius; decomposing into a modular DAG of idempotent tasks enables partial retries and isolation.",
    lesson: "Modular, independently-retryable tasks shrink blast radius versus a monolith.",
  },
  {
    id: "eventual-consistency", title: "The Missing Record", company: "Cartpath",
    domain: "Data Engineering", difficulty: "hard", estMinutes: 7, role: "Data Engineer",
    situation: "A read right after a write sometimes misses the record, so the team adds retries everywhere.",
    belief: "The team assumes the database is flaky.",
    realDriver: "Reads hit an eventually-consistent replica; that path needs read-your-writes (primary read or version check), not blanket retries.",
    lesson: "Understand the consistency model and choose the right read path instead of papering over it with retries.",
  },
  {
    id: "reverse-etl", title: "The Trapped Insight", company: "Outboundly",
    domain: "Data Engineering", difficulty: "intro", estMinutes: 5, role: "Analytics Engineer",
    situation: "Sales wants warehouse segments inside the CRM, and a team is hand-exporting CSVs every week.",
    belief: "The team plans to keep exporting manually or build a bespoke sync.",
    realDriver: "Operationalizing warehouse data into tools is a solved pattern — reverse ETL — which beats brittle manual exports or a custom integration.",
    lesson: "Pushing warehouse models into operational tools is reverse ETL, a known pattern, not a bespoke build.",
  },
  {
    id: "timezone-bug", title: "The Midnight Shift", company: "Daywise",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "Daily active users show a strange dip at month boundaries and a spike elsewhere.",
    belief: "The team reads it as a real change in user behavior.",
    realDriver: "Events are stored in UTC but bucketed by local date inconsistently; a timezone handling bug shifts events across day boundaries.",
    lesson: "Standardize timezones and timestamps at ingestion; date-bucketing bugs masquerade as behavior.",
  },
  {
    id: "data-contract", title: "The Silent Upstream Change", company: "Marketgrid",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "An upstream team changes an enum's values without notice, quietly corrupting a metric.",
    belief: "The team wants to add downstream monitoring to catch it faster next time.",
    realDriver: "The missing piece is a data contract — an agreed schema/semantics with a producer-side CI check — so breaking changes are caught before publish, not just detected after.",
    lesson: "Data contracts move breakage prevention upstream to the producer; monitoring only detects it after the fact.",
  },
  {
    id: "cache-invalidation", title: "The Stale Dashboard", company: "Snapmetrics",
    domain: "Data Engineering", difficulty: "core", estMinutes: 6, role: "Data Engineer",
    situation: "A cached metrics layer is fast but occasionally shows stale numbers execs distrust.",
    belief: "The team wants to remove the cache for correctness.",
    realDriver: "Dropping the cache would blow up cost and latency; the fix is a right-sized TTL plus event-driven invalidation on the few volatile metrics.",
    lesson: "Don't kill caching for staleness — invalidate correctly (TTL/event-based) and match freshness to each metric.",
  },
];

// ── Filter facets (About / Industry / Modelling use / Statistics) ────────────
// Kept as a map keyed by id so it's independent of the generation seeds above.
const FACETS = {
  "freshbox-churn":      { about: "Churn",                    industry: "Meal-kit / D2C",         modelling: ["Segmentation", "Diagnostic analysis"], statistics: ["Correlation vs causation"] },
  "retail-promo-lift":   { about: "Promotions & pricing",     industry: "Retail",                 modelling: ["Incrementality testing", "Causal inference"], statistics: ["Counterfactual / holdout", "Cannibalization"] },
  "saas-activation-dip": { about: "Activation & onboarding",  industry: "SaaS",                   modelling: ["Segmentation", "Cohort analysis"], statistics: ["Simpson's paradox", "Mix shift"] },
  "neobank-fraud-spike": { about: "Fraud & risk",             industry: "Fintech",                modelling: ["Classification / risk scoring"], statistics: ["Base rates", "Distribution shift"] },
  "shipfast-carrier":    { about: "Delivery & logistics",     industry: "Logistics",              modelling: ["Segmentation"], statistics: ["Confounding"] },
  "cartly-checkout":     { about: "Checkout & conversion",    industry: "E-commerce",             modelling: ["Funnel analysis", "Segmentation"], statistics: ["Aggregation trap"] },
  "streamly-abtest":     { about: "Experimentation",          industry: "Streaming / media",      modelling: ["A/B testing"], statistics: ["Peeking / early stopping", "Sample ratio mismatch"] },
  "subly-ltv":           { about: "Retention economics",      industry: "Consumer subscription",  modelling: ["Cohort analysis", "LTV modelling"], statistics: ["Survivorship bias", "Cohort immaturity"] },
  "helply-csat":         { about: "Customer satisfaction",    industry: "Customer support",       modelling: ["Survey analysis"], statistics: ["Response / selection bias", "Mix shift"] },
  "pantree-stockouts":   { about: "Inventory & supply",       industry: "Grocery / supply",       modelling: ["Segmentation", "Pareto analysis"], statistics: ["Aggregation trap", "Concentration"] },
  "hospital-readmission":{ about: "Quality & outcomes",       industry: "Healthcare",             modelling: ["Risk adjustment", "Segmentation"], statistics: ["Case-mix / confounding"] },
  "gaming-arpu":         { about: "Monetization",             industry: "Gaming",                 modelling: ["Distribution analysis"], statistics: ["Mean vs median", "Outliers"] },
  "b2b-pipeline":        { about: "Sales pipeline",           industry: "B2B SaaS",               modelling: ["Cohort analysis", "Funnel analysis"], statistics: ["Right-censoring", "Cohort immaturity"] },
  "social-engagement":   { about: "Engagement",               industry: "Social media",           modelling: ["Data validation"], statistics: ["Data quality / instrumentation"] },
  "pharma-endpoint":     { about: "Clinical trial",           industry: "Pharma",                 modelling: ["Hypothesis testing"], statistics: ["Multiple comparisons"] },
  "telco-churn-model":   { about: "Churn prediction",         industry: "Telecom",                modelling: ["Classification / risk scoring", "Model validation"], statistics: ["Data leakage"] },
  "edtech-completion":   { about: "Course completion",        industry: "EdTech",                 modelling: ["Funnel analysis"], statistics: ["Metric definition change"] },
  "ride-cancellations":  { about: "Marketplace ops",          industry: "Mobility / marketplace", modelling: ["Segmentation"], statistics: ["Aggregation trap", "Confounding"] },
  "energy-forecast":     { about: "Demand forecasting",       industry: "Energy / utilities",     modelling: ["Forecasting", "Model validation"], statistics: ["Distribution shift / extrapolation"] },
  "insurance-approval":  { about: "Claims operations",        industry: "Insurance",              modelling: ["Segmentation"], statistics: ["Confounding / mix shift"] },
  // Cloud-architecture (DE) cases add the `stack` facet (cloud/tools). Their
  // `statistics` value is the quantitative signal the evidence step turns on.
  "realtime-dashboard":  { about: "Batch vs streaming",      industry: "Retail",                 modelling: ["Streaming", "Micro-batch"], statistics: ["Freshness SLA"], stack: ["Kafka", "Flink", "BigQuery"] },
  "partition-skew":      { about: "Distributed compute",     industry: "Ad tech",                modelling: ["Spark tuning"], statistics: ["Data skew"], stack: ["Spark", "Dataproc"] },
  "warehouse-vs-lakehouse": { about: "Storage architecture", industry: "B2B SaaS",               modelling: ["Lakehouse", "Warehouse"], statistics: ["Scan volume / concurrency"], stack: ["BigQuery", "Spark", "Iceberg"] },
  "orchestration-cron":  { about: "Orchestration",           industry: "Fintech",                modelling: ["Workflow orchestration"], statistics: ["Failure / retry rate"], stack: ["Airflow", "Cloud Composer"] },
  "nosql-vs-sql":        { about: "Database selection",       industry: "Marketplace",            modelling: ["OLTP design"], statistics: ["Throughput (QPS)"], stack: ["PostgreSQL", "Cassandra"] },
  "exactly-once":        { about: "Streaming semantics",      industry: "Logistics",              modelling: ["Idempotency", "Streaming"], statistics: ["Duplicate rate"], stack: ["Kafka", "dbt", "BigQuery"] },
  "file-format-scans":   { about: "Storage architecture",     industry: "Media",                  modelling: ["Columnar storage", "Partitioning"], statistics: ["Bytes scanned"], stack: ["Parquet", "S3", "Athena"] },
  "cdc-vs-fullload":     { about: "Ingestion pattern",        industry: "E-commerce",             modelling: ["CDC / incremental"], statistics: ["Change rate"], stack: ["Debezium", "BigQuery", "dbt"] },
  "capacity-autoscale":  { about: "Cost & scaling",           industry: "Retail",                 modelling: ["Autoscaling", "Serverless"], statistics: ["Peak-to-median ratio"], stack: ["Dataflow", "GCP"] },
  "data-quality-gate":   { about: "Data quality",             industry: "Healthcare",             modelling: ["Data contracts", "Validation"], statistics: ["Null / anomaly rate"], stack: ["dbt", "Great Expectations"] },

  // Audit batch — statistical & analytical judgment (no `stack`; method-driven).
  "store-remodel-regression": { about: "Store performance",   industry: "Retail",                 modelling: ["Causal inference"], statistics: ["Regression to the mean"] },
  "referral-channel-selection": { about: "Acquisition channels", industry: "SaaS",                modelling: ["Segmentation"], statistics: ["Selection bias"] },
  "support-target-goodhart": { about: "SLA & targets",        industry: "Customer support",       modelling: ["Metric design"], statistics: ["Goodhart / gaming"] },
  "hiring-collider":     { about: "Hiring analytics",         industry: "Tech / HR",              modelling: ["Causal inference"], statistics: ["Collider bias"] },
  "region-ecological":   { about: "Media mix",                industry: "Marketing",              modelling: ["Causal inference"], statistics: ["Ecological fallacy"] },
  "spam-precision":      { about: "Classification quality",   industry: "Email / messaging",      modelling: ["Classification"], statistics: ["Precision / base rate"] },
  "call-length-bias":    { about: "Call operations",          industry: "Telecom",                modelling: ["Sampling design"], statistics: ["Length bias"] },
  "feature-novelty":     { about: "Feature adoption",         industry: "Product / tech",         modelling: ["Cohort analysis"], statistics: ["Novelty effect"] },
  "yoy-seasonality":     { about: "Sales trends",             industry: "E-commerce",             modelling: ["Time series"], statistics: ["Seasonality"] },
  "unicorn-survivorship": { about: "Success factors",         industry: "Startups / VC",          modelling: ["Comparative analysis"], statistics: ["Survivorship bias"] },
  "backtest-window":     { about: "Backtesting",              industry: "Finance / trading",      modelling: ["Backtesting"], statistics: ["Overfitting / p-hacking"] },
  "ratio-spurious":      { about: "Plant efficiency",         industry: "Manufacturing",          modelling: ["Diagnostic analysis"], statistics: ["Spurious correlation"] },
  "reverse-causation-notifs": { about: "Retention drivers",   industry: "Product / tech",         modelling: ["Causal inference"], statistics: ["Reverse causation"] },
  "loyalty-immortal-time": { about: "Loyalty programs",       industry: "Retail",                 modelling: ["Survival analysis"], statistics: ["Immortal time bias"] },
  "course-attrition":    { about: "Course experiments",       industry: "EdTech",                 modelling: ["Experimentation"], statistics: ["Attrition bias"] },
  "unweighted-average":  { about: "Conversion metrics",       industry: "Insurance",              modelling: ["Segmentation"], statistics: ["Weighting / aggregation"] },
  "ceiling-effect":      { about: "Activation",               industry: "Product / tech",         modelling: ["Segmentation"], statistics: ["Ceiling effect"] },
  "confounding-indication": { about: "Treatment outcomes",    industry: "Healthcare",             modelling: ["Risk adjustment"], statistics: ["Confounding by indication"] },
  "leading-lagging":     { about: "Pipeline metrics",         industry: "B2B SaaS",               modelling: ["Cohort analysis"], statistics: ["Lag / time alignment"] },
  "denominator-shift":   { about: "Fraud metrics",            industry: "Fintech",                modelling: ["Diagnostic analysis"], statistics: ["Denominator shift"] },
  "proxy-metric-drift":  { about: "Metric design",            industry: "Product / tech",         modelling: ["Metric design"], statistics: ["Proxy divergence"] },
  "test-composition":    { about: "Experimentation",          industry: "Marketplace",            modelling: ["Experimentation"], statistics: ["Composition change"] },
  "serving-cost-outliers": { about: "Unit economics",         industry: "SaaS / cloud",           modelling: ["Distribution analysis"], statistics: ["Outliers / mean vs median"] },
  "heterogeneous-effects": { about: "Pricing experiments",    industry: "Product / tech",         modelling: ["Experimentation"], statistics: ["Heterogeneous effects"] },
  "underpowered-null":   { about: "Experimentation",          industry: "Startups / product",     modelling: ["Experimentation"], statistics: ["Statistical power"] },
  "network-spillover":   { about: "Experimentation",          industry: "Social media",           modelling: ["Experimentation"], statistics: ["Interference / SUTVA"] },
  "twymans-law":         { about: "Data validation",          industry: "Analytics",              modelling: ["Data validation"], statistics: ["Instrumentation error"] },
  "randomization-unit":  { about: "Experimentation",          industry: "E-commerce",             modelling: ["Experimentation"], statistics: ["Unit of randomization"] },
  "targeting-confound":  { about: "Promotions",               industry: "Retail",                 modelling: ["Causal inference"], statistics: ["Targeting confound"] },
  "overlapping-cis":     { about: "Metric comparison",        industry: "Product / tech",         modelling: ["Experimentation"], statistics: ["Overlapping CIs"] },

  // Audit batch — ML / data-science modeling (`stack` = frameworks/tools).
  "preprocessing-leakage": { about: "Model validation",       industry: "Data science",           modelling: ["Model validation"], statistics: ["Preprocessing leakage"], stack: ["scikit-learn"] },
  "accuracy-paradox":    { about: "Model evaluation",         industry: "Fintech",                modelling: ["Classification"], statistics: ["Class imbalance"], stack: ["scikit-learn"] },
  "concept-drift":       { about: "Model monitoring",         industry: "Media / streaming",      modelling: ["Model monitoring"], statistics: ["Concept drift"], stack: ["MLflow"] },
  "threshold-cost":      { about: "Decision thresholds",      industry: "Telecom",                modelling: ["Classification"], statistics: ["Threshold / cost tradeoff"], stack: ["scikit-learn"] },
  "tuning-on-test":      { about: "Model validation",         industry: "Data science",           modelling: ["Model validation"], statistics: ["Adaptive overfitting"], stack: ["Optuna"] },
  "importance-causation": { about: "Model interpretation",    industry: "SaaS",                   modelling: ["Model interpretation"], statistics: ["Importance vs causation"], stack: ["SHAP"] },
  "label-bias":          { about: "Fairness / bias",          industry: "HR / tech",              modelling: ["Classification"], statistics: ["Label bias"], stack: ["scikit-learn"] },
  "offline-online-gap":  { about: "Recommenders",             industry: "E-commerce",             modelling: ["Recommenders"], statistics: ["Offline / online gap"], stack: ["TensorFlow"] },
  "calibration":         { about: "Model calibration",        industry: "Insurance",              modelling: ["Classification"], statistics: ["Calibration"], stack: ["scikit-learn"] },
  "train-serve-skew":    { about: "MLOps",                    industry: "Data science",           modelling: ["Feature engineering"], statistics: ["Train-serve skew"], stack: ["Feature store"] },
  "reject-inference":    { about: "Credit modeling",          industry: "Fintech / lending",      modelling: ["Classification"], statistics: ["Selection / reject inference"], stack: ["XGBoost"] },
  "shortcut-learning":   { about: "Model robustness",         industry: "Healthcare / ML",        modelling: ["Computer vision"], statistics: ["Shortcut learning"], stack: ["PyTorch"] },
  "extrapolation-pricing": { about: "Price optimization",     industry: "Retail",                 modelling: ["Regression"], statistics: ["Extrapolation"], stack: ["scikit-learn"] },
  "resample-prior-shift": { about: "Model calibration",       industry: "Data science",           modelling: ["Classification"], statistics: ["Prior shift"], stack: ["imbalanced-learn"] },
  "metric-mismatch":     { about: "Model evaluation",         industry: "Logistics",              modelling: ["Regression"], statistics: ["Metric selection"], stack: ["LightGBM"] },
  "temporal-cv":         { about: "Model validation",         industry: "Retail / forecasting",   modelling: ["Time series"], statistics: ["Temporal leakage"], stack: ["scikit-learn"] },
  "post-outcome-feature": { about: "Model validation",        industry: "Insurance",              modelling: ["Classification"], statistics: ["Target leakage"], stack: ["XGBoost"] },
  "small-data-overfit":  { about: "Model validation",         industry: "Biotech",                modelling: ["Model validation"], statistics: ["Overfitting (p>n)"], stack: ["scikit-learn"] },
  "prediction-feedback-loop": { about: "Model monitoring",    industry: "Platform / ML",          modelling: ["Model monitoring"], statistics: ["Feedback loop"], stack: ["MLflow"] },
  "group-leakage":       { about: "Model validation",         industry: "ML / computer vision",   modelling: ["Computer vision"], statistics: ["Group leakage"], stack: ["PyTorch"] },

  // Audit batch — data engineering / cloud architecture (`stack` = cloud/tools).
  "small-files":         { about: "Storage layout",           industry: "IoT / telemetry",        modelling: ["Lakehouse"], statistics: ["File count / overhead"], stack: ["Spark", "S3"] },
  "over-partitioning":   { about: "Partitioning",             industry: "SaaS",                   modelling: ["Partitioning"], statistics: ["Cardinality"], stack: ["BigQuery"] },
  "schema-evolution":    { about: "Schema management",        industry: "Fintech",                modelling: ["Data modeling"], statistics: ["Schema compatibility"], stack: ["Avro", "Kafka"] },
  "backfill-strategy":   { about: "Reprocessing",             industry: "Analytics",              modelling: ["Batch processing"], statistics: ["Backfill safety"], stack: ["Airflow", "BigQuery"] },
  "batch-idempotency":   { about: "Pipeline reliability",     industry: "E-commerce",             modelling: ["Batch processing"], statistics: ["Idempotency"], stack: ["Spark", "Delta Lake"] },
  "star-vs-obt":         { about: "Data modeling",            industry: "Retail / BI",            modelling: ["Dimensional modeling"], statistics: ["Schema design"], stack: ["dbt", "Snowflake"] },
  "denormalization":     { about: "Data modeling",            industry: "Consumer app",           modelling: ["OLTP design"], statistics: ["Read/write ratio"], stack: ["PostgreSQL", "Redis"] },
  "olap-vs-oltp":        { about: "Workload separation",      industry: "SaaS",                   modelling: ["Warehouse"], statistics: ["Workload fit"], stack: ["PostgreSQL", "BigQuery"] },
  "materialized-views":  { about: "Query optimization",       industry: "Analytics",              modelling: ["Materialization"], statistics: ["Recompute cost"], stack: ["dbt", "BigQuery"] },
  "consumer-lag":        { about: "Streaming ops",            industry: "Logistics",              modelling: ["Streaming"], statistics: ["Consumer lag"], stack: ["Kafka", "BigQuery"] },
  "query-cost-governance": { about: "Cost governance",        industry: "SaaS",                   modelling: ["Cost optimization"], statistics: ["Bytes scanned"], stack: ["BigQuery"] },
  "storage-tiering":     { about: "Storage cost",             industry: "Media",                  modelling: ["Storage lifecycle"], statistics: ["Access recency"], stack: ["S3 Glacier"] },
  "pii-at-ingestion":    { about: "Data governance",          industry: "Healthcare",             modelling: ["Data governance"], statistics: ["PII handling"], stack: ["dbt", "Snowflake"] },
  "proprietary-lockin":  { about: "Storage architecture",     industry: "Enterprise",             modelling: ["Lakehouse"], statistics: ["Portability / lock-in"], stack: ["Iceberg", "Parquet"] },
  "dag-blast-radius":    { about: "Pipeline design",          industry: "Fintech",                modelling: ["Workflow orchestration"], statistics: ["Blast radius"], stack: ["Airflow"] },
  "eventual-consistency": { about: "Consistency",             industry: "E-commerce",             modelling: ["Distributed systems"], statistics: ["Consistency model"], stack: ["DynamoDB"] },
  "reverse-etl":         { about: "Operational analytics",    industry: "B2B SaaS",               modelling: ["Reverse ETL"], statistics: ["Sync pattern"], stack: ["dbt", "Hightouch"] },
  "timezone-bug":        { about: "Data quality",             industry: "Consumer app",           modelling: ["Data validation"], statistics: ["Timezone handling"], stack: ["dbt"] },
  "data-contract":       { about: "Data contracts",           industry: "Marketplace",            modelling: ["Data contracts"], statistics: ["Contract enforcement"], stack: ["dbt", "Kafka"] },
  "cache-invalidation":  { about: "Caching",                  industry: "Analytics",              modelling: ["Caching"], statistics: ["Cache freshness"], stack: ["Redis", "BigQuery"] },
};

// ── Prompts ──────────────────────────────────────────────────────────────────
const SYSTEM = `You author cases for "The Case Room", a strategic-judgment trainer for data/analytics learners. A case teaches ONE analytical lesson by making the learner commit to high-level decisions, each with a baked-in consequence, then diffing their path against a gold path.

You output ONE JSON object matching this exact schema (no prose, no markdown, no code fences — JSON only):

- id, title
- scenario: { role, company, situation, stakeholderBelief, question }
- decisions: an array of EXACTLY three, in this order and with these exact ids and flags:
  1. { id:"framing",        flag:"framing_quality", prompt, options:[4], gold }
  2. { id:"evidence",       flag:"metric_validity", prompt, artifact, options:[2], gold }
  3. { id:"interpretation", flag:"causal_caution",  prompt, options:[2], gold }
- goldPath: { framing, evidence, interpretation } — each the gold option id
- insight: 2–4 sentences revealing the real driver and naming the lesson

Every option: { id ("A","B",...), label, detail, flag ("strong"|"weak"), consequence, divergenceCost }.
Rules that MUST hold:
- In each decision EXACTLY ONE option has flag "strong", and its id equals that decision's "gold" and goldPath entry.
- The strong option's divergenceCost is "" (empty). Every weak option has a SHORT, DISTINCT divergenceCost (what choosing it cost — one clause).
- framing has 4 options (1 strong = the sound investigative framing; 3 weak, each a different real analyst mistake). evidence has 2 (strong = the valid/normalized metric; weak = the naive metric that fakes the signal). interpretation has 2 (strong = state the finding but recommend confirming causally / a holdout; weak = overclaim causation and act).
- "consequence" is what the learner sees AFTER committing: concrete, 1–3 sentences, shows why a weak choice misleads and why the strong choice opens the real thread. Never punitive.
- The stakeholderBelief is a PLAUSIBLE red herring; the case must be winnable by sound reasoning, and the insight is non-obvious.
- artifact (evidence decision) is a placeholder chart: { type:"bars", title, bars:[{label,value,highlight?}], caption }. Give the STRONG evidence option its own artifact too (the normalized/correct view that makes the real driver unmistakable, with the real-driver bar highlighted:true). Keep numbers plausible and internally consistent with the story.

Here is a complete, gold-standard example case to match in structure and quality:

${CHURN}`;

function genUser(brief) {
  return `Author a new case as JSON.

id: ${brief.id}
title: ${brief.title}
role: ${brief.role}
company: ${brief.company}
situation: ${brief.situation}
stakeholder belief (the red herring): ${brief.belief}
the REAL driver (what segmentation / the valid metric reveals): ${brief.realDriver}
the lesson to teach: ${brief.lesson}

Build the three decisions so a sound analyst reaches the real driver: framing = how to investigate (strong = diagnostic/counterfactual framing that doesn't anchor on the belief); evidence = which metric/cut to trust (strong = the valid one that exposes the real driver; give it the highlighted artifact); interpretation = what to tell the stakeholder (strong = findings + appropriate caution + a path to certainty). Make the insight land the lesson. Output JSON only.`;
}

const CRITIC_SYSTEM = `You are a strict reviewer of "Case Room" cases (strategic-judgment training for data analysts). Judge ONLY the case JSON you are given. Return JSON: { "verdict": "pass" | "revise", "issues": string[] }.

Flag an issue (→ "revise") if ANY of these fail:
- There is not exactly one defensible gold/strong option per decision, or a "weak" option is actually just as good as the gold.
- The stakeholder belief is not a PLAUSIBLE red herring (too obviously wrong, or actually correct).
- The three muscles aren't orthogonal: framing (how to investigate), evidence (metric validity), judgment (causal caution) should each test a distinct thing.
- Any weak option's divergenceCost is vague, generic, or duplicates another.
- The insight is obvious, or not actually supported by the case's own decisions/artifact.
- The artifact numbers contradict the story (e.g. the highlighted bar isn't the real driver, or the naive vs normalized views don't tell the intended trap).
- It doesn't read like a real job scenario.
Be terse. If it's genuinely good, return {"verdict":"pass","issues":[]}.`;

// ── Claude call + JSON extraction ────────────────────────────────────────────
async function call(system, user, maxTokens = 3000) {
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }],
  });
  return res.content[0]?.type === "text" ? res.content[0].text : "";
}
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in model output");
  return JSON.parse(body.slice(start, end + 1));
}

// ── Deterministic schema validation ──────────────────────────────────────────
const EXPECTED = [
  { id: "framing", flag: "framing_quality", n: 4 },
  { id: "evidence", flag: "metric_validity", n: 2 },
  { id: "interpretation", flag: "causal_caution", n: 2 },
];
function validate(c) {
  const e = [];
  if (!c || typeof c !== "object") return ["not an object"];
  if (!c.id) e.push("missing id");
  if (!c.title) e.push("missing title");
  const s = c.scenario ?? {};
  for (const k of ["role", "company", "situation", "stakeholderBelief", "question"])
    if (!s[k]) e.push(`scenario.${k} missing`);
  if (!Array.isArray(c.decisions) || c.decisions.length !== 3) {
    e.push("decisions must be an array of 3");
    return e;
  }
  c.decisions.forEach((d, i) => {
    const exp = EXPECTED[i];
    if (d.id !== exp.id) e.push(`decision ${i} id "${d.id}" != "${exp.id}"`);
    if (d.flag !== exp.flag) e.push(`decision ${d.id} flag "${d.flag}" != "${exp.flag}"`);
    if (!d.prompt) e.push(`decision ${d.id} missing prompt`);
    if (!Array.isArray(d.options) || d.options.length !== exp.n)
      e.push(`decision ${d.id} must have ${exp.n} options`);
    const strong = (d.options ?? []).filter((o) => o.flag === "strong");
    if (strong.length !== 1) e.push(`decision ${d.id} must have exactly 1 strong option (has ${strong.length})`);
    else if (strong[0].id !== d.gold) e.push(`decision ${d.id} gold "${d.gold}" != strong option "${strong[0].id}"`);
    if (c.goldPath?.[d.id] !== d.gold) e.push(`goldPath.${d.id} != decision gold`);
    (d.options ?? []).forEach((o) => {
      for (const k of ["id", "label", "detail", "consequence"]) if (!o[k]) e.push(`decision ${d.id} option ${o.id ?? "?"}: missing ${k}`);
      if (!["strong", "weak"].includes(o.flag)) e.push(`decision ${d.id} option ${o.id}: bad flag`);
      if (o.flag === "weak" && !o.divergenceCost?.trim()) e.push(`decision ${d.id} option ${o.id}: weak needs divergenceCost`);
      if (o.flag === "strong" && o.divergenceCost && o.divergenceCost.trim()) e.push(`decision ${d.id} strong option ${o.id}: divergenceCost must be ""`);
    });
  });
  if (!c.insight?.trim()) e.push("missing insight");
  return e;
}

// ── Author one brief (generate → validate/repair → critique/revise) ──────────
async function author(brief) {
  let obj = extractJson(await call(SYSTEM, genUser(brief)));
  let errs = validate(obj);
  let round = 0;
  // Repair schema failures, then run one critic pass (and one revise) — capped.
  while (round < 3) {
    if (errs.length) {
      const fix = `The case JSON you produced has schema problems. Fix ALL of these and return the full corrected JSON only:\n- ${errs.join("\n- ")}\n\nHere is the JSON to fix:\n${JSON.stringify(obj)}`;
      obj = extractJson(await call(SYSTEM, fix));
      errs = validate(obj);
      round++;
      continue;
    }
    const critique = extractJson(await call(CRITIC_SYSTEM, JSON.stringify(obj)));
    if (critique.verdict === "pass" || round >= 2) {
      return { obj, critique, rounds: round, schemaOk: errs.length === 0 };
    }
    const revise = `A reviewer flagged these issues. Revise the case to fix them and return the full JSON only:\n- ${(critique.issues ?? []).join("\n- ")}\n\nCase to revise:\n${JSON.stringify(obj)}`;
    obj = extractJson(await call(SYSTEM, revise));
    errs = validate(obj);
    round++;
  }
  return { obj, critique: { verdict: "revise", issues: ["max rounds reached"] }, rounds: round, schemaOk: errs.length === 0 };
}

// ── Run ──────────────────────────────────────────────────────────────────────
async function main() {
  const targets = MANIFEST_ONLY
    ? []
    : BRIEFS.filter((b) => (ONLY ? b.id === ONLY : true)).filter(
        (b) => FORCE || !existsSync(path.join(DATA_DIR, `${b.id}.json`)),
      );
  console.log(
    MANIFEST_ONLY
      ? "Manifest-only: validating case files on disk and rebuilding manifest…\n"
      : `Authoring ${targets.length} case(s) with ${MODEL}…\n`,
  );

  const results = [];
  for (const brief of targets) {
    process.stdout.write(`• ${brief.id} … `);
    try {
      const { obj, critique, rounds, schemaOk } = await author(brief);
      obj.id = brief.id; // pin id regardless of what the model echoed
      writeFileSync(path.join(DATA_DIR, `${brief.id}.json`), JSON.stringify(obj, null, 2) + "\n");
      const errs = validate(obj);
      results.push({ brief, ok: errs.length === 0, verdict: critique.verdict, issues: critique.issues ?? [], rounds });
      console.log(`${errs.length === 0 ? "schema ✓" : "schema ✗"} · critic:${critique.verdict} · ${rounds} revision(s)`);
      if (errs.length) console.log(`    schema errors: ${errs.join("; ")}`);
    } catch (err) {
      results.push({ brief, ok: false, error: err.message });
      console.log(`FAILED: ${err.message}`);
    }
  }

  // Rebuild the manifest: churn first, then every authored case that exists.
  const stubs = [
    { id: "freshbox-churn", title: "The Churn Spike", company: "FreshBox", difficulty: "intro", domain: "Data Analysis", estMinutes: 5, facets: FACETS["freshbox-churn"] },
    ...BRIEFS.filter((b) => existsSync(path.join(DATA_DIR, `${b.id}.json`))).map((b) => ({
      id: b.id, title: b.title, company: b.company, difficulty: b.difficulty, domain: b.domain, estMinutes: b.estMinutes, facets: FACETS[b.id],
    })),
  ];
  writeFileSync(path.join(DATA_DIR, "manifest.json"), JSON.stringify({ batch: "2026-07", cases: stubs }, null, 2) + "\n");

  console.log(`\nManifest rebuilt: ${stubs.length} cases in batch 2026-07.`);

  // Manifest-only: schema-check every case file on disk (hand-authored cases
  // never went through the generate→validate loop, so verify them here).
  if (MANIFEST_ONLY) {
    let bad = 0;
    for (const stub of stubs) {
      const raw = readFileSync(path.join(DATA_DIR, `${stub.id}.json`), "utf8");
      const errs = validate(JSON.parse(raw));
      if (errs.length) {
        bad++;
        console.log(`  ✗ ${stub.id}: ${errs.join("; ")}`);
      }
    }
    console.log(
      bad === 0
        ? `All ${stubs.length} case files passed schema validation.`
        : `\n⚠ ${bad} case file(s) failed schema validation — fix before publishing.`,
    );
    return;
  }

  const flagged = results.filter((r) => !r.ok || r.verdict === "revise" || r.error);
  if (flagged.length) {
    console.log(`\n⚠ ${flagged.length} case(s) need your eyes:`);
    for (const r of flagged) console.log(`  - ${r.brief.id}: ${r.error ?? `${r.verdict} (${(r.issues ?? []).join("; ") || "schema"})`}`);
  } else {
    console.log("\nAll authored cases passed schema + critic. Review the content before publishing.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
