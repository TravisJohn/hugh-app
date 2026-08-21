// ── Curated JavaScript practice packs ───────────────────────────────────────
//
// The JS counterpart to the Python and SQL packs. Same DrillPack / DrillContent
// shape, but `lang: "javascript"`: cells run in a Worker via lib/code/jsRuntime,
// and a cell's `assertions` is real assert code sharing the learner's scope —
// the Python contract, not the SQL one.
//
// SCOPE — data in JavaScript, not JavaScript.
// Hugh's line is data and analytics (see CLAUDE.md), and these packs stay on the
// analyst's side of it: shaping arrays of records, profiling them, and reading
// the JSON that comes back from an API. Deliberately absent, and not to be added
// later "for completeness": the DOM, events, async/promises, Node, npm, React,
// modules, classes. Those are web development — a different product.
//
// The packs mirror their pandas counterparts cell-for-cell where the move exists
// in both (clean-shape, explore), because the transfer IS the lesson: a learner
// who knows `df["name"].str.strip()` should see `rows.map(r => r.name.trim())`
// and recognise it rather than start over.
//
// AUTHORING RULES, both learned the hard way:
//
//  1. Every cell's LAST line must be a plain `const x = …` assignment. The
//     "Produces" preview finds the result variable with resultVarOf, which reads
//     assignments — it cannot see a destructuring pattern like `const { city } =
//     person`. A cell ending in one still passes, but previews the wrong value.
//     Use destructuring inside a callback (where it earns its keep anyway) and
//     land on a plain binding.
//
//  2. Stick to what Node 20 has. Every cell here is EXECUTED in the test suite
//     (jsPacks.test.ts) and CI runs Node 20, so `Object.groupBy` (Node 21+) and
//     friends are out. That is not just a CI constraint: reduce-based grouping
//     and `[...arr].sort()` work in every environment an analyst will meet, and
//     the copy-then-sort habit is worth teaching explicitly.

import { jsRowsLiteral, type DataRow, type DrillContent } from "./drillContent";
import type { DrillPack } from "./packs";

