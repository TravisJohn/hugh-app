// ── Curated R practice packs ───────────────────────────────────────────────
//
// The R counterpart to the Python, SQL and JavaScript packs. `lang: "r"`: cells
// run on WebR (see lib/code/rClient.ts) and a cell's `assertions` is R code
// using the `assert` defined in R_PRELUDE — the Python contract, not the SQL
// one.
//
// WHY R IS SPLIT IN TWO.
// R's cost was measured before any of this was written: in real Chrome, cold
// cache, 4.2s and 11.9MB to a runnable base-R cell, but 15.6s and 19.6MB once
// dplyr and its 16 dependencies are installed. So `r-lang-basics` is base R
// only and boots in about four seconds, and only the two analysis packs declare
// `preloadPackages: ["dplyr"]` and pay for the tidyverse. A learner drilling
// vectors should not wait for tibble.
//
// Base R is used wherever base R is genuinely what an analyst would type
// (`trimws`, `tolower`, `as.numeric`, `unique`, `max`, `which.max`), and dplyr
// only where dplyr is the idiom (`filter`, `mutate`, `rename`, `arrange`,
// `group_by`/`summarise`). Drilling `subset()` and `aggregate()` would be
// teaching R nobody writes any more; drilling dplyr for `tolower` would be
// teaching a dependency for no reason.
//
// AUTHORING RULES, shared with jsPacks.ts:
//
//  1. Every cell's LAST line must be a plain `name <- …` assignment, so
//     resultVarOf can find the variable to preview.
//  2. Every cell is EXECUTED before shipping — see scripts note in PROJECT_LOG.
//     R has traps a reading pass will not catch: 1-based indexing, `==` on
//     vectors recycling instead of erroring, and integer-vs-double identity.
//     `identical()` is used for exact checks precisely because it is strict
//     about type, which is where a wrong expected value would otherwise hide.

import { rDataFrameLiteral, type DataRow, type DrillContent } from "./drillContent";
import type { DrillPack } from "./packs";

/** Prepended to the dplyr packs' setup. Startup chatter would otherwise land in stdout. */
const LIBRARY_DPLYR = "suppressPackageStartupMessages(library(dplyr))";

