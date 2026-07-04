import type { CodeTask } from "@/types/code";

/** Default per-rung countdown when a task doesn't override it. */
export const DEFAULT_TIMER_SECONDS = 10;

/**
 * The escalating Python ladder. Each rung introduces exactly one new idea and
 * builds on the muscle memory of the last. Hidden `assertions` run after the
 * learner's code in the same namespace — a raised exception means "not yet".
 *
 * Authoring rules:
 *  - One concept per rung; keep prompts to a sentence.
 *  - `assertions` must accept *any* correct solution, not one exact phrasing.
 *  - `hughSolution` is the clean reference Hugh ghost-types alongside.
 */
export const CODE_TASKS: CodeTask[] = [
  {
    id: "01-declare",
    title: "Your first variable",
    prompt: "Create a variable named x equal to 5.",
    starterCode: "# Create a variable named x equal to 5\n",
    hughSolution: "x = 5\n",
    assertions: "assert x == 5",
  },
  {
    id: "02-assign",
    title: "Copy a variable",
    prompt: "You have x. Create y and assign it the value of x.",
    starterCode: "x = 5\n# Now create y from x\n",
    hughSolution: "x = 5\ny = x\n",
    assertions: "assert y == 5",
  },
  {
    id: "03-sum",
    title: "Add two numbers",
    prompt: "Create a and b, then total holding their sum.",
    starterCode: "# Create a, b and total\n",
    hughSolution: "a = 3\nb = 4\ntotal = a + b\n",
    assertions: "assert total == a + b\nassert isinstance(total, int)",
    timerSeconds: 12,
  },
  {
    id: "04-string",
    title: "Make a string",
    prompt: 'Create a variable name equal to the text "Hugh".',
    starterCode: "# Create name\n",
    hughSolution: 'name = "Hugh"\n',
    assertions: 'assert name == "Hugh"',
  },
  {
    id: "05-fstring",
    title: "Build a greeting",
    prompt: 'Using name, create greeting that reads "Hello, Hugh".',
    starterCode: 'name = "Hugh"\n# Create greeting\n',
    hughSolution: 'name = "Hugh"\ngreeting = f"Hello, {name}"\n',
    assertions: 'assert greeting == "Hello, Hugh"',
    timerSeconds: 12,
  },
  {
    id: "06-boolean",
    title: "A comparison",
    prompt: "Create is_big set to whether 10 is greater than 3.",
    starterCode: "# Create is_big\n",
    hughSolution: "is_big = 10 > 3\n",
    assertions: "assert is_big is True",
  },
  {
    id: "07-if",
    title: "Branch on a value",
    prompt:
      'Given score, set grade to "pass" if score >= 50, otherwise "fail".',
    starterCode: 'score = 72\n# Set grade based on score\n',
    hughSolution:
      'score = 72\nif score >= 50:\n    grade = "pass"\nelse:\n    grade = "fail"\n',
    assertions: 'assert grade == "pass"',
    timerSeconds: 15,
  },
  {
    id: "08-list",
    title: "Make a list",
    prompt: "Create nums, a list containing 1, 2 and 3.",
    starterCode: "# Create nums\n",
    hughSolution: "nums = [1, 2, 3]\n",
    assertions: "assert nums == [1, 2, 3]",
  },
  {
    id: "09-index",
    title: "Reach into a list",
    prompt: "From nums, set last to its final element using an index.",
    starterCode: "nums = [10, 20, 30]\n# Set last\n",
    hughSolution: "nums = [10, 20, 30]\nlast = nums[-1]\n",
    assertions: "assert last == 30",
    timerSeconds: 12,
  },
  {
    id: "10-loop-sum",
    title: "Loop and accumulate",
    prompt: "Set total to the sum of every number in nums using a for loop.",
    starterCode: "nums = [1, 2, 3, 4]\n# Sum with a loop\n",
    hughSolution:
      "nums = [1, 2, 3, 4]\ntotal = 0\nfor n in nums:\n    total += n\n",
    assertions: "assert total == 10",
    timerSeconds: 15,
  },
  {
    id: "11-function",
    title: "Write a function",
    prompt: "Define double(n) that returns n times two.",
    starterCode: "# Define double(n)\n",
    hughSolution: "def double(n):\n    return n * 2\n",
    assertions: "assert double(5) == 10\nassert double(0) == 0",
    timerSeconds: 15,
  },
  {
    id: "12-max",
    title: "Function with a branch",
    prompt: "Define bigger(a, b) that returns the larger of the two.",
    starterCode: "# Define bigger(a, b)\n",
    hughSolution:
      "def bigger(a, b):\n    if a > b:\n        return a\n    return b\n",
    assertions:
      "assert bigger(3, 7) == 7\nassert bigger(9, 2) == 9\nassert bigger(4, 4) == 4",
    timerSeconds: 18,
  },
  {
    id: "13-dict",
    title: "Make a dictionary",
    prompt: 'Create person with keys "name" -> "Hugh" and "age" -> 30.',
    starterCode: "# Create person\n",
    hughSolution: 'person = {"name": "Hugh", "age": 30}\n',
    assertions: 'assert person["name"] == "Hugh"\nassert person["age"] == 30',
    timerSeconds: 15,
  },
  {
    id: "14-comprehension",
    title: "List comprehension",
    prompt: "Set squares to the squares of 1..5 ([1, 4, 9, 16, 25]).",
    starterCode: "# Build squares with a comprehension\n",
    hughSolution: "squares = [n * n for n in range(1, 6)]\n",
    assertions: "assert squares == [1, 4, 9, 16, 25]",
    timerSeconds: 18,
  },
  {
    id: "15-fizz",
    title: "Put it together",
    prompt:
      'Define label(n): "fizz" if divisible by 3, else the number as a string.',
    starterCode: "# Define label(n)\n",
    hughSolution:
      'def label(n):\n    if n % 3 == 0:\n        return "fizz"\n    return str(n)\n',
    assertions:
      'assert label(9) == "fizz"\nassert label(3) == "fizz"\nassert label(4) == "4"',
    timerSeconds: 20,
  },
];