// ── Pack 1: Language basics ────────────────────────────────────────────────
// Dataset-less on purpose — every rep is a self-contained snippet, the same
// shape as the "Let's Do This!" Python fundamentals packs.
const JS_BASICS: DrillContent = {
  lang: "javascript",
  cumulative: false,
  scenario: {
    title: "JavaScript basics — the syntax you type before anything else",
    role: "You can already do this in Python. This is the same handful of moves in JavaScript, so the language stops being in the way.",
    goal: "Each cell is one small self-contained snippet — bindings, template literals, destructuring, spread, optional chaining, arrow functions. Independent reps; write each from memory.",
    outcome: "That's the JavaScript you need before any data work: const, template literals, destructuring, spread, ?. and ??, arrows, ternaries, for…of.",
    setupCode: "",
  },
  cells: [
    {
      id: "total",
      task: "Create total — the price 20 multiplied by the quantity 3. Bind price and qty first.",
      why: "`const` is the default binding in modern JavaScript; reach for `let` only when you will reassign.",
      solution: "const price = 20;\nconst qty = 3;\nconst total = price * qty;",
      assertions: "assert(total === 60);",
      narrative: "Two `const` bindings, then a third derived from them. Nothing here can be reassigned later, which is exactly what you want for a calculation.",
      steps: [
        { do: "Bind the two inputs", code: "const price = 20;\nconst qty = 3;" },
        { do: "Derive the result", code: "const total = price * qty;" },
      ],
    },
    {
      id: "label",
      task: 'Create label — the string "Ann sold 3" built from the bindings who and sold, using a template literal.',
      why: "Template literals interpolate with ${…}, so you stop concatenating strings with +.",
      solution: 'const who = "Ann";\nconst sold = 3;\nconst label = `${who} sold ${sold}`;',
      assertions: 'assert(label === "Ann sold 3");',
      narrative: "Backticks instead of quotes turn the string into a template: everything inside ${…} is evaluated and dropped into place.",
      steps: [
        { do: "Bind the pieces", code: 'const who = "Ann";\nconst sold = 3;' },
        { do: "Interpolate them into a backtick string", code: "const label = `${who} sold ${sold}`;" },
      ],
    },
    {
      id: "cities",
      task: "Create cities — each person's city, pulling the field out with destructuring in the map callback.",
      why: "Destructuring a parameter names the field you want up front, so the body stays about the work.",
      solution: 'const people = [{ name: "Ann", city: "London" }, { name: "Ben", city: "Paris" }];\nconst cities = people.map(({ city }) => city);',
      assertions: 'assert(JSON.stringify(cities) === \'["London","Paris"]\');',
      narrative: "`({ city }) => city` takes each object and immediately unpacks its city field — the same as writing `p => p.city`, but the field you depend on is declared in the signature.",
      steps: [
        { do: "Start from the array of people", code: "people.map(" },
        { do: "Unpack the field in the parameter", code: "({ city }) => city" },
      ],
    },
    {
      id: "updated",
      task: "Create updated — a copy of base with revenue changed to 150, leaving base untouched.",
      why: "Object spread copies then overrides — the standard way to change one field without mutating the original.",
      solution: 'const base = { region: "EU", revenue: 100 };\nconst updated = { ...base, revenue: 150 };',
      assertions: "assert(updated.revenue === 150);\nassert(updated.region === \"EU\");\nassert(base.revenue === 100);",
      narrative: "`...base` copies every field in, then `revenue: 150` overrides one of them. Order matters: the later key wins. `base` itself never changes.",
      steps: [
        { do: "Copy every field of base", code: "{ ...base," },
        { do: "Override the one you want", code: "revenue: 150 }" },
      ],
    },
    {
      id: "combined",
      task: "Create combined — the arrays eu and na joined into one array.",
      why: "Array spread is the readable concat, and it copies rather than mutating either side.",
      solution: 'const eu = ["Ann", "Cara"];\nconst na = ["Ben"];\nconst combined = [...eu, ...na];',
      assertions: 'assert(JSON.stringify(combined) === \'["Ann","Cara","Ben"]\');',
      narrative: "Each `...` spreads one array's elements into the new literal, in the order you write them.",
      steps: [
        { do: "Open a new array", code: "[" },
        { do: "Spread each source in turn", code: "...eu, ...na]" },
      ],
    },
    {
      id: "region",
      task: 'Create region — order.customer.region if it exists, otherwise the string "unknown".',
      why: "`?.` stops a missing field throwing; `??` supplies the fallback. Together they are how you read untrusted data.",
      solution: 'const order = { customer: { name: "Ann" } };\nconst region = order.customer?.region ?? "unknown";',
      assertions: 'assert(region === "unknown");',
      narrative: "`customer?.region` yields undefined instead of throwing when customer is missing, and `?? \"unknown\"` fills in only for null/undefined — unlike `||`, which would also replace 0 and \"\".",
      steps: [
        { do: "Reach in without risking a throw", code: "order.customer?.region" },
        { do: "Supply a fallback for null/undefined", code: '?? "unknown"' },
      ],
    },
    {
      id: "double",
      task: "Create double — a function that returns its argument multiplied by 2.",
      why: "Arrow functions are what you pass to map/filter/reduce all day; a single-expression body returns implicitly.",
      solution: "const double = n => n * 2;",
      assertions: "assert(double(4) === 8);\nassert(double(0) === 0);",
      narrative: "No braces means no `return` — the expression after the arrow is the return value.",
      steps: [
        { do: "Name the parameter", code: "n =>" },
        { do: "Give the expression to return", code: "n * 2" },
      ],
    },
    {
      id: "band",
      task: 'Create band — "high" when score is 70 or more, otherwise "low". Bind score to 72.',
      why: "The ternary is the expression form of if/else, so it can sit inside a map callback where a statement cannot.",
      solution: 'const score = 72;\nconst band = score >= 70 ? "high" : "low";',
      assertions: 'assert(band === "high");',
      narrative: "`condition ? a : b` evaluates to one value or the other. Because it is an expression, it fits anywhere a value fits.",
      steps: [
        { do: "Write the test", code: "score >= 70" },
        { do: "Give the two outcomes", code: '? "high" : "low"' },
      ],
    },
    {
      id: "sum",
      task: "Create sum — the running total of the array nums, built with a for…of loop.",
      why: "for…of walks values directly. You will usually reach for reduce, but the loop is what reduce is doing.",
      solution: "const nums = [1, 2, 3];\nlet sum = 0;\nfor (const n of nums) {\n  sum += n;\n}",
      assertions: "assert(sum === 6);",
      narrative: "`sum` is `let` because it genuinely changes on each pass — the one place `const` will not do. for…of hands you each value, not its index.",
      steps: [
        { do: "Start an accumulator you can reassign", code: "let sum = 0;" },
        { do: "Walk the values and add each on", code: "for (const n of nums) {\n  sum += n;\n}" },
      ],
    },
  ],
};

