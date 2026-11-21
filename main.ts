// The program the harness runs (program/v1, node22): it reads every case from /input/cases.json (a
// JSON array of {id, input}), answers each one alone with run() from solve.js, and writes
// /output/answers.json: a JSON array of the answers, one per case and in the cases' order.
//
// Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setFlagsFromString } from "node:v8";

// V8 tuning, set before solve.js is imported so all of its work runs under it. The house driver
// turns incremental marking off, and an entry may tune V8's flags the same way. The sandbox gives an
// entry one CPU, so on top of that this run turns off the collector's background work — concurrent
// marking, concurrent sweeping and the parallel scavenger — which would otherwise compete with the
// only core there is and cost about a tenth of the CPU time on this workload.
//
// Four separate flags rather than V8's --single-threaded, which says the same thing in one word but
// aborts the process: applied after the heap is already running, it leaves a concurrent-marking
// handle live while V8 is out of background-task mode, and the next full collection that has to
// sweep the CppHeap trips `Check failed: concurrent_marking_handle_ implies
// !concurrent_marking_handle_->IsValid()` — exit 133 and no answers.json at all. It does that on
// large draws under the sandbox's 1024 MB limit (10 of 10 runs on a 96k-row set) and never on the
// practice set, which is the smallest draw of its class. These four flags do the same work with no
// such state to leave behind: 24 executions over 12 drawn sets, no crash, same answers, same speed.
//
// None of them can change an answer — they decide how the same code is compiled and collected — and
// a V8 that does not carry one is no worse off for the ask.
for (const flag of [
  "--no-incremental-marking",
  "--no-concurrent-marking",
  "--no-concurrent-sweeping",
  "--no-parallel-scavenge",
]) {
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
