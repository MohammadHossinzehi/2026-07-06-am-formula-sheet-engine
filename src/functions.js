// functions.js
// Built in spreadsheet functions. Each receives an array of already
// evaluated arguments (numbers, strings, booleans, or nested arrays for
// range arguments) and returns a scalar result or throws a FunctionError,
// which the engine turns into a #VALUE! style error value.

import { VALUE_ERROR } from "./errors.js";

export class FunctionError extends Error {}

function flatten(args) {
  const out = [];
  for (const a of args) {
    if (Array.isArray(a)) out.push(...flatten(a));
    else out.push(a);
  }
  return out;
}

function toNumbers(args) {
  return flatten(args)
    .filter((v) => v !== "" && v !== null && v !== undefined)
    .map((v) => {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isNaN(n)) throw new FunctionError(VALUE_ERROR);
      return n;
    });
}

export const FUNCTIONS = {
  SUM(args) {
    return toNumbers(args).reduce((a, b) => a + b, 0);
  },
  AVERAGE(args) {
    const nums = toNumbers(args);
    if (nums.length === 0) throw new FunctionError(VALUE_ERROR);
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  },
  MIN(args) {
    const nums = toNumbers(args);
    if (nums.length === 0) return 0;
    return Math.min(...nums);
  },
  MAX(args) {
    const nums = toNumbers(args);
    if (nums.length === 0) return 0;
    return Math.max(...nums);
  },
  COUNT(args) {
    return flatten(args).filter((v) => v !== "" && v !== null && v !== undefined && !Number.isNaN(Number(v))).length;
  },
  IF(args) {
    if (args.length < 2 || args.length > 3) throw new FunctionError(VALUE_ERROR);
    const [cond, whenTrue, whenFalse] = args;
    return cond ? whenTrue : whenFalse !== undefined ? whenFalse : false;
  },
  ROUND(args) {
    const [value, digits = 0] = flatten(args);
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
  },
  ABS(args) {
    const [value] = flatten(args);
    return Math.abs(Number(value));
  },
  CONCAT(args) {
    return flatten(args).map(String).join("");
  },
};

export function isKnownFunction(name) {
  return Object.prototype.hasOwnProperty.call(FUNCTIONS, name);
}
