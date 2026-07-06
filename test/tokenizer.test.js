import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, TokenType } from "../src/tokenizer.js";

test("tokenizes numbers and operators", () => {
  const tokens = tokenize("1 + 2.5 * 3");
  const types = tokens.map((t) => t.type);
  assert.deepEqual(types, [
    TokenType.NUMBER,
    TokenType.OP,
    TokenType.NUMBER,
    TokenType.OP,
    TokenType.NUMBER,
    TokenType.EOF,
  ]);
});

test("tokenizes cell references", () => {
  const tokens = tokenize("A1+B12");
  assert.equal(tokens[0].type, TokenType.CELL_REF);
  assert.equal(tokens[0].value, "A1");
  assert.equal(tokens[2].type, TokenType.CELL_REF);
  assert.equal(tokens[2].value, "B12");
});

test("tokenizes range references", () => {
  const tokens = tokenize("SUM(A1:A10)");
  const rangeToken = tokens.find((t) => t.type === TokenType.RANGE_REF);
  assert.ok(rangeToken);
  assert.equal(rangeToken.value, "A1:A10");
});

test("tokenizes function calls and commas", () => {
  const tokens = tokenize("IF(A1>0,1,2)");
  const types = tokens.map((t) => t.type);
  assert.deepEqual(types, [
    TokenType.IDENT,
    TokenType.LPAREN,
    TokenType.CELL_REF,
    TokenType.OP,
    TokenType.NUMBER,
    TokenType.COMMA,
    TokenType.NUMBER,
    TokenType.COMMA,
    TokenType.NUMBER,
    TokenType.RPAREN,
    TokenType.EOF,
  ]);
});

test("tokenizes string literals", () => {
  const tokens = tokenize('CONCAT("a","b")');
  const strings = tokens.filter((t) => t.type === TokenType.STRING);
  assert.deepEqual(strings.map((s) => s.value), ["a", "b"]);
});

test("tokenizes two character comparison operators", () => {
  const tokens = tokenize("A1<=B1");
  assert.equal(tokens[1].type, TokenType.OP);
  assert.equal(tokens[1].value, "<=");
});

test("throws on unexpected characters", () => {
  assert.throws(() => tokenize("A1 & B1"));
});
