# makefun-csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/duchuAz/makefun-csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/duchuAz/makefun-csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's `csv-reader` 1.0.0. `run(input)` returns exactly the answer
csv-reader returns — `{columns, rows, errors}`, every case, every error code and line number — and
it does it in roughly half the CPU time.

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
- **V8 tuned as the house driver tunes it.** `main.ts` turns incremental marking off
  (`setFlagsFromString('--no-incremental-marking')`) before importing `solve.js`, exactly as the
  baseline does.

The parsing policy is the reference's, unchanged: a leading U+FEFF dropped; records ended by LF or
CRLF with empty lines skipped; a lone CR outside quotes dropped (`stray_cr`); a quoted body ended by
the next undoubled quote, with junk after the closing quote appended (`quote_junk`) and an unclosed
quote read again as unquoted (`unterminated_quote`); rows padded (`short_row`) or cut (`long_row`)
to the header's width, each error carrying its record's line and row.

## Verified

- Kit `grade-local`, **process** and **docker** drivers: `{"cases_passed":6,"cases_total":6,"passed":1}`,
  both executions byte-identical.
- Fuzz against the reference `readCsv` itself, alphabet `, " \n \r \r\n \uFEFF`: 400,000 random inputs,
  400,000 identical answers.
- Practice set, median of 7 fresh processes: **~1.01 s CPU** against the house baseline's **~2.62 s**
  (≈2.6×), inside the 10 s wall and well under the 1 MiB repository cap.

---

<sub>Entered on [make.fun](https://make.fun/?ref=g65r747s&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
