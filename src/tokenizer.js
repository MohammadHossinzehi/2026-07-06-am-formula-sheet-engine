// tokenizer.js
// Converts a formula source string (without the leading "=") into a flat
// list of tokens the parser can consume.

export const TokenType = Object.freeze({
  NUMBER: "NUMBER",
  STRING: "STRING",
  CELL_REF: "CELL_REF",
  RANGE_REF: "RANGE_REF",
  IDENT: "IDENT", // function names
  OP: "OP",
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  COMMA: "COMMA",
  EOF: "EOF",
});

const CELL_REF_RE = /^\$?[A-Za-z]+\$?[0-9]+/;

/**
 * @param {string} src
 * @returns {{type: string, value: any}[]}
 */
export function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const ch = src[i];

    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: TokenType.LPAREN, value: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: TokenType.RPAREN, value: ")" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: TokenType.COMMA, value: "," });
      i++;
      continue;
    }

    if ("+-*/^=<>".includes(ch)) {
      // support two character comparison operators: <=, >=, <>
      const two = src.slice(i, i + 2);
      if (two === "<=" || two === ">=" || two === "<>") {
        tokens.push({ type: TokenType.OP, value: two });
        i += 2;
        continue;
      }
      tokens.push({ type: TokenType.OP, value: ch });
      i++;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let out = "";
      while (j < n && src[j] !== '"') {
        out += src[j];
        j++;
      }
      tokens.push({ type: TokenType.STRING, value: out });
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: TokenType.NUMBER, value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      // could be a cell ref (A1), a range (A1:B3), or a function name (SUM)
      const rest = src.slice(i);
      const cellMatch = rest.match(CELL_REF_RE);
      if (cellMatch) {
        const first = cellMatch[0];
        let consumed = first.length;
        // check for range: A1:B3
        if (src[i + consumed] === ":") {
          const rest2 = src.slice(i + consumed + 1);
          const secondMatch = rest2.match(CELL_REF_RE);
          if (secondMatch) {
            const full = first + ":" + secondMatch[0];
            tokens.push({ type: TokenType.RANGE_REF, value: full.toUpperCase() });
            i += full.length;
            continue;
          }
        }
        tokens.push({ type: TokenType.CELL_REF, value: first.toUpperCase() });
        i += consumed;
        continue;
      }
      // identifier / function name
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: TokenType.IDENT, value: src.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }

    throw new Error(`Unexpected character "${ch}" at position ${i}`);
  }

  tokens.push({ type: TokenType.EOF, value: null });
  return tokens;
}
