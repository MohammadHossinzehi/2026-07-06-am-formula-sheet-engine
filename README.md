# Formula Sheet Engine

A spreadsheet formula engine built from scratch in plain JavaScript: a
tokenizer, a recursive descent parser, a dependency graph, a topological
recalculation order (Kahn's algorithm), circular reference detection, and
spreadsheet style error propagation (`#DIV/0!`, `#VALUE!`, `#NAME?`,
`#CIRCULAR!`). It ships with a zero dependency browser demo: a clickable
grid you can type formulas into.

## Why this exists

Every real spreadsheet (Excel, Google Sheets, Airtable) is really two
things bolted together: a small expression language, and a dependency
scheduler that figures out *what order* to recompute cells in so that by
the time a formula runs, everything it reads is already up to date. That
scheduling problem is a graph problem — build a DAG of "cell A reads cell
B", topologically sort it, and if the sort can't consume every node,
you've found a cycle. This project implements that whole pipeline rather
than just wrapping `eval()`, because the interesting part of a spreadsheet
isn't arithmetic, it's the graph.

## What it does

- **Tokenizer** (`src/tokenizer.js`) turns a formula string like
  `SUM(A1:A3)+B1*2` into tokens: numbers, strings, cell references
  (`A1`), range references (`A1:A3`), identifiers, operators, and
  punctuation.
- **Parser** (`src/parser.js`) is a recursive descent / precedence climbing
  parser producing an AST. Precedence, low to high: comparisons
  (`= < > <= >= <>`), `+ -`, `* /`, unary `+ -`, `^` (right associative,
  so `2^3^2` is `2^(3^2) = 512`, not `64`). It also walks a parsed AST to
  collect the set of cells a formula depends on, expanding ranges into
  their member cells.
- **Engine** (`src/engine.js`) owns cell storage. On every write it
  rebuilds the dependency graph for all formula cells and recalculates
  using Kahn's algorithm: cells with zero unresolved dependencies are
  evaluated first, then their dependents, and so on. Any cell that never
  reaches zero in degree is part of a cycle and is set to `#CIRCULAR!`
  instead of being evaluated (which would otherwise recurse forever).
- **Functions** (`src/functions.js`): `SUM`, `AVERAGE`, `MIN`, `MAX`,
  `COUNT`, `IF`, `ROUND`, `ABS`, `CONCAT`. Adding a new one is a one line
  addition to the `FUNCTIONS` map.
- **Errors** (`src/errors.js`) are plain sentinel strings
  (`#DIV/0!`, `#VALUE!`, `#NAME?`, `#REF!`, `#CIRCULAR!`) that propagate
  through arithmetic and function calls the same way real spreadsheets do:
  a formula that reads an errored cell becomes that same error itself.
- **Browser demo** (`index.html` + `app.js`) renders a grid with 8 columns and 15 rows backed directly by the engine. No React, no bundler — a
  plain `<table>`, a formula bar, and an ES module import.

## Running it

Requires Node.js 18+ (uses the built in `node:test` runner, no test
framework dependency).

```bash
# run the test suite
npm test
# (equivalent to: node --test test/*.test.js)
```

To try the interactive demo, since it's loaded as ES modules it needs to
be served over HTTP rather than opened as a `file://` URL:

```bash
npx serve .
# or: python3 -m http.server 8000
```

Then open the printed local URL in a browser. Click any cell, type a
value or a formula starting with `=`, press Enter. A few cells are
already populated (`A1:A3` are numbers, `B1` is `=SUM(A1:A3)`, `B2` is
`=AVERAGE(A1:A3)`, `B3` is `=IF(B1>50,"big","small")`) so the dependency
recalculation is visible immediately — edit `A1` and watch `B1`, `B2`,
and `B3` update.

### Programmatic usage

```js
import { Sheet } from "./src/engine.js";

const sheet = new Sheet();
sheet.setCell("A1", "10");
sheet.setCell("A2", "20");
sheet.setCell("A3", "=A1+A2");
sheet.setCell("A4", "=SUM(A1:A3)");

sheet.getValue("A3"); // 30
sheet.getValue("A4"); // 60

// cells can be set in any order; the engine figures out recalculation order
sheet.setCell("C1", "=B1+1");
sheet.setCell("B1", "=A1*2");
sheet.getValue("C1"); // 21, even though B1 was defined after C1

// cycles resolve to a sentinel error instead of hanging
sheet.setCell("X1", "=Y1+1");
sheet.setCell("Y1", "=X1+1");
sheet.getValue("X1"); // "#CIRCULAR!"
```

## Design decisions

- **Full recalculation over incremental invalidation.** On every
  `setCell` call the engine rebuilds the dependency graph for *all*
  formula cells and reruns the topological sort, rather than trying to
  invalidate and recompute only the affected subgraph. For a sheet sized
  for interactive use (tens to low thousands of cells) this is fast
  enough to be imperceptible, and it sidesteps an entire class of bugs
  around stale incremental caches — the recalculation logic only has to
  be correct once, not correct incrementally.
- **Kahn's algorithm for both ordering and cycle detection in one pass.**
  Rather than running a separate cycle detection DFS and then a separate
  topological sort, Kahn's algorithm gives both for free: whatever nodes
  are left with a nonzero in degree after the queue drains are exactly
  the nodes that form (or depend on) a cycle.
- **Errors as sentinel strings, not exceptions that escape the engine.**
  Internally, evaluation *does* throw (an internal `EvalError2`/
  `FunctionError`) to unwind out of deeply nested AST evaluation the
  moment something goes wrong, but the engine always catches these at the
  cell boundary and stores the resulting sentinel string as the cell's
  value. That mirrors how real spreadsheets behave: a `#DIV/0!` is a
  first class value that can be read, compared, and displayed, not a
  crash.
- **Empty cells read as `0`.** Referencing a cell that was never set
  (e.g. `=Z9+1` where `Z9` is blank) evaluates to `1`, matching the usual
  spreadsheet convention, rather than producing a reference error. A
  `#REF!` sentinel still exists in `errors.js` for future use (e.g. if
  row or column deletion were implemented).
- **No dependencies, no build step.** Both the engine and the browser
  demo are hand written ES modules. This keeps `npm install` unnecessary
  and keeps the whole thing runnable from a fresh clone with nothing but
  Node and a static file server.

## Testing

33 tests across three files, run with Node's built in test runner
(`node:test` + `node:assert/strict`):

- `test/tokenizer.test.js` — token boundaries for numbers, cell refs,
  ranges, function calls, string literals, two character operators, and
  that invalid characters raise.
- `test/parser.test.js` — operator precedence (including right associative
  `^`), parenthesization, nested function calls, dependency collection
  from both single refs and expanded ranges, converting between column
  indices and letters in both directions, and malformed formula errors.
- `test/engine.test.js` — literal storage, arithmetic, recalculation
  after a precedent changes, recalculation order independent of
  insertion order, `SUM`/`AVERAGE`/`IF`, direct, self, and three cell circular
  references, cycle recovery after editing away the cycle, empty cell
  reads, `#DIV/0!`, `#VALUE!`, `#NAME?`, and downstream error propagation.

```bash
npm test
```

## Project structure

```
sheet-engine/
├── src/
│   ├── tokenizer.js   # turns a formula string into tokens
│   ├── parser.js      # turns tokens into an AST, extracts dependencies, converts between A1 refs and indices
│   ├── functions.js   # SUM/AVERAGE/MIN/MAX/COUNT/IF/ROUND/ABS/CONCAT
│   ├── errors.js      # spreadsheet error sentinel values
│   └── engine.js      # Sheet class: storage, dependency graph, Kahn's algorithm, evaluation
├── test/
│   ├── tokenizer.test.js
│   ├── parser.test.js
│   └── engine.test.js
├── index.html         # browser demo grid
├── app.js             # wires the grid UI to the Sheet engine
└── package.json
```
