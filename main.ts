// The program the harness runs (program/v1, node22): it reads every case from /input/cases.json (a
// JSON array of {id, input}), answers each one alone with run() from solve.js, and writes
// /output/answers.json: a JSON array of the answers, one per case and in the cases' order.
//
// Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setFlagsFromString } from "node:v8";

// V8 tuning, set before solve.js is imported so all of its work runs under it. The house driver
// turns incremental marking off and an entry may tune V8's flags the same way. The sandbox gives an
// entry one CPU, so on top of that this run asks V8 to work single-threaded: its background compiler
// and its GC helpers otherwise compete with the only core there is, which on this workload costs
// about 15% of the CPU time. Neither flag can change an answer — they decide how the same code is
// compiled and collected — and a V8 that does not carry one is no worse off for the ask.
for (const flag of ["--no-incremental-marking", "--single-threaded"]) {
  try {
    setFlagsFromString(flag);
  } catch {
    // A V8 without the flag: the run goes on unchanged.
  }
}

/** solve.js, imported by its URL (a .js module carries no types). */
const { run } = (await import(new URL("./solve.js", import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const cases = JSON.parse(readFileSync(join(INPUT_DIR, "cases.json"), "utf8")) as {
  id: string;
  input: unknown;
}[];

const answers: unknown[] = [];
for (const c of cases) answers.push(run(c.input));

writeFileSync(join(OUTPUT_DIR, "answers.json"), JSON.stringify(answers));