// ── Pack 1: R basics (base R, no dplyr) ────────────────────────────────────
const R_BASICS: DrillContent = {
  lang: "r",
  cumulative: false,
  scenario: {
    title: "R basics — vectors, data frames, and the assignment arrow",
    role: "You can already do this in Python. This is the same handful of moves in R, so the language stops being in the way.",
    goal: "Each cell is one small self-contained snippet — vectors, indexing, vectorised arithmetic, data frames, ifelse. Independent reps; write each from memory.",
    outcome: "That's the R you need before any analysis: <-, c(), 1-based indexing, logical subsetting, vectorised maths, data.frame, $ and ifelse.",
    setupCode: "",
  },
  cells: [
    {
      id: "total",
      task: "Create total — the price 20 multiplied by the quantity 3. Bind price and qty first.",
      why: "`<-` is R's assignment. `=` mostly works too, but every R codebase you will read uses the arrow.",
      solution: "price <- 20\nqty <- 3\ntotal <- price * qty",
      assertions: "assert(total == 60)",
      narrative: "Three bindings with the arrow. Read `<-` as 'gets': total gets price times qty.",
      steps: [
        { do: "Bind the two inputs", code: "price <- 20\nqty <- 3" },
        { do: "Derive the result", code: "total <- price * qty" },
      ],
    },
    {
      id: "first",
      task: "Create nums, the vector 4, 7, 2, 9 — then first, its FIRST element.",
      why: "R indexes from 1, not 0. This is the single most common error a Python-first analyst makes in R.",
      solution: "nums <- c(4, 7, 2, 9)\nfirst <- nums[1]",
      assertions: "assert(first == 4)\nassert(length(nums) == 4)",
      narrative: "`c()` combines values into a vector. `nums[1]` is the first element — in Python that same expression would give you the second.",
      steps: [
        { do: "Combine the values into a vector", code: "nums <- c(4, 7, 2, 9)" },
        { do: "Take the first element (1-based)", code: "first <- nums[1]" },
      ],
    },
    {
      id: "big",
      task: "Create big — the elements of nums greater than 4.",
      why: "Logical subsetting is R's filter. The brackets take a condition, not just a position.",
      solution: "nums <- c(4, 7, 2, 9)\nbig <- nums[nums > 4]",
      assertions: "assert(identical(big, c(7, 9)))",
      narrative: "`nums > 4` produces TRUE/FALSE for every element, and `nums[...]` keeps the TRUEs. It is the same idea as a pandas boolean mask.",
      steps: [
        { do: "Build the condition", code: "nums > 4" },
        { do: "Subset with it", code: "big <- nums[nums > 4]" },
      ],
    },
    {
      id: "doubled",
      task: "Create doubled — every element of nums multiplied by 2.",
      why: "R arithmetic is vectorised by default. There is no loop and no map — you just multiply.",
      solution: "nums <- c(4, 7, 2, 9)\ndoubled <- nums * 2",
      assertions: "assert(identical(doubled, c(8, 14, 4, 18)))",
      narrative: "`nums * 2` applies to all four elements at once. This is why R code that looks scalar usually is not.",
      steps: [
        { do: "Multiply the whole vector", code: "doubled <- nums * 2" },
      ],
    },
    {
      id: "label",
      task: 'Create label — the string "Ann sold 3" built from who and sold.',
      why: "`paste` joins values into a string, inserting a space between them.",
      solution: 'who <- "Ann"\nsold <- 3\nlabel <- paste(who, "sold", sold)',
      assertions: 'assert(label == "Ann sold 3")',
      narrative: "`paste` separates its arguments with a space by default; `paste0` is the same function with no separator.",
      steps: [
        { do: "Bind the pieces", code: 'who <- "Ann"\nsold <- 3' },
        { do: "Join them into one string", code: 'label <- paste(who, "sold", sold)' },
      ],
    },
    {
      id: "avg",
      task: "Create avg — the mean of 1, 2, 3, 4, 5.",
      why: "The summary functions are base R and take a vector directly — no import, no method call.",
      solution: "avg <- mean(c(1, 2, 3, 4, 5))",
      assertions: "assert(avg == 3)",
      narrative: "`mean`, `sum`, `min`, `max`, `median` all take a vector and return one number. This is where R is at its most direct.",
      steps: [
        { do: "Build the vector", code: "c(1, 2, 3, 4, 5)" },
        { do: "Average it", code: "avg <- mean(...)" },
      ],
    },
    {
      id: "people",
      task: "Create people — a data frame with a name column (Ann, Ben) and a city column (London, Paris).",
      why: "The data frame is R's table. Columns are vectors, and they must be the same length.",
      solution: 'people <- data.frame(name = c("Ann", "Ben"), city = c("London", "Paris"), stringsAsFactors = FALSE)',
      assertions: 'assert(nrow(people) == 2)\nassert(identical(people$city, c("London", "Paris")))',
      narrative: "Each argument becomes a column. `stringsAsFactors = FALSE` keeps the text as text — the default since R 4.0, but worth writing while you are learning what a factor is.",
      steps: [
        { do: "Open a data frame", code: "people <- data.frame(" },
        { do: "Give each column as a vector", code: 'name = c("Ann", "Ben"), city = c("London", "Paris")' },
      ],
    },
    {
      id: "cities",
      task: "Create cities — the city column of people.",
      why: "`$` pulls a column out as a plain vector, which is what every base-R function wants.",
      solution: 'people <- data.frame(name = c("Ann", "Ben"), city = c("London", "Paris"), stringsAsFactors = FALSE)\ncities <- people$city',
      assertions: 'assert(identical(cities, c("London", "Paris")))',
      narrative: "`people$city` is the column, not a one-column table. That distinction matters the moment you pass it to `mean` or `tolower`.",
      steps: [
        { do: "Reach for the column by name", code: "cities <- people$city" },
      ],
    },
    {
      id: "band",
      task: 'Create band — "high" where scores is 70 or more, "low" elsewhere. Bind scores to 72 and 40 first.',
      why: "`ifelse` is the vectorised if. Plain `if` handles one value and will not do here.",
      solution: 'scores <- c(72, 40)\nband <- ifelse(scores >= 70, "high", "low")',
      assertions: 'assert(identical(band, c("high", "low")))',
      narrative: "`ifelse(test, yes, no)` runs elementwise and returns a vector the same length as the test. Using `if` here would quietly look at only the first score in older R, and error in current R.",
      steps: [
        { do: "Write the elementwise test", code: "scores >= 70" },
        { do: "Give the two outcomes", code: 'band <- ifelse(scores >= 70, "high", "low")' },
      ],
    },
  ],
};

