// parser.js
// A recursive descent / precedence climbing parser that turns a token
// stream into an AST. Grammar (highest to lowest precedence binds tightest):
//
//   expr        -> comparison
//   comparison  -> additive ( ("=" | "<" | ">" | "<=" | ">=" | "<>") additive )*
//   additive    -> term ( ("+" | "-") term )*
//   term        -> unary ( ("*" | "/") unary )*
//   unary       -> ("-" | "+") unary | power
//   power       -> primary ("^" power)?      (right associative)
//   primary     -> NUMBER | STRING | CELL_REF | RANGE_REF
//                | IDENT "(" (expr ("," expr)*)? ")"
//                | "(" expr ")"

import { tokenize, TokenType } from "./tokenizer.js";

class ParseError extends Error {}

export function parseFormula(src) {
  const tokens = tokenize(src);
  let pos = 0;

  function peek() {
    return tokens[pos];
  }
  function advance() {
    return tokens[pos++];
  }
  function expect(type) {
    const t = peek();
    if (t.type !== type) {
      throw new ParseError(`Expected ${type} but got ${t.type} (${t.value})`);
    }
    return advance();
  }

  function parseExpr() {
    return parseComparison();
  }

  function parseComparison() {
    let left = parseAdditive();
    while (
      peek().type === TokenType.OP &&
      ["=", "<", ">", "<=", ">=", "<>"].includes(peek().value)
    ) {
      const op = advance().value;
      const right = parseAdditive();
      left = { type: "BinaryOp", op, left, right };
    }
    return left;
  }

  function parseAdditive() {
    let left = parseTerm();
    while (peek().type === TokenType.OP && ["+", "-"].includes(peek().value)) {
      const op = advance().value;
      const right = parseTerm();
      left = { type: "BinaryOp", op, left, right };
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    while (peek().type === TokenType.OP && ["*", "/"].includes(peek().value)) {
      const op = advance().value;
      const right = parseUnary();
      left = { type: "BinaryOp", op, left, right };
    }
    return left;
  }

  function parseUnary() {
    if (peek().type === TokenType.OP && (peek().value === "-" || peek().value === "+")) {
      const op = advance().value;
      const operand = parseUnary();
      return { type: "UnaryOp", op, operand };
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePrimary();
    if (peek().type === TokenType.OP && peek().value === "^") {
      advance();
      const exponent = parseUnary(); // right associative, allows -2^2 style unary on rhs
      return { type: "BinaryOp", op: "^", left: base, right: exponent };
    }
    return base;
  }

  function parsePrimary() {
    const t = peek();

    if (t.type === TokenType.NUMBER) {
      advance();
      return { type: "Number", value: t.value };
    }
    if (t.type === TokenType.STRING) {
      advance();
      return { type: "String", value: t.value };
    }
    if (t.type === TokenType.CELL_REF) {
      advance();
      return { type: "CellRef", ref: t.value };
    }
    if (t.type === TokenType.RANGE_REF) {
      advance();
      const [start, end] = t.value.split(":");
      return { type: "RangeRef", start, end, ref: t.value };
    }
    if (t.type === TokenType.LPAREN) {
      advance();
      const inner = parseExpr();
      expect(TokenType.RPAREN);
      return inner;
    }
    if (t.type === TokenType.IDENT) {
      advance();
      expect(TokenType.LPAREN);
      const args = [];
      if (peek().type !== TokenType.RPAREN) {
        args.push(parseExpr());
        while (peek().type === TokenType.COMMA) {
          advance();
          args.push(parseExpr());
        }
      }
      expect(TokenType.RPAREN);
      return { type: "Call", name: t.value, args };
    }

    throw new ParseError(`Unexpected token ${t.type} (${t.value})`);
  }

  const ast = parseExpr();
  expect(TokenType.EOF);
  return ast;
}

/**
 * Walks an AST and collects the set of cell references it depends on.
 * Ranges are expanded into their individual member cells.
 * @param {object} ast
 * @returns {Set<string>}
 */
export function collectDependencies(ast) {
  const deps = new Set();

  function expandRange(start, end) {
    const { col: c1, row: r1 } = splitRef(start);
    const { col: c2, row: r2 } = splitRef(end);
    const colStart = Math.min(colToIndex(c1), colToIndex(c2));
    const colEnd = Math.max(colToIndex(c1), colToIndex(c2));
    const rowStart = Math.min(r1, r2);
    const rowEnd = Math.max(r1, r2);
    const cells = [];
    for (let c = colStart; c <= colEnd; c++) {
      for (let r = rowStart; r <= rowEnd; r++) {
        cells.push(indexToCol(c) + r);
      }
    }
    return cells;
  }

  function walk(node) {
    if (!node) return;
    switch (node.type) {
      case "CellRef":
        deps.add(node.ref);
        break;
      case "RangeRef":
        for (const c of expandRange(node.start, node.end)) deps.add(c);
        break;
      case "BinaryOp":
        walk(node.left);
        walk(node.right);
        break;
      case "UnaryOp":
        walk(node.operand);
        break;
      case "Call":
        node.args.forEach(walk);
        break;
      default:
        break;
    }
  }

  walk(ast);
  return deps;
}

export function splitRef(ref) {
  const m = ref.match(/^([A-Za-z]+)([0-9]+)$/);
  if (!m) throw new ParseError(`Invalid cell reference "${ref}"`);
  return { col: m[1].toUpperCase(), row: parseInt(m[2], 10) };
}

export function colToIndex(col) {
  let idx = 0;
  for (const ch of col) {
    idx = idx * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  }
  return idx - 1; // zero based
}

export function indexToCol(idx) {
  let n = idx + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function expandRangeRef(rangeRef) {
  const [start, end] = rangeRef.split(":");
  const { col: c1, row: r1 } = splitRef(start);
  const { col: c2, row: r2 } = splitRef(end);
  const colStart = Math.min(colToIndex(c1), colToIndex(c2));
  const colEnd = Math.max(colToIndex(c1), colToIndex(c2));
  const rowStart = Math.min(r1, r2);
  const rowEnd = Math.max(r1, r2);
  const cells = [];
  for (let c = colStart; c <= colEnd; c++) {
    for (let r = rowStart; r <= rowEnd; r++) {
      cells.push(indexToCol(c) + r);
    }
  }
  return cells;
}

export { ParseError };
