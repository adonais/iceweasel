// eslint-disable-next-line import-x/no-unassigned-import, import-x/no-unresolved
import {} from "../circular_depdendency.mjs";

export function exportedFunction() {
  throw "Wrong version of function called";
}

throw "Shouldn't laod file bad/module_3.mjs";
