"use strict";

Promise.all([
  import("./file_process_script_dynamic_import.sys.mjs").then(
    ns => ns.value,
    e => e.name
  ),
  import("chrome://mochitests/content/browser/dom/base/test/file_process_script_dynamic_import.sys.mjs").then(
    ns => ns.value,
    e => e.name
  ),
]).then(([relative, absolute]) =>
  sendAsyncMessage("Test:DynamicImport:File", {
    processType: Services.appinfo.processType,
    relative,
    absolute,
  })
);
