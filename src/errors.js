// errors.js
// Spreadsheet style error values. These are plain sentinel strings that
// propagate through arithmetic just like Excel/Sheets error values do.

export const CIRCULAR = "#CIRCULAR!";
export const REF_ERROR = "#REF!";
export const DIV_ZERO = "#DIV/0!";
export const VALUE_ERROR = "#VALUE!";
export const NAME_ERROR = "#NAME?";

export function isErrorValue(v) {
  return (
    typeof v === "string" &&
    (v === CIRCULAR ||
      v === REF_ERROR ||
      v === DIV_ZERO ||
      v === VALUE_ERROR ||
      v === NAME_ERROR)
  );
}