// ── Pack 2: Clean & shape ──────────────────────────────────────────────────
// The same messy rows as the pandas clean-shape pack, so the two read as one
// skill in two languages.
const CLEAN_ROWS: DataRow[] = [
  { name: " Ann ", city: "london", amount: "30", status: "active" },
  { name: "Ben",   city: "LONDON", amount: "50", status: "active" },
  { name: "Cara ", city: "Paris",  amount: "20", status: "ACTIVE" },
  { name: "Dan",   city: "paris",  amount: "70", status: "inactive" },
  { name: " Eve",  city: "London", amount: "0",  status: "active" },
  { name: "Finn",  city: "paris",  amount: "50", status: "Inactive" },
];

const JS_CLEAN_SHAPE: DrillContent = {
  lang: "javascript",
  cumulative: false,
  scenario: {
    title: "Clean & shape data — tidy a messy array (JavaScript)",
    role: "The payload came in dirty: stray spaces, inconsistent case, amounts as strings. Whip `rows` into shape with plain JavaScript.",
    goal: "Each cell is one standard cleaning move on the same `rows` — map, filter, Number, Set, spread, sort. Independent reps; write each from memory.",
    outcome: "That's the JavaScript tidy-up toolkit — trim, lowercase, cast, filter, dedupe, derive, rename, sort. The same moves as pandas, spelled differently.",
    setupCode: jsRowsLiteral(CLEAN_ROWS),
    dataset: CLEAN_ROWS,
  },
  cells: [
    {
      id: "trimmed",
      task: "Create trimmed — every name with its surrounding spaces removed.",
      why: ".map() applies one transform down the whole array — the array equivalent of a vectorised column op.",
      focus: ["name"],
      solution: "const trimmed = rows.map(r => r.name.trim());",
      assertions: 'assert(JSON.stringify(trimmed) === \'["Ann","Ben","Cara","Dan","Eve","Finn"]\');',
      narrative: "`rows.map(...)` visits every record and collects what the callback returns, so `r.name.trim()` runs six times and you get six clean names.",
      steps: [
        { do: "Walk every record", code: "rows.map(r =>" },
        { do: "Trim that record's name", code: "r.name.trim())" },
      ],
    },
    {
      id: "cities",
      task: "Create cities — every city, lowercased.",
      why: "Normalising case is what stops \"London\" and \"LONDON\" counting as two different places.",
      focus: ["city"],
      solution: "const cities = rows.map(r => r.city.toLowerCase());",
      assertions: 'assert(JSON.stringify(cities) === \'["london","london","paris","paris","london","paris"]\');',
      narrative: "Same shape as the trim above — one transform, applied down the array. `toLowerCase()` collapses the mixed capitals to one canonical spelling.",
      steps: [
        { do: "Walk every record", code: "rows.map(r =>" },
        { do: "Lowercase its city", code: "r.city.toLowerCase())" },
      ],
    },
    {
      id: "amounts",
      task: "Create amounts — every amount converted from text to a number.",
      why: "Amounts arrive as strings constantly. Until you cast them, + concatenates instead of adding.",
      focus: ["amount"],
      solution: "const amounts = rows.map(r => Number(r.amount));",
      assertions: 'assert(JSON.stringify(amounts) === "[30,50,20,70,0,50]");\nassert(typeof amounts[0] === "number");',
      narrative: "`Number(...)` converts a numeric string to a real number. This matters more in JavaScript than in Python: `\"30\" + 1` is the string \"301\", not 31.",
      steps: [
        { do: "Walk every record", code: "rows.map(r =>" },
        { do: "Cast its amount", code: "Number(r.amount))" },
      ],
    },
    {
      id: "active",
      task: "Create active — only the records whose status is active, whatever its capitalisation.",
      why: ".filter() keeps records, not fields — the row-level counterpart to a boolean mask.",
      focus: ["status"],
      solution: 'const active = rows.filter(r => r.status.toLowerCase() === "active");',
      assertions: 'assert(active.length === 4);\nassert(active.map(r => r.name.trim()).join(",") === "Ann,Ben,Cara,Eve");',
      narrative: "The callback returns true or false per record; `filter` keeps the trues. Lowercasing inside the test is what catches \"ACTIVE\" alongside \"active\".",
      steps: [
        { do: "Keep only matching records", code: "rows.filter(r =>" },
        { do: "Test the normalised status", code: 'r.status.toLowerCase() === "active")' },
      ],
    },
    {
      id: "uniqueCities",
      task: "Create uniqueCities — the distinct lowercased cities, as an array.",
      why: "A Set drops duplicates for free; spreading it back out gives you a normal array again.",
      focus: ["city"],
      solution: "const uniqueCities = [...new Set(rows.map(r => r.city.toLowerCase()))];",
      assertions: 'assert(JSON.stringify(uniqueCities) === \'["london","paris"]\');',
      narrative: "Read it outside-in: map to cities, hand them to a Set (which keeps only the first of each), then spread back into an array so you can index and map it.",
      steps: [
        { do: "Get the normalised cities", code: "rows.map(r => r.city.toLowerCase())" },
        { do: "Drop duplicates", code: "new Set(...)" },
        { do: "Back to an array", code: "[...]" },
      ],
    },
    {
      id: "flagged",
      task: "Create flagged — every record with an extra boolean field big, true when the amount is 50 or more.",
      why: "Spreading the record and adding a key is how you derive a column without mutating the source.",
      focus: ["amount"],
      solution: "const flagged = rows.map(r => ({ ...r, big: Number(r.amount) >= 50 }));",
      assertions: 'assert(flagged.filter(r => r.big).length === 3);\nassert(rows[0].big === undefined);',
      narrative: "The parentheses around `{ ... }` are required — without them JavaScript reads the brace as a function body, not an object. `...r` copies the record, then `big` is added alongside.",
      steps: [
        { do: "Walk every record", code: "rows.map(r =>" },
        { do: "Copy it and add the derived field", code: "({ ...r, big: Number(r.amount) >= 50 }))" },
      ],
    },
    {
      id: "renamed",
      task: "Create renamed — every record with its name field renamed to person and trimmed, keeping the other fields.",
      why: "Rest destructuring lets you peel one field off and keep the remainder in one move.",
      focus: ["name"],
      solution: "const renamed = rows.map(({ name, ...rest }) => ({ person: name.trim(), ...rest }));",
      assertions: 'assert(renamed[0].person === "Ann");\nassert(renamed[0].name === undefined);\nassert(renamed[0].city === "london");',
      narrative: "`{ name, ...rest }` splits each record in two: the field you are renaming, and everything else. The new object then puts `person` in and spreads the rest back.",
      steps: [
        { do: "Split the field off the rest", code: "({ name, ...rest }) =>" },
        { do: "Rebuild under the new name", code: "({ person: name.trim(), ...rest })" },
      ],
    },
    {
      id: "sorted",
      task: "Create sorted — the records ordered by amount, largest first, without disturbing rows.",
      why: ".sort() mutates the array it is called on. Copying first is the habit that stops a sort quietly reordering your source data.",
      focus: ["amount"],
      solution: "const sorted = [...rows].sort((a, b) => Number(b.amount) - Number(a.amount));",
      assertions: 'assert(sorted[0].name === "Dan");\nassert(sorted[5].name === " Eve");\nassert(rows[0].name === " Ann ");',
      narrative: "`[...rows]` makes the copy; the comparator returns a negative, zero or positive number, and subtracting b from a is the idiom for descending. The last assert is the point of the cell: `rows` is still in its original order.",
      steps: [
        { do: "Copy before sorting", code: "[...rows]" },
        { do: "Compare on the cast amount, descending", code: ".sort((a, b) => Number(b.amount) - Number(a.amount))" },
      ],
    },
    {
      id: "cleaned",
      task: "Create cleaned — every record rebuilt tidy: name trimmed, city lowercased, amount as a number.",
      why: "The whole tidy-up in one pass. This is what the earlier reps add up to.",
      focus: ["name", "city", "amount"],
      solution: "const cleaned = rows.map(r => ({ name: r.name.trim(), city: r.city.toLowerCase(), amount: Number(r.amount) }));",
      assertions: 'assert(JSON.stringify(cleaned[0]) === \'{"name":"Ann","city":"london","amount":30}\');\nassert(cleaned.length === 6);\nassert(cleaned[3].amount === 70);',
      narrative: "One `map`, one object literal, three transforms. Real cleaning is this — the individual moves you have just drilled, stacked into a single pass.",
      steps: [
        { do: "Walk every record", code: "rows.map(r =>" },
        { do: "Build the tidy version field by field", code: "({ name: r.name.trim(), city: r.city.toLowerCase(), amount: Number(r.amount) }))" },
      ],
    },
  ],
};

