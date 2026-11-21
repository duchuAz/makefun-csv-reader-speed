// A faster drop-in for make.fun's csv-reader 1.0.0: run(input) returns exactly the same answer
// ({columns, rows, errors}) as the reference program, for every input.
//
// How it is faster than the reference, without changing a single answer:
//   - one pass over the text with charCodeAt, no per-character string building;
//   - an unquoted field is one slice of the text (V8 keeps it as a view, no copy) instead of a
//     string concatenated character by character;
//   - a quoted field with no doubled quote and no CR inside it is one slice too, and only a
//     quoted field that actually needs rewriting is rebuilt;
//   - the readers live at module level and their state in module bindings, so a run allocates no
//     closure and V8 compiles each reader once instead of once per case.
//
// The policy, spelled out by the reference and unchanged here:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside it one
//     quote and each CRLF or lone CR inside it read as LF; what follows its closing quote, up to the
//     next comma or line break, is appended as it stands (quote_junk, when the field ends); a quote
//     that never closes is a literal character and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings, never trimmed;
//   - columns is the first record when header is true, else null; rows holds the records after it
//     (every record when header is false), each padded with "" (short_row, with fields) or cut
//     (long_row, with extra) to the first record's width;
//   - each error is {code, line, row}, in the order met, a field's quote_junk when the field ends
//     and a record's short_row or long_row when the record ends; line is the 1-based line its record
//     starts on (every LF, CRLF and lone CR inside a quoted field counted), row its index in rows
//     (null for the header).
//
// Pure: no clock, no randomness, nothing kept from one call to the next (the module bindings below
// are the state of the call in progress, reset by every run).

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// The state of the call in progress: the text, where the reader is in it, the record being read,
// and readUnquoted's answer (kept here so a field costs no allocation).
let s = "";
let n = 0;
let pos = 0;
let line = 1;
let recordLine = 1;
let recordRow = null;
let errors = [];
let fValue = "";
let fEnd = END;
let fAdded = 0;

/**
 * Reads unquoted characters onto `base` up to the next comma or line break; a CR not followed by LF
 * is dropped (stray_cr). Sets fValue, fEnd and fAdded (the characters kept).
 */
function readUnquoted(base) {
  let value = base;
  let added = 0;
  for (;;) {
    const start = pos;
    while (pos < n) {
      const c = s.charCodeAt(pos);
      if (c === 44 || c === 10 || c === 13) break;
      pos += 1;
    }
    if (pos > start) {
      value += s.slice(start, pos);
      added += pos - start;
    }
    if (pos >= n) {
      fValue = value;
      fEnd = END;
      fAdded = added;
      return;
    }
    const c = s.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fValue = value;
      fEnd = COMMA;
      fAdded = added;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fValue = value;
      fEnd = LINE_BREAK;
      fAdded = added;
      return;
    }
    if (pos + 1 < n && s.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value;
      fEnd = LINE_BREAK;
      fAdded = added;
      return;
    }
    // A lone CR outside quotes is dropped, and the field goes on.
    errors.push({ code: "stray_cr", line: recordLine, row: recordRow });
    pos += 1;
  }
}

/**
 * Rebuilds a quoted field's body that holds a doubled quote or a CR: "" is one quote and each CRLF
 * or lone CR is one LF. A body with neither is a slice and never comes here.
 */
function rebuildQuoted(from, to) {
  let value = "";
  let seg = from;
  let i = from;
  while (i < to) {
    const c = s.charCodeAt(i);
    if (c === 34) {
      value += s.slice(seg, i) + '"';
      i += 2;
      seg = i;
    } else if (c === 13) {
      value += s.slice(seg, i) + "\n";
      i += i + 1 < to && s.charCodeAt(i + 1) === 10 ? 2 : 1;
      seg = i;
    } else {
      i += 1;
    }
  }
  return value + s.slice(seg, to);
}

/** csv-reader 1.0.0's reading of `text` with `header`. */
function parse(text, header) {
  s = text;
  n = text.length;
  pos = 0;
  line = 1;
  recordLine = 1;
  recordRow = null;
  errors = [];
  fValue = "";
  fEnd = END;
  fAdded = 0;

  const rows = [];
  let columns = null;
  let width = -1;

  if (n > 0 && s.charCodeAt(0) === 0xfeff) pos = 1;

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = s.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && s.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const fields = [];
    let quotedLast = false;

    for (;;) {
      let value;
      let ended;
      quotedLast = s.charCodeAt(pos) === 34;

      if (quotedLast) {
        const openLine = line;
        const bodyStart = pos + 1;
        let i = bodyStart;
        let special = false;
        let closedAt = -1;
        while (i < n) {
          const c = s.charCodeAt(i);
          if (c === 34) {
            if (i + 1 < n && s.charCodeAt(i + 1) === 34) {
              special = true;
              i += 2;
              continue;
            }
            closedAt = i;
            i += 1;
            break;
          }
          if (c === 13) {
            special = true;
            line += 1;
            i += i + 1 < n && s.charCodeAt(i + 1) === 10 ? 2 : 1;
            continue;
          }
          if (c === 10) {
            line += 1;
            i += 1;
            continue;
          }
          i += 1;
        }

        if (closedAt < 0) {
          // The quote never closes: it is a literal character, and the text after it is read
          // again as unquoted.
          pos = bodyStart;
          line = openLine;
          errors.push({ code: "unterminated_quote", line: recordLine, row: recordRow });
          readUnquoted('"');
          value = fValue;
          ended = fEnd;
        } else {
          value = special ? rebuildQuoted(bodyStart, closedAt) : s.slice(bodyStart, closedAt);
          pos = i;
          if (pos >= n) {
            ended = END;
          } else {
            const c = s.charCodeAt(pos);
            if (c === 44) {
              pos += 1;
              ended = COMMA;
            } else if (c === 10) {
              pos += 1;
              line += 1;
              ended = LINE_BREAK;
            } else if (c === 13 && pos + 1 < n && s.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line += 1;
              ended = LINE_BREAK;
            } else {
              // What follows the closing quote is appended as it stands.
              readUnquoted(value);
              if (fAdded > 0) {
                errors.push({ code: "quote_junk", line: recordLine, row: recordRow });
              }
              value = fValue;
              ended = fEnd;
            }
          }
        }
      } else {
        readUnquoted("");
        value = fValue;
        ended = fEnd;
      }

      fields.push(value);
      if (ended !== COMMA) break;
    }

    // A line that held only stray CRs is left with no characters: no record (its errors stay).
    if (fields.length === 1 && fields[0] === "" && !quotedLast) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: "short_row", line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push("");
    } else if (fields.length > width) {
      errors.push({ code: "long_row", line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  const answer = { columns: header ? (columns ?? []) : null, rows, errors };
  s = "";
  errors = [];
  return answer;
}

/**
 * csv-reader 1.0.0's answer for one case's input {text, header}: {columns, rows, errors}.
 * @param {{text: unknown, header?: unknown}} input
 */
export function run(input) {
  return parse(String(input.text), input.header === true);
}