// ── Pack 2: Clean & shape (dplyr) ──────────────────────────────────────────
const CLEAN_ROWS: DataRow[] = [
  { name: " Ann ", city: "london", amount: "30", status: "active" },
  { name: "Ben",   city: "LONDON", amount: "50", status: "active" },
  { name: "Cara ", city: "Paris",  amount: "20", status: "ACTIVE" },
  { name: "Dan",   city: "paris",  amount: "70", status: "inactive" },
  { name: " Eve",  city: "London", amount: "0",  status: "active" },
  { name: "Finn",  city: "paris",  amount: "50", status: "Inactive" },
];

const R_CLEAN_SHAPE: DrillContent = {
  lang: "r",
  cumulative: false,
  preloadPackages: ["dplyr"],
  scenario: {
    title: "Clean & shape data — tidy a messy data frame (R)",
    role: "The data came in dirty: stray spaces, inconsistent case, amounts stored as text. Whip `rows` into shape.",
    goal: "Each cell is one standard cleaning move on the same `rows` — trimws, tolower, as.numeric, filter, mutate, rename, arrange. Independent reps; write each from memory.",
    outcome: "That's the R tidy-up toolkit — trim, lowercase, cast, filter, dedupe, derive, rename, sort. The same moves as pandas, spelled in base R and dplyr.",
    setupCode: `${LIBRARY_DPLYR}\n${rDataFrameLiteral(CLEAN_ROWS)}`,
    dataset: CLEAN_ROWS,
  },
  cells: [
    {
      id: "trimmed",
      task: "Create trimmed — every name with its surrounding spaces removed.",
      why: "`trimws` is vectorised, so one call cleans the whole column.",
      focus: ["name"],
      solution: "trimmed <- trimws(rows$name)",
      assertions: 'assert(identical(trimmed, c("Ann", "Ben", "Cara", "Dan", "Eve", "Finn")))',
      narrative: "`rows$name` is the column as a character vector, and `trimws` runs down all six values at once. No loop, no apply.",
      steps: [
        { do: "Take the column", code: "rows$name" },
        { do: "Trim every value", code: "trimmed <- trimws(...)" },
      ],
    },
    {
      id: "cities",
      task: "Create cities — every city, lowercased.",
      why: "Normalising case is what stops \"London\" and \"LONDON\" counting as two places.",
      focus: ["city"],
      solution: "cities <- tolower(rows$city)",
      assertions: 'assert(identical(cities, c("london", "london", "paris", "paris", "london", "paris")))',
      narrative: "Same shape as the trim: one vectorised base-R function applied to the whole column.",
      steps: [
        { do: "Take the column", code: "rows$city" },
        { do: "Lowercase every value", code: "cities <- tolower(...)" },
      ],
    },
    {
      id: "amounts",
      task: "Create amounts — every amount converted from text to a number.",
      why: "Amounts arrive as text constantly, and R will not add character values for you.",
      focus: ["amount"],
      solution: "amounts <- as.numeric(rows$amount)",
      assertions: "assert(identical(amounts, c(30, 50, 20, 70, 0, 50)))",
      narrative: "`as.numeric` converts the character column to doubles. Anything it cannot parse becomes NA with a warning rather than an error — worth knowing before you trust the result.",
      steps: [
        { do: "Take the column", code: "rows$amount" },
        { do: "Cast it to numbers", code: "amounts <- as.numeric(...)" },
      ],
    },
    {
      id: "active",
      task: "Create active — only the rows whose status is active, whatever its capitalisation.",
      why: "`filter` keeps rows. It is the dplyr verb you will reach for most.",
      focus: ["status"],
      solution: 'active <- filter(rows, tolower(status) == "active")',
      assertions: 'assert(nrow(active) == 4)\nassert(identical(trimws(active$name), c("Ann", "Ben", "Cara", "Eve")))',
      narrative: "Inside a dplyr verb you name columns bare — `status`, not `rows$status`. Lowercasing inside the test is what catches \"ACTIVE\" alongside \"active\".",
      steps: [
        { do: "Filter the data frame", code: "filter(rows," },
        { do: "Test the normalised status", code: 'tolower(status) == "active")' },
      ],
    },
    {
      id: "unique_cities",
      task: "Create unique_cities — the distinct lowercased cities.",
      why: "`unique` on a vector is the shortest honest way to see a column's levels.",
      focus: ["city"],
      solution: "unique_cities <- unique(tolower(rows$city))",
      assertions: 'assert(identical(unique_cities, c("london", "paris")))',
      narrative: "Lowercase first, then de-duplicate — the other order would leave \"London\" and \"LONDON\" as two distinct values. `unique` keeps first-appearance order.",
      steps: [
        { do: "Normalise the column", code: "tolower(rows$city)" },
        { do: "Keep one of each", code: "unique_cities <- unique(...)" },
      ],
    },
    {
      id: "flagged",
      task: "Create flagged — rows with an extra logical column big, TRUE when the amount is 50 or more.",
      why: "`mutate` adds or replaces a column, returning a new data frame rather than changing the old one.",
      focus: ["amount"],
      solution: "flagged <- mutate(rows, big = as.numeric(amount) >= 50)",
      assertions: 'assert(sum(flagged$big) == 3)\nassert(!("big" %in% names(rows)))',
      narrative: "`mutate` sees the columns by name, so `amount` needs casting inside the call. The second assert is the point: `rows` is untouched.",
      steps: [
        { do: "Add a column to the data frame", code: "mutate(rows," },
        { do: "Define it from the cast amount", code: "big = as.numeric(amount) >= 50)" },
      ],
    },
    {
      id: "renamed",
      task: "Create renamed — rows with the name column renamed to person.",
      why: "`rename` is new = old, which is the opposite order from most languages and worth burning in.",
      focus: ["name"],
      solution: "renamed <- rename(rows, person = name)",
      assertions: 'assert("person" %in% names(renamed))\nassert(!("name" %in% names(renamed)))\nassert(identical(trimws(renamed$person[1]), "Ann"))',
      narrative: "Read `person = name` as \"person gets what name had\". Getting this backwards is the classic dplyr slip.",
      steps: [
        { do: "Rename inside the data frame", code: "rename(rows," },
        { do: "New name first, old name second", code: "person = name)" },
      ],
    },
    {
      id: "sorted",
      task: "Create sorted — the rows ordered by amount, largest first.",
      why: "`arrange` sorts ascending; `desc()` is how you turn it round.",
      focus: ["amount"],
      solution: "sorted <- arrange(rows, desc(as.numeric(amount)))",
      assertions: 'assert(identical(trimws(sorted$name[1]), "Dan"))\nassert(identical(trimws(sorted$name[6]), "Eve"))',
      narrative: "The cast matters: sorting the raw character column would put \"70\" before \"9\" if there were one, because text sorts lexically.",
      steps: [
        { do: "Sort the data frame", code: "arrange(rows," },
        { do: "By the cast amount, descending", code: "desc(as.numeric(amount)))" },
      ],
    },
    {
      id: "cleaned",
      task: "Create cleaned — a data frame of just three tidy columns: name trimmed, city lowercased, amount as a number.",
      why: "`transmute` is mutate that keeps only what you name. The whole tidy-up in one pass.",
      focus: ["name", "city", "amount"],
      solution: "cleaned <- transmute(rows, name = trimws(name), city = tolower(city), amount = as.numeric(amount))",
      assertions: 'assert(identical(names(cleaned), c("name", "city", "amount")))\nassert(identical(cleaned$name[1], "Ann"))\nassert(cleaned$amount[4] == 70)',
      narrative: "`mutate` would have kept `status` too. `transmute` drops anything you did not ask for, which is what makes it the one-line tidy.",
      steps: [
        { do: "Keep only the columns you define", code: "transmute(rows," },
        { do: "Define each one cleanly", code: "name = trimws(name), city = tolower(city), amount = as.numeric(amount))" },
      ],
    },
  ],
};

