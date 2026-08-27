"use strict";

/* globals ExtensionAPI, Services, XPCOMUtils */

const PREFIX = "tresize@mozilla.org";

this.tresize = class extends ExtensionAPI {
  onStartup() {
    let { baseURI } = this.extension;

    this.listener = function listener({ target, data }) {
      let win = target.documentGlobal;
      Services.scriptloader.loadSubScriptWithOptions(
        baseURI.resolve("/content/Profiler.js"),
        {
          target: win,
          allowUnsafeURL: true,
        }
      );
      Services.scriptloader.loadSubScriptWithOptions(
        baseURI.resolve("/content/tresize.js"),
        {
          target: win,
          allowUnsafeURL: true,
        }
      );

      function sendResult(result) {
        target.messageManager.sendAsyncMessage(`${PREFIX}:chrome-run-reply`, {
          id: data.id,
          result,
        });
      }
      win.runTest(sendResult, data.locationSearch);
    };

    Services.mm.addMessageListener(
      `${PREFIX}:chrome-run-message`,
      this.listener
    );

    this.framescriptURL = baseURI.resolve("/content/framescript.js");
    Services.mm.loadFrameScript(this.framescriptURL, true);
  }

  onShutdown() {
    Services.mm.removeDelayedFrameScript(this.framescriptURL);
    Services.mm.removeMessageListener(
      `${PREFIX}:chrome-run-message`,
      this.listener
    );
  }
};
