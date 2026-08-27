/* global base */
var ns = {};
Services.scriptloader.loadSubScriptWithOptions(
  base + "file_expandosharing.js",
  { target: ns, allowUnsafeURL: true }
);
var checkFromESM = ns.checkFromESM;