// ── Pack 3: Explore ────────────────────────────────────────────────────────
// Same rows as the pandas explore pack.
const EXPLORE_ROWS: DataRow[] = [
  { rep: "Ann",  region: "EU",   deals: 4, revenue: 120 },
  { rep: "Ben",  region: "NA",   deals: 7, revenue: 210 },
  { rep: "Cara", region: "EU",   deals: 2, revenue: 60 },
  { rep: "Dan",  region: "APAC", deals: 9, revenue: 270 },
  { rep: "Eve",  region: "NA",   deals: 5, revenue: 150 },
  { rep: "Finn", region: "EU",   deals: 6, revenue: 180 },
];

const JS_EXPLORE: DrillContent = {
  lang: "javascript",
  cumulative: false,
  scenario: {
    title: "Explore a dataset — the first-look profile (JavaScript)",
    role: "A fresh array of records just landed. Before any deep analysis, size it up: how big, how spread, who leads.",
    goal: "Each cell is one profiling move on the same `rows` — extremes, totals, means, distinct counts, grouped sums, ranking. Independent reps; write each from memory.",
    outcome: "That's a first-look profile in JavaScript — Math.max, reduce, Set, grouped sums, sort. The reflex pass on any array of records.",
    setupCode: jsRowsLiteral(EXPLORE_ROWS),
    dataset: EXPLORE_ROWS,
  },
  cells: [
    {
      id: "hi",
      task: "Create hi — the largest revenue.",
      why: "Math.max takes arguments, not an array, so spreading is what connects the two.",
      focus: ["revenue"],
      solution: "const hi = Math.max(...rows.map(r => r.revenue));",
      assertions: "assert(hi === 270);",
      narrative: "`rows.map(...)` gives an array of revenues; `...` spreads it into six separate arguments, which is the shape Math.max actually wants.",
      steps: [
        { do: "Pull the column out", code: "rows.map(r => r.revenue)" },
        { do: "Spread it into Math.max", code: "Math.max(...)" },
      ],
    },
    {
      id: "lo",
      task: "Create lo — the smallest revenue.",
      why: "The other end of the range, same shape — the pair tells you how spread the data is.",
      focus: ["revenue"],
      solution: "const lo = Math.min(...rows.map(r => r.revenue));",
      assertions: "assert(lo === 60);",
      narrative: "Identical to the max, with Math.min. Reading hi and lo together is the fastest sanity check there is.",
      steps: [
        { do: "Pull the column out", code: "rows.map(r => r.revenue)" },
        { do: "Spread it into Math.min", code: "Math.min(...)" },
      ],
    },
    {
      id: "total",
      task: "Create total — the sum of every revenue.",
      why: ".reduce() folds an array down to one value. It is the workhorse behind every aggregate you will write.",
      focus: ["revenue"],
      solution: "const total = rows.reduce((sum, r) => sum + r.revenue, 0);",
      assertions: "assert(total === 990);",
      narrative: "`reduce` carries an accumulator through the array. The `0` at the end is its starting value — leave it out and an empty array throws instead of giving you 0.",
      steps: [
        { do: "Fold the array down", code: "rows.reduce(" },
        { do: "Add each revenue to the running total", code: "(sum, r) => sum + r.revenue," },
        { do: "Start from zero", code: "0)" },
      ],
    },
    {
      id: "mean",
      task: "Create mean — the average revenue.",
      why: "Average is a sum and a length. There is no built-in, so this is the shape you type every time.",
      focus: ["revenue"],
      solution: "const mean = rows.reduce((sum, r) => sum + r.revenue, 0) / rows.length;",
      assertions: "assert(mean === 165);",
      narrative: "The same reduce as before, divided by the count. JavaScript has no `.mean()` — knowing this one-liner cold is the point.",
      steps: [
        { do: "Total the column", code: "rows.reduce((sum, r) => sum + r.revenue, 0)" },
        { do: "Divide by the count", code: "/ rows.length" },
      ],
    },
    {
      id: "regions",
      task: "Create regions — how many distinct regions there are.",
      why: "Cardinality tells you whether a column is a category or an identifier.",
      focus: ["region"],
      solution: "const regions = new Set(rows.map(r => r.region)).size;",
      assertions: "assert(regions === 3);",
      narrative: "A Set keeps one of each value, and `.size` is its count — note it is a property, not the `.length` an array would give you.",
      steps: [
        { do: "Pull the column out", code: "rows.map(r => r.region)" },
        { do: "Keep one of each and count them", code: "new Set(...).size" },
      ],
    },
    {
      id: "byRegion",
      task: "Create byRegion — an object of total revenue per region.",
      why: "Grouping with reduce is the JavaScript groupby. Learn this shape and you can aggregate anything.",
      focus: ["region", "revenue"],
      solution: "const byRegion = rows.reduce((acc, r) => ({ ...acc, [r.region]: (acc[r.region] ?? 0) + r.revenue }), {});",
      assertions: "assert(byRegion.EU === 360);\nassert(byRegion.NA === 360);\nassert(byRegion.APAC === 270);",
      narrative: "The accumulator starts as `{}` and grows a key per region. `[r.region]` is a computed key — the region's value becomes the property name — and `?? 0` seeds the first record of each group.",
      steps: [
        { do: "Fold into an object", code: "rows.reduce((acc, r) => (" },
        { do: "Copy what is there so far", code: "{ ...acc," },
        { do: "Add this record to its group", code: "[r.region]: (acc[r.region] ?? 0) + r.revenue }), {})" },
      ],
    },
    {
      id: "top",
      task: "Create top — the name of the rep with the highest revenue.",
      why: "Sort a copy, take the head. The commonest way to answer a \"who leads\" question.",
      focus: ["rep", "revenue"],
      solution: "const top = [...rows].sort((a, b) => b.revenue - a.revenue)[0].rep;",
      assertions: 'assert(top === "Dan");',
      narrative: "`[...rows]` protects the source from sort's mutation, `b - a` orders descending, `[0]` takes the winner and `.rep` reads their name.",
      steps: [
        { do: "Copy before sorting", code: "[...rows]" },
        { do: "Order by revenue, descending", code: ".sort((a, b) => b.revenue - a.revenue)" },
        { do: "Take the leader's name", code: "[0].rep" },
      ],
    },
    {
      id: "ranked",
      task: "Create ranked — every rep's name in descending revenue order.",
      why: "The whole leaderboard rather than the winner — sort then map, in that order.",
      focus: ["rep", "revenue"],
      solution: "const ranked = [...rows].sort((a, b) => b.revenue - a.revenue).map(r => r.rep);",
      assertions: 'assert(JSON.stringify(ranked) === \'["Dan","Ben","Finn","Eve","Ann","Cara"]\');',
      narrative: "Sort first, map second. Map first and you would have thrown away the revenue you need to sort by.",
      steps: [
        { do: "Copy and order by revenue", code: "[...rows].sort((a, b) => b.revenue - a.revenue)" },
        { do: "Reduce each record to its name", code: ".map(r => r.rep)" },
      ],
    },
    {
      id: "share",
      task: "Create share — EU's revenue as a whole-number percentage of the total.",
      why: "A share is the aggregate a stakeholder actually asks for: not the number, the proportion.",
      focus: ["region", "revenue"],
      solution: 'const euTotal = rows.filter(r => r.region === "EU").reduce((sum, r) => sum + r.revenue, 0);\nconst share = Math.round((euTotal / rows.reduce((sum, r) => sum + r.revenue, 0)) * 100);',
      assertions: "assert(euTotal === 360);\nassert(share === 36);",
      narrative: "Filter to the slice, total it, divide by the total of everything, then scale and round. 360 of 990 is 36.36…%, which rounds to 36.",
      steps: [
        { do: "Total the slice", code: 'rows.filter(r => r.region === "EU").reduce((sum, r) => sum + r.revenue, 0)' },
        { do: "Divide by the whole and scale", code: "Math.round((euTotal / total) * 100)" },
      ],
    },
  ],
};

