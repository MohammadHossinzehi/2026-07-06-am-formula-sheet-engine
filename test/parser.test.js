import test from "node:test";
import assert from "node:assert/strict";
import { parseFormula, collectDependencies, colToIndex, indexToCol, expandRangeRef } from "../src/parser.js";

test("parses arithmetic with correct precedence", () => {
  const ast = parseFormula("1+2*3");
  assert.equal(ast.type, "BinaryOp");
  assert.equal(ast.op, "+");
  assert.equal(ast.right.op, "*");
});

test("power is right associative", () => {
  const ast = parseFormula("2^3^2");
  // 2^(3^2) = 2^9 = 512, not (2^3)^2 = 64
  assert.equal(ast.op, "^");
  assert.equal(ast.left.value, 2);
  assert.equal(ast.right.type, "BinaryOp");
  assert.equal(ast.right.op, "^");
});

test("parses parenthesized expressions", () => {
  const ast = parseFormula("(1+2)*3");
  assert.equal(ast.op, "*");
  assert.equal(ast.left.op, "+");
});

test("parses function calls with multiple arguments", () => {
  const ast = parseFormula("SUM(A1,A2,A3)");
  assert.equal(ast.type, "Call");
  assert.equal(ast.name, "SUM");
  assert.equal(ast.args.length, 3);
});

test("parses nested function calls", () => {
  const ast = parseFormula("IF(A1>0,SUM(B1:B3),0)");
  assert.equal(ast.type, "Call");
  assert.equal(ast.args[1].type, "Call");
  assert.equal(ast.args[1].name, "SUM");
});

test("collects simple cell dependencies", () => {
  const ast = parseFormula("A1+B2*C3");
  const deps = collectDependencies(ast);
  assert.deepEqual([...deps].sort(), ["A1", "B2", "C3"]);
});

test("collects and expands range dependencies", () => {
  const ast = parseFormula("SUM(A1:A3)");
  const deps = collectDependencies(ast);
  assert.deepEqual([...deps].sort(), ["A1", "A2", "A3"]);
});

test("column index conversions round trip", () => {
  assert.equal(colToIndex("A"), 0);
  assert.equal(colToIndex("Z"), 25);
  assert.equal(colToIndex("AA"), 26);
  assert.equal(indexToCol(0), "A");
  assert.equal(indexToCol(25), "Z");
  assert.equal(indexToCol(26), "AA");
});

test("expands a 2D range into all member cells", () => {
  const cells = expandRangeRef("A1:B2");
  assert.deepEqual(cells.sort(), ["A1", "A2", "B1", "B2"]);
});

test("throws a parse error for malformed formulas", () => {
  assert.throws(() => parseFormula("1++"));
  assert.throws(() => parseFormula("SUM(A1"));
});
