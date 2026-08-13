/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Parent-process driver for the in-process WebAssembly DLP module. Called by the
 * C++ WasmModuleBackend, which passes a serialized ContentAnalysisRequest and
 * expects a serialized ContentAnalysisResponse back.
 *
 * This runs in the parent process so it cannot compile or run the module -
 * that work is done by the ContentAnalysisWasm actor.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  E10SUtils: "resource://gre/modules/E10SUtils.sys.mjs",
  ExtensionParent: "resource://gre/modules/ExtensionParent.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

// keep in sync with mozilla::contentanalysis::kWasmModuleExtensionId
const EXTENSION_ID = "dlp-wasm-provider@mozilla.org";
const REQUIRE_SIGNATURE_PREF =
  "browser.contentanalysis.wasm_module_extension_require_signature";

// Name the module is expected to have inside an extension's package.
const EXTENSION_MODULE_FILENAME = "content_analysis_wasm.wasm";

const ACTOR_NAME = "ContentAnalysisWasm";

/**
 * Read a file packaged inside an installed extension (identified by ID) as raw
 * bytes. Also checks the signature if the pref is set.
 *
 * @param {string} extensionId The extension ID to load
 * @param {string} path The path of the file to load from the extension
 * @returns {{moduleBytes: Uint8Array, extensionVersion: string}}
 */
function readExtensionBytes(extensionId, path) {
  const extension =
    lazy.ExtensionParent.GlobalManager.getExtension(extensionId);
  if (!extension) {
    return null;
  }

  const requireSignature = Services.prefs.getBoolPref(
    REQUIRE_SIGNATURE_PREF,
    true
  );
  if (requireSignature) {
    const signedState = extension.addonData?.signedState;
    if (!(signedState >= lazy.AddonManager.SIGNEDSTATE_SYSTEM)) {
      throw Components.Exception(
        `DLP wasm extension '${extensionId}' is not acceptably signed ` +
          `(signedState=${signedState}); refusing to load its module`,
        Cr.NS_ERROR_INVALID_SIGNATURE
      );
    }
  }

  const channel = lazy.NetUtil.newChannel({
    uri: extension.getURL(path),
    loadUsingSystemPrincipal: true,
  });
  const stream = channel.open();
  const bstream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
    Ci.nsIBinaryInputStream
  );
  bstream.setInputStream(stream);
  const bytes = bstream.readByteArray(stream.available());
  bstream.close();
  stream.close();
  return {
    moduleBytes: Uint8Array.from(bytes),
    extensionVersion: extension.version,
  };
}

/**
 * nsIContentAnalysisWasmRunner implementation. See the module comment above.
 */
export class ContentAnalysisWasmRunner {
  QueryInterface = ChromeUtils.generateQI(["nsIContentAnalysisWasmRunner"]);

  async analyze(aRequestBytes, aContentBytes, aRules) {
    // Reading + signature verification stay in the parent (the trust decision):
    // WebExtensionPolicy/AddonManager are parent-process only.
    const extensionInfo = readExtensionBytes(
      EXTENSION_ID,
      EXTENSION_MODULE_FILENAME
    );
    if (!extensionInfo) {
      throw Components.Exception(
        `DLP WASM extension '${EXTENSION_ID}' is not installed or not enabled`,
        Cr.NS_ERROR_NOT_AVAILABLE
      );
    }
    const { moduleBytes, extensionVersion } = extensionInfo;

    const actor = await this.#getActor();
    // Resolves with a Uint8Array, which the C++ caller reads in bulk.
    return actor.sendQuery("Analyze", {
      version: extensionVersion,
      moduleBytes,
      requestBytes: Uint8Array.from(aRequestBytes),
      contentBytes: Uint8Array.from(aContentBytes || []),
      rules: toPlainRules(aRules),
    });
  }

  async #getActor() {
    // We use the privilegedabout process for this because:
    // - it's essentially always running, so it won't add any overhead
    // - it has the ability to compile and run WASM
    const keepAlive = await ChromeUtils.ensureHeadlessContentProcess(
      lazy.E10SUtils.PRIVILEGEDABOUT_REMOTE_TYPE
    );
    if (!keepAlive?.domProcess?.canSend) {
      throw Components.Exception(
        "could not start a content process for the DLP wasm module",
        Cr.NS_ERROR_NOT_AVAILABLE
      );
    }
    return keepAlive.domProcess.getActor(ACTOR_NAME);
  }
}

// Convert the C++-supplied nsIContentAnalysisRule objects into plain,
// structured-cloneable objects to ship to the content process.
function toPlainRules(aRules) {
  return Array.from(aRules || [], rule => ({
    name: rule.name,
    operations: Array.from(rule.operations),
    domains: Array.from(rule.domains),
    contentPatterns: Array.from(rule.contentPatterns),
    ruleType: rule.verdict,
    message: rule.message,
  }));
}