// ── Pack 4: Reading JSON ───────────────────────────────────────────────────
// No `dataset` — the records are NESTED, and the dataset field renders a flat
// table. setupCode still names the binding `rows`, so the drill's "you're given"
// copy stays accurate.
const JS_JSON: DrillContent = {
  lang: "javascript",
  cumulative: false,
  scenario: {
    title: "Reading JSON — the shape an API actually returns",
    role: "The orders endpoint hands back nested JSON: a customer object inside each order, and a list of line items. Get answers out of it.",
    goal: "Each cell is one move on the same nested `rows` — parse, reach in, guard a missing field, flatten, aggregate, format. Independent reps; write each from memory.",
    outcome: "That's the JSON toolkit — JSON.parse, dotted access, ?., flatMap, reduce, Intl formatting, JSON.stringify. Most real data arrives shaped like this.",
    setupCode: [
      "const rows = [",
      '  { id: 1, customer: { name: "Ann", city: "London" }, items: [{ sku: "A1", qty: 2, price: 10 }, { sku: "B2", qty: 1, price: 30 }] },',
      '  { id: 2, customer: { name: "Ben", city: "Paris" }, items: [{ sku: "A1", qty: 5, price: 10 }] },',
      '  { id: 3, customer: { name: "Cara", city: "London" }, items: [] },',
      "];",
    ].join("\n"),
  },
  cells: [
    {
      id: "parsed",
      task: 'Create parsed — the object encoded in the JSON string \'{"name":"Ann","city":"London"}\'.',
      why: "A response body is text until you parse it. This is the first thing you do with one.",
      solution: "const parsed = JSON.parse('{\"name\":\"Ann\",\"city\":\"London\"}');",
      assertions: 'assert(parsed.city === "London");\nassert(typeof parsed === "object");',
      narrative: "`JSON.parse` turns the text into a real object you can read fields off. Note the single quotes around it — the JSON itself uses double quotes.",
      steps: [
        { do: "Hand the text to the parser", code: "JSON.parse(" },
        { do: "Quote the JSON with single quotes", code: "'{\"name\":\"Ann\",\"city\":\"London\"}')" },
      ],
    },
    {
      id: "cities",
      task: "Create cities — each order's customer city.",
      why: "Nested access is just another dot. The shape of the payload does not change the move.",
      solution: "const cities = rows.map(r => r.customer.city);",
      assertions: 'assert(JSON.stringify(cities) === \'["London","Paris","London"]\');',
      narrative: "`r.customer.city` walks two levels down. It reads exactly like the flat case, which is why nested payloads are less frightening than they look.",
      steps: [
        { do: "Walk every order", code: "rows.map(r =>" },
        { do: "Reach through customer to city", code: "r.customer.city)" },
      ],
    },
    {
      id: "firstSku",
      task: 'Create firstSku — each order\'s first item SKU, or "none" when the order has no items.',
      why: "Real payloads have empty lists. `?.` and `??` are what stop one crashing the whole pass.",
      solution: 'const firstSku = rows.map(r => r.items[0]?.sku ?? "none");',
      assertions: 'assert(JSON.stringify(firstSku) === \'["A1","A1","none"]\');',
      narrative: "Order 3 has an empty items array, so `items[0]` is undefined. Without `?.` the `.sku` would throw; with it the whole expression yields undefined and `?? \"none\"` fills in.",
      steps: [
        { do: "Take the first item safely", code: "r.items[0]?.sku" },
        { do: "Fall back when there isn't one", code: '?? "none"' },
      ],
    },
    {
      id: "allItems",
      task: "Create allItems — every line item across every order, in one flat array.",
      why: ".flatMap() maps and flattens in one pass — the move for a list-inside-a-record.",
      solution: "const allItems = rows.flatMap(r => r.items);",
      assertions: "assert(allItems.length === 3);\nassert(allItems[2].sku === \"A1\");",
      narrative: "A plain `map` would give you an array of arrays. `flatMap` unpacks one level as it goes, and the empty items array simply contributes nothing.",
      steps: [
        { do: "Walk every order", code: "rows.flatMap(r =>" },
        { do: "Return its items to be flattened in", code: "r.items)" },
      ],
    },
    {
      id: "lineTotals",
      task: "Create lineTotals — qty times price for every line item across all orders.",
      why: "Flatten first, then compute. Chaining the two is the everyday shape.",
      solution: "const lineTotals = rows.flatMap(r => r.items).map(i => i.qty * i.price);",
      assertions: 'assert(JSON.stringify(lineTotals) === "[20,30,50]");',
      narrative: "Read it left to right: get every item, then turn each into its line value. Two small steps beat one clever one.",
      steps: [
        { do: "Flatten to line items", code: "rows.flatMap(r => r.items)" },
        { do: "Compute each line's value", code: ".map(i => i.qty * i.price)" },
      ],
    },
    {
      id: "grandTotal",
      task: "Create grandTotal — the value of every line item added up.",
      why: "flatMap then reduce is how you aggregate across a nested collection.",
      solution: "const grandTotal = rows.flatMap(r => r.items).reduce((sum, i) => sum + i.qty * i.price, 0);",
      assertions: "assert(grandTotal === 100);",
      narrative: "Same flatten, but folded instead of mapped. Doing the multiply inside the reduce saves a pass, and the `0` seed keeps an empty payload returning 0 rather than throwing.",
      steps: [
        { do: "Flatten to line items", code: "rows.flatMap(r => r.items)" },
        { do: "Fold them into a total", code: ".reduce((sum, i) => sum + i.qty * i.price, 0)" },
      ],
    },
    {
      id: "money",
      task: "Create money — the number 100 formatted as GBP currency for an en-GB reader.",
      why: "Intl formats numbers for humans without you hand-rolling separators and symbols.",
      solution: 'const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(100);',
      assertions: 'assert(money.includes("100"));\nassert(money.startsWith("£"));',
      narrative: "The locale decides the separators and symbol placement, and the options decide what kind of number it is. Formatting is a presentation step — keep the raw number for any further maths.",
      steps: [
        { do: "Build a formatter for the locale", code: 'new Intl.NumberFormat("en-GB",' },
        { do: "Say what kind of number it is", code: '{ style: "currency", currency: "GBP" })' },
        { do: "Format the value", code: ".format(100)" },
      ],
    },
    {
      id: "asJson",
      task: "Create asJson — the second order's customer object encoded back to a JSON string.",
      why: "The return leg: you send JSON as often as you receive it.",
      solution: "const asJson = JSON.stringify(rows[1].customer);",
      assertions: 'assert(asJson === \'{"name":"Ben","city":"Paris"}\');\nassert(typeof asJson === "string");',
      narrative: "`JSON.stringify` is the inverse of parse. Key order follows insertion order, which is why the result is predictable enough to compare against directly.",
      steps: [
        { do: "Pick the object", code: "rows[1].customer" },
        { do: "Encode it as text", code: "JSON.stringify(...)" },
      ],
    },
    {
      id: "queryString",
      task: 'Create queryString — the first order\'s customer as "name=Ann&city=London".',
      why: "Object.entries turns an object into pairs you can map over — the way into any key/value reshaping.",
      solution: 'const queryString = Object.entries(rows[0].customer).map(([k, v]) => k + "=" + v).join("&");',
      assertions: 'assert(queryString === "name=Ann&city=London");',
      narrative: "`Object.entries` gives `[[\"name\",\"Ann\"], [\"city\",\"London\"]]`; destructuring `[k, v]` in the callback names each pair's halves, and `join` stitches the results together.",
      steps: [
        { do: "Turn the object into pairs", code: "Object.entries(rows[0].customer)" },
        { do: "Render each pair", code: '.map(([k, v]) => k + "=" + v)' },
        { do: "Stitch them together", code: '.join("&")' },
      ],
    },
  ],
};

export const JS_PACKS: DrillPack[] = [
  {
    id: "js-lang-basics",
    title: "JavaScript basics",
    blurb: "The syntax before the syntax — const, templates, destructuring, spread, arrows.",
    tag: "JavaScript",
    lang: "javascript",
    content: JS_BASICS,
  },
  {
    id: "js-clean-shape",
    title: "Clean & shape data",
    blurb: "Tidy a messy array — map, filter, Number, Set, spread, sort.",
    tag: "JavaScript",
    lang: "javascript",
    content: JS_CLEAN_SHAPE,
  },
  {
    id: "js-explore",
    title: "Explore a dataset",
    blurb: "First-look profile — Math.max, reduce, Set, grouped sums, ranking.",
    tag: "JavaScript",
    lang: "javascript",
    content: JS_EXPLORE,
  },
  {
    id: "js-json",
    title: "Reading JSON",
    blurb: "Nested payloads — JSON.parse, ?., flatMap, reduce, Intl, stringify.",
    tag: "JavaScript",
    lang: "javascript",
    content: JS_JSON,
  },
];
