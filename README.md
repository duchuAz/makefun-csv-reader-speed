# makefun-csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/duchuAz/makefun-csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/duchuAz/makefun-csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's `csv-reader` 1.0.0. `run(input)` returns exactly the answer
csv-reader returns — `{columns, rows, errors}`, every case, every error code and line number — and
it does it in about a third of the CPU time.

## Run it

```sh
node main.ts   # /input/cases.json -> /output/answers.json (MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR outside a container)
```

## How it is faster, without changing a single answer

- **One pass, `charCodeAt`.** The text is walked once with integer character codes; no regular
  expressions, no `split`, no per-character string building.
- **Fields are slices, not concatenations.** An unquoted field is one `slice()` of the source text
  (V8 keeps it as a view, so there is no copy) instead of a string built character by character.
  A quoted field whose body holds neither a doubled quote nor a CR is a slice too; only a body that
  actually needs rewriting (`""` → `"`, CRLF or lone CR → LF) is rebuilt.
- **No closure per call.** The readers live at module level and their state in module bindings, so a
  run allocates no closure and V8 compiles each reader once instead of once per case.
- **V8 tuned as the house driver tunes it, plus the collector's background work off.** `main.ts`
  applies four flags before importing `solve.js`: `--no-incremental-marking` (what the baseline sets)
  and `--no-concurrent-marking`, `--no-concurrent-sweeping`, `--no-parallel-scavenge`. The sandbox
  gives an entry one CPU, so the collector's background threads only compete with the work being
  measured. They are four separate flags rather than V8's one-word `--single-threaded`, which asks
  for the same thing but is not safe to set after the heap is running: it leaves a concurrent-marking
  handle live while V8 is out of background-task mode, and the next full collection that has to sweep
  the CppHeap aborts the process on large draws at the sandbox's 1024 MB limit — `Check failed:
  concurrent_marking_handle_ implies !concurrent_marking_handle_->IsValid()`, exit 133, no
  `answers.json`. None of the four can change an answer; they decide how the same code is collected.

The parsing policy is the reference's, unchanged: a leading U+FEFF dropped; records ended by LF or
CRLF with empty lines skipped; a lone CR outside quotes dropped (`stray_cr`); a quoted body ended by
the next undoubled quote, with junk after the closing quote appended (`quote_junk`) and an unclosed
quote read again as unquoted (`unterminated_quote`); rows padded (`short_row`) or cut (`long_row`)
to the header's width, each error carrying its record's line and row.

## Verified

- Kit `grade-local`, **docker** driver (the kit's own pinned `node:22-slim` image):
  `{"cases_passed":6,"cases_total":6,"passed":1}`, `action_log_sha256 a95dd9e1…`, both executions
  byte-identical, L1 regrade reproduced byte for byte. The **process** driver needs a node that
  strips `.ts` — the kit's node 22 does; a system node 24 refuses `main.ts` with
  `ERR_UNKNOWN_FILE_EXTENSION`, which is a local toolchain fact rather than the entry.
- **12 freshly drawn instances** from the kit's own generator (59k–102k answer rows), two executions
  each in the pinned image at `--cpus 1 --memory 1024m --pids-limit 64 --network none`: **24 of 24
  runs exited 0 and wrote `answers.json`**, the two executions byte-identical, and every answer equal
  to the sealed oracle's `expected.json`. The practice set cannot show this — it is the smallest draw
  of its class, so the crash above appears only on a drawn set.
- Answers on the practice set are byte-identical to this entry before the flag change
  (sha256 `bb5b6cc5…`), and equal to `expected.json`.
- Fuzz against the reference `readCsv` itself, alphabet `, " \n \r \r\n \uFEFF \0 \ é 東 😀`:
  **650,000 random inputs, 650,000 identical answers**.
- Speed, sandbox, 7 interleaved rounds, trimmed mean: **1.21 s against the house baseline's 3.34 s
  (2.76×)**, inside the 10 s wall and well under the 1 MiB repository cap.

---

<sub>Entered on [make.fun](https://make.fun/?ref=g65r747s&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
