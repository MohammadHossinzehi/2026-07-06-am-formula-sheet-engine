// app.js
// Wires the Sheet engine up to a plain HTML table grid. No framework, no
// build step: this file is loaded directly as an ES module by index.html.

import { Sheet } from "./src/engine.js";
import { indexToCol } from "./src/parser.js";
import { isErrorValue } from "./src/errors.js";

const COLS = 8; // A..H
const ROWS = 15;

const sheet = new Sheet();
let activeRef = "A1";

const container = document.getElementById("grid-container");
const input = document.getElementById("formula-input");
const activeLabel = document.getElementById("active-ref");

function buildGrid() {
  const table = document.createElement("table");

  const headRow = document.createElement("tr");
  headRow.appendChild(document.createElement("th"));
  for (let c = 0; c < COLS; c++) {
    const th = document.createElement("th");
    th.textContent = indexToCol(c);
    headRow.appendChild(th);
  }
  table.appendChild(headRow);

  for (let r = 1; r <= ROWS; r++) {
    const tr = document.createElement("tr");
    const rowHead = document.createElement("td");
    rowHead.textContent = String(r);
    rowHead.className = "row-head";
    tr.appendChild(rowHead);

    for (let c = 0; c < COLS; c++) {
      const ref = indexToCol(c) + r;
      const td = document.createElement("td");
      td.className = "cell";
      td.dataset.ref = ref;
      td.addEventListener("click", () => selectCell(ref));
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  container.appendChild(table);
}

function selectCell(ref) {
  activeRef = ref;
  activeLabel.textContent = ref;
  input.value = sheet.getRaw(ref);
  document.querySelectorAll("td.cell.selected").forEach((el) => el.classList.remove("selected"));
  const td = document.querySelector(`td.cell[data-ref="${ref}"]`);
  if (td) td.classList.add("selected");
  input.focus();
}

function renderAll() {
  document.querySelectorAll("td.cell").forEach((td) => {
    const ref = td.dataset.ref;
    const value = sheet.getValue(ref);
    td.textContent = value === "" || value === undefined ? "" : String(value);
    td.classList.toggle("error", isErrorValue(value));
  });
}

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sheet.setCell(activeRef, input.value);
    renderAll();
    // Move selection down a row, like a spreadsheet.
    const col = activeRef.match(/[A-Za-z]+/)[0];
    const row = parseInt(activeRef.match(/[0-9]+/)[0], 10);
    if (row < ROWS) selectCell(col + (row + 1));
  }
});

buildGrid();
selectCell("A1");

// A small already populated example so the grid isn't empty on first load.
sheet.setCell("A1", "10");
sheet.setCell("A2", "20");
sheet.setCell("A3", "30");
sheet.setCell("B1", "=SUM(A1:A3)");
sheet.setCell("B2", "=AVERAGE(A1:A3)");
sheet.setCell("B3", '=IF(B1>50,"big","small")');
renderAll();
