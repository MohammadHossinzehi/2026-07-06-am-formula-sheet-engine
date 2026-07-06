import test from "node:test";
import assert from "node:assert/strict";
import { Sheet, CIRCULAR, DIV_ZERO, VALUE_ERROR, NAME_ERROR } from "../src/engine.js";

test("stores and reads literal numbers and strings", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "42");
  sheet.setCell("A2", "hello");
  assert.equal(sheet.getValue("A1"), 42);
  assert.equal(sheet.getValue("A2"), "hello");
});

test("evaluates a simple arithmetic formula", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "2");
  sheet.setCell("A2", "3");
  sheet.setCell("A3", "=A1+A2*2");
  assert.equal(sheet.getValue("A3"), 8);
});

test("recalculates dependents when a precedent changes", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "10");
  sheet.setCell("B1", "=A1*2");
  sheet.setCell("C1", "=B1+1");
  assert.equal(sheet.getValue("C1"), 21);

  sheet.setCell("A1", "5");
  assert.equal(sheet.getValue("B1"), 10);
  assert.equal(sheet.getValue("C1"), 11);
});

test("recalculates in correct order regardless of insertion order", () => {
  const sheet = new Sheet();
  // Define C1 (depends on B1) before B1 (depends on A1) before A1 itself.
  sheet.setCell("C1", "=B1+1");
  sheet.setCell("B1", "=A1*10");
  sheet.setCell("A1", "3");
  assert.equal(sheet.getValue("B1"), 30);
  assert.equal(sheet.getValue("C1"), 31);
});

test("SUM and AVERAGE over a range", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "1");
  sheet.setCell("A2", "2");
  sheet.setCell("A3", "3");
  sheet.setCell("A4", "=SUM(A1:A3)");
  sheet.setCell("A5", "=AVERAGE(A1:A3)");
  assert.equal(sheet.getValue("A4"), 6);
  assert.equal(sheet.getValue("A5"), 2);
});

test("IF branches on a comparison", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "10");
  sheet.setCell("A2", '=IF(A1>5,"big","small")');
  assert.equal(sheet.getValue("A2"), "big");
});

test("detects a direct two cell circular reference", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "=B1+1");
  sheet.setCell("B1", "=A1+1");
  assert.equal(sheet.getValue("A1"), CIRCULAR);
  assert.equal(sheet.getValue("B1"), CIRCULAR);
});

test("detects a self reference as circular", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "=A1+1");
  assert.equal(sheet.getValue("A1"), CIRCULAR);
});

test("detects a longer three cell cycle", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "=B1+1");
  sheet.setCell("B1", "=C1+1");
  sheet.setCell("C1", "=A1+1");
  assert.equal(sheet.getValue("A1"), CIRCULAR);
  assert.equal(sheet.getValue("B1"), CIRCULAR);
  assert.equal(sheet.getValue("C1"), CIRCULAR);
});

test("breaking a cycle recovers normal evaluation", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "=B1+1");
  sheet.setCell("B1", "=A1+1");
  assert.equal(sheet.getValue("A1"), CIRCULAR);

  sheet.setCell("B1", "5");
  assert.equal(sheet.getValue("A1"), 6);
  assert.equal(sheet.getValue("B1"), 5);
});

test("empty cells referenced by a formula read as zero", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "=Z9+1");
  assert.equal(sheet.getValue("A1"), 1);
});

test("division by zero produces #DIV/0!", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "0");
  sheet.setCell("A2", "=10/A1");
  assert.equal(sheet.getValue("A2"), DIV_ZERO);
});

test("type mismatches produce #VALUE!", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "hello");
  sheet.setCell("A2", "=A1+1");
  assert.equal(sheet.getValue("A2"), VALUE_ERROR);
});

test("unknown function names produce #NAME?", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "=NOTAFUNCTION(1)");
  assert.equal(sheet.getValue("A1"), NAME_ERROR);
});

test("errors propagate downstream to dependent cells", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "0");
  sheet.setCell("A2", "=10/A1");
  sheet.setCell("A3", "=A2+1");
  assert.equal(sheet.getValue("A2"), DIV_ZERO);
  assert.equal(sheet.getValue("A3"), DIV_ZERO);
});

test("clearing a cell removes it and updates dependents", () => {
  const sheet = new Sheet();
  sheet.setCell("A1", "5");
  sheet.setCell("A2", "=A1+1");
  assert.equal(sheet.getValue("A2"), 6);
  sheet.clearCell("A1");
  assert.equal(sheet.getValue("A2"), 1);
});