// ── Pack 3: Explore (dplyr) ────────────────────────────────────────────────
//
// One deliberate divergence from the pandas/JavaScript explore datasets, which
// use "NA" for North America: here that region is "AM". In R, `NA` is the
// missing value, and a column containing the two-letter string is a standing
// invitation for something in the chain — a coercion, a JSON round-trip, WebR's
// own NA-to-null conversion — to turn a region into a hole. The lesson of the
// pack is grouping and ranking, not NA handling, so the trap is simply not laid.
const EXPLORE_ROWS: DataRow[] = [
  { rep: "Ann",  region: "EU",   deals: 4, revenue: 120 },
  { rep: "Ben",  region: "AM",   deals: 7, revenue: 210 },
  { rep: "Cara", region: "EU",   deals: 2, revenue: 60 },
  { rep: "Dan",  region: "APAC", deals: 9, revenue: 270 },
  { rep: "Eve",  region: "AM",   deals: 5, revenue: 150 },
  { rep: "Finn", region: "EU",   deals: 6, revenue: 180 },
];

const R_EXPLORE: DrillContent = {
  lang: "r",
  cumulative: false,
  preloadPackages: ["dplyr"],
  scenario: {
    title: "Explore a dataset — the first-look profile (R)",
    role: "A fresh data frame just landed. Before any deep analysis, size it up: how big, how spread, who leads.",
    goal: "Each cell is one profiling move on the same `rows` — extremes, totals, means, distinct counts, grouped sums, ranking. Independent reps; write each from memory.",
    outcome: "That's a first-look profile in R — max/min/sum/mean, n_distinct, group_by + summarise, which.max, arrange. The reflex pass on any data frame.",
    setupCode: `${LIBRARY_DPLYR}\n${rDataFrameLiteral(EXPLORE_ROWS)}`,
    dataset: EXPLORE_ROWS,
  },
  cells: [
    {
      id: "hi",
      task: "Create hi — the largest revenue.",
      why: "`max` takes the column directly. No spread, no reduce.",
      focus: ["revenue"],
      solution: "hi <- max(rows$revenue)",
      assertions: "assert(hi == 270)",
      narrative: "This is R at its most direct: the summary function takes a vector and gives you a number.",
      steps: [{ do: "Take the column and reduce it", code: "hi <- max(rows$revenue)" }],
    },
    {
      id: "lo",
      task: "Create lo — the smallest revenue.",
      why: "The other end of the range. Read with the max, it tells you how spread the data is.",
      focus: ["revenue"],
      solution: "lo <- min(rows$revenue)",
      assertions: "assert(lo == 60)",
      narrative: "Identical shape to the max. Together they are the fastest sanity check there is.",
      steps: [{ do: "Take the column and reduce it", code: "lo <- min(rows$revenue)" }],
    },
    {
      id: "total",
      task: "Create total — the sum of every revenue.",
      why: "`sum` is the aggregate everything else is measured against.",
      focus: ["revenue"],
      solution: "total <- sum(rows$revenue)",
      assertions: "assert(total == 990)",
      narrative: "If the column had NAs this would return NA — `sum(x, na.rm = TRUE)` is the fix, and the fact that R makes you say so is a feature.",
      steps: [{ do: "Total the column", code: "total <- sum(rows$revenue)" }],
    },
    {
      id: "avg",
      task: "Create avg — the average revenue.",
      why: "`mean` exists in base R, so unlike JavaScript you do not hand-roll it.",
      focus: ["revenue"],
      solution: "avg <- mean(rows$revenue)",
      assertions: "assert(avg == 165)",
      narrative: "990 across six reps is 165. Same NA caveat as `sum`.",
      steps: [{ do: "Average the column", code: "avg <- mean(rows$revenue)" }],
    },
    {
      id: "regions",
      task: "Create regions — how many distinct regions there are.",
      why: "Cardinality tells you whether a column is a category or an identifier.",
      focus: ["region"],
      solution: "regions <- n_distinct(rows$region)",
      assertions: "assert(regions == 3)",
      narrative: "`n_distinct` is dplyr's count of unique values — `length(unique(x))` in base R, which is what it is doing.",
      steps: [{ do: "Count the distinct values", code: "regions <- n_distinct(rows$region)" }],
    },
    {
      id: "by_region",
      task: "Create by_region — total revenue per region, ordered by region name.",
      why: "group_by then summarise is the dplyr aggregate. This pair is most of what people use dplyr for.",
      focus: ["region", "revenue"],
      solution: "by_region <- arrange(summarise(group_by(rows, region), total = sum(revenue)), region)",
      assertions: 'assert(nrow(by_region) == 3)\nassert(identical(by_region$region, c("AM", "APAC", "EU")))\nassert(identical(by_region$total, c(360, 270, 360)))',
      narrative: "`group_by` marks the grouping, `summarise` collapses each group to one row, `arrange` makes the order deterministic. Read outside-in, or write it with the pipe.",
      steps: [
        { do: "Mark the grouping", code: "group_by(rows, region)" },
        { do: "Collapse each group", code: "summarise(..., total = sum(revenue))" },
        { do: "Order the result", code: "arrange(..., region)" },
      ],
    },
    {
      id: "top",
      task: "Create top — the name of the rep with the highest revenue.",
      why: "`which.max` gives the POSITION of the maximum, which you then use to index another column.",
      focus: ["rep", "revenue"],
      solution: "top <- rows$rep[which.max(rows$revenue)]",
      assertions: 'assert(identical(top, "Dan"))',
      narrative: "`which.max(rows$revenue)` is 4; `rows$rep[4]` is Dan. The trick is that the position from one column indexes another.",
      steps: [
        { do: "Find the position of the maximum", code: "which.max(rows$revenue)" },
        { do: "Index the name column with it", code: "top <- rows$rep[...]" },
      ],
    },
    {
      id: "ranked",
      task: "Create ranked — every rep's name in descending revenue order.",
      why: "Sort the frame, then take the column. Taking the column first would throw away what you sort by.",
      focus: ["rep", "revenue"],
      solution: "ranked <- arrange(rows, desc(revenue))$rep",
      assertions: 'assert(identical(ranked, c("Dan", "Ben", "Finn", "Eve", "Ann", "Cara")))',
      narrative: "`arrange(...)` returns a data frame and `$rep` pulls the column straight off it — no intermediate variable needed.",
      steps: [
        { do: "Sort the frame by revenue, descending", code: "arrange(rows, desc(revenue))" },
        { do: "Take the name column off the result", code: "$rep" },
      ],
    },
    {
      id: "share",
      task: "Create share — EU's revenue as a whole-number percentage of the total.",
      why: "A share is the aggregate a stakeholder asks for: not the number, the proportion.",
      focus: ["region", "revenue"],
      solution: 'share <- round(sum(rows$revenue[rows$region == "EU"]) / sum(rows$revenue) * 100)',
      assertions: "assert(share == 36)",
      narrative: "The inner subset picks EU's revenues by logical index, sums them, and divides by the whole. 360 of 990 is 36.36%, which rounds to 36.",
      steps: [
        { do: "Subset the column by region", code: 'rows$revenue[rows$region == "EU"]' },
        { do: "Divide by the whole and scale", code: "round(... / sum(rows$revenue) * 100)" },
      ],
    },
  ],
};

export const R_PACKS: DrillPack[] = [
  {
    id: "r-lang-basics",
    title: "R basics",
    blurb: "Vectors, 1-based indexing, data frames, ifelse — base R, boots in seconds.",
    tag: "R",
    lang: "r",
    content: R_BASICS,
  },
  {
    id: "r-clean-shape",
    title: "Clean & shape data",
    blurb: "Tidy a messy data frame — trimws, as.numeric, filter, mutate, rename, arrange.",
    tag: "dplyr",
    lang: "r",
    content: R_CLEAN_SHAPE,
  },
  {
    id: "r-explore",
    title: "Explore a dataset",
    blurb: "First-look profile — max/min/sum/mean, n_distinct, group_by, which.max.",
    tag: "dplyr",
    lang: "r",
    content: R_EXPLORE,
  },
];
