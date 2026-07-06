// engine.js
// The Sheet class: owns cell storage, builds a dependency graph from parsed
// formulas, orders recalculation with Kahn's topological sort, detects
// circular references, and evaluates each formula's AST with error
// propagation (#REF!, #DIV/0!, #VALUE!, #CIRCULAR!).

import { parseFormula, collectDependencies, expandRangeRef, ParseError } from "./parser.js";
import { FUNCTIONS, isKnownFunction, FunctionError } from "./functions.js";
import { CIRCULAR, REF_ERROR, DIV_ZERO, VALUE_ERROR, NAME_ERROR, isErrorValue } from "./errors.js";

export class Sheet {
  constructor() {
    /** @type {Map<string, {raw: string, ast: object|null, deps: Set<string>, value: any}>} */
    this.cells = new Map();
  }

  /**
   * Sets a cell's raw input. Strings starting with "=" are parsed as
   * formulas; anything that looks numeric is stored as a number; everything
   * else is stored as a literal string. Triggers a full recalculation.
   * @param {string} ref e.g. "A1"
   * @param {string|number} rawInput
   */
  setCell(ref, rawInput) {
    ref = ref.toUpperCase();
    const raw = String(rawInput);

    if (raw === "") {
      this.cells.delete(ref);
      this._recalculate();
      return;
    }

    if (raw.startsWith("=")) {
      try {
        const ast = parseFormula(raw.slice(1));
        const deps = collectDependencies(ast);
        this.cells.set(ref, { raw, ast, deps, value: undefined });
      } catch (e) {
        if (e instanceof ParseError) {
          this.cells.set(ref, { raw, ast: null, deps: new Set(), value: NAME_ERROR });
        } else {
          throw e;
        }
      }
    } else if (raw.trim() !== "" && !Number.isNaN(Number(raw))) {
      this.cells.set(ref, { raw, ast: null, deps: new Set(), value: Number(raw) });
    } else {
      this.cells.set(ref, { raw, ast: null, deps: new Set(), value: raw });
    }

    this._recalculate();
  }

  /** Removes a cell entirely. */
  clearCell(ref) {
    this.cells.delete(ref.toUpperCase());
    this._recalculate();
  }

  /** @returns {any} the computed value of a cell, or 0 if the cell is empty. */
  getValue(ref) {
    const cell = this.cells.get(ref.toUpperCase());
    if (!cell) return 0;
    return cell.value;
  }

  /** @returns {string} the raw input (formula text or literal) for a cell. */
  getRaw(ref) {
    const cell = this.cells.get(ref.toUpperCase());
    return cell ? cell.raw : "";
  }

  /**
   * Rebuilds dependency edges for every formula cell and recomputes all
   * values in dependency order. Cells that participate in a cycle are set
   * to #CIRCULAR!.
   */
  _recalculate() {
    const formulaRefs = [...this.cells.entries()]
      .filter(([, c]) => c.ast !== null)
      .map(([ref]) => ref);

    // Build forward edges: dependency -> dependent (only between formula cells;
    // literal cells are leaves whose value is already known).
    const inDegree = new Map(formulaRefs.map((r) => [r, 0]));
    const adjacency = new Map(formulaRefs.map((r) => [r, []]));

    for (const ref of formulaRefs) {
      const cell = this.cells.get(ref);
      for (const dep of cell.deps) {
        if (inDegree.has(dep)) {
          adjacency.get(dep).push(ref);
          inDegree.set(ref, inDegree.get(ref) + 1);
        }
      }
    }

    // Kahn's algorithm.
    const queue = formulaRefs.filter((r) => inDegree.get(r) === 0);
    const order = [];
    const inDegreeWorking = new Map(inDegree);
    while (queue.length > 0) {
      const ref = queue.shift();
      order.push(ref);
      for (const next of adjacency.get(ref)) {
        inDegreeWorking.set(next, inDegreeWorking.get(next) - 1);
        if (inDegreeWorking.get(next) === 0) queue.push(next);
      }
    }

    const inCycle = new Set(formulaRefs.filter((r) => inDegreeWorking.get(r) !== 0));

    for (const ref of inCycle) {
      this.cells.get(ref).value = CIRCULAR;
    }

    for (const ref of order) {
      const cell = this.cells.get(ref);
      try {
        cell.value = this._evaluate(cell.ast, inCycle);
      } catch (e) {
        if (e instanceof FunctionError) {
          cell.value = e.message;
        } else if (e instanceof EvalError2) {
          cell.value = e.message;
        } else {
          throw e;
        }
      }
    }
  }

  /** Resolves a single cell reference's value, honoring cycle/error state. */
  _resolveCellValue(ref, inCycle) {
    if (inCycle.has(ref)) throw new EvalError2(CIRCULAR);
    const cell = this.cells.get(ref);
    if (!cell) return 0; // empty cell reads as 0
    if (isErrorValue(cell.value)) throw new EvalError2(cell.value);
    return cell.value;
  }

  _resolveRange(rangeRef, inCycle) {
    return expandRangeRef(rangeRef).map((ref) => this._resolveCellValue(ref, inCycle));
  }

  _evaluate(node, inCycle) {
    switch (node.type) {
      case "Number":
        return node.value;
      case "String":
        return node.value;
      case "CellRef":
        return this._resolveCellValue(node.ref, inCycle);
      case "RangeRef":
        return this._resolveRange(node.ref, inCycle);
      case "UnaryOp": {
        const v = this._toNumber(this._evaluate(node.operand, inCycle));
        return node.op === "-" ? -v : +v;
      }
      case "BinaryOp":
        return this._evalBinary(node, inCycle);
      case "Call":
        return this._evalCall(node, inCycle);
      default:
        throw new EvalError2(VALUE_ERROR);
    }
  }

  _toNumber(v) {
    if (typeof v === "number") return v;
    const n = Number(v);
    if (Number.isNaN(n)) throw new EvalError2(VALUE_ERROR);
    return n;
  }

  _evalBinary(node, inCycle) {
    const { op } = node;
    const left = this._evaluate(node.left, inCycle);
    const right = this._evaluate(node.right, inCycle);

    if (["=", "<", ">", "<=", ">=", "<>"].includes(op)) {
      switch (op) {
        case "=":
          return left === right;
        case "<>":
          return left !== right;
        case "<":
          return this._toNumber(left) < this._toNumber(right);
        case ">":
          return this._toNumber(left) > this._toNumber(right);
        case "<=":
          return this._toNumber(left) <= this._toNumber(right);
        case ">=":
          return this._toNumber(left) >= this._toNumber(right);
        default:
          throw new EvalError2(VALUE_ERROR);
      }
    }

    const a = this._toNumber(left);
    const b = this._toNumber(right);
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        if (b === 0) throw new EvalError2(DIV_ZERO);
        return a / b;
      case "^":
        return Math.pow(a, b);
      default:
        throw new EvalError2(VALUE_ERROR);
    }
  }

  _evalCall(node, inCycle) {
    if (!isKnownFunction(node.name)) throw new EvalError2(NAME_ERROR);
    const args = node.args.map((arg) => this._evaluate(arg, inCycle));
    return FUNCTIONS[node.name](args);
  }
}

/** Internal control flow error used to unwind evaluation with an error value. */
class EvalError2 extends Error {}

export { CIRCULAR, REF_ERROR, DIV_ZERO, VALUE_ERROR, NAME_ERROR };
