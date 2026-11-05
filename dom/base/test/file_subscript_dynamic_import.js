"use strict";

var result = Promise.all([
  import("chrome://mochitests/content/browser/dom/base/test/file_process_script_dynamic_import.sys.mjs").then(
    ns => ns.value,
    e => e.name
  ),
  import("./file_process_script_dynamic_import.sys.mjs").then(
    ns => ns.value,
    e => e.name
  ),
]);
