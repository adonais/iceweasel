import { a } from "module1.js";

export const staticValue = a;

export function importSameSpecifier() {
  return import("module1.js");
}

export function importOtherSpecifier() {
  return import("module2.js");
}
