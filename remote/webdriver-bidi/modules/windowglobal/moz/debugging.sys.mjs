/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { WindowGlobalBiDiModule } from "chrome://remote/content/webdriver-bidi/modules/WindowGlobalBiDiModule.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  addDebuggerToGlobal: "moz-src:///devtools/platform/jsdebugger.sys.mjs",
  DebugSession: "moz-src:///js/src/debugger/DebugSession.sys.mjs",

  error: "chrome://remote/content/shared/webdriver/Errors.sys.mjs",
  Log: "chrome://remote/content/shared/Log.sys.mjs",
  serialize: "chrome://remote/content/webdriver-bidi/RemoteValue.sys.mjs",
  OwnershipModel: "chrome://remote/content/webdriver-bidi/RemoteValue.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "logger", () =>
  lazy.Log.get(lazy.Log.TYPES.WEBDRIVER_BIDI)
);

class DebuggingModule extends WindowGlobalBiDiModule {
  #debugSession;

  constructor(messageHandler) {
    super(messageHandler);

    this.#debugSession = new lazy.DebugSession(this.messageHandler.window, {
      createDebugger: () => {
        if (!("Debugger" in globalThis)) {
          // eslint-disable-next-line mozilla/reject-globalThis-modification
          lazy.addDebuggerToGlobal(globalThis);
        }
        return new Debugger();
      },
      waitWhilePaused: isResumed => {
        Services.tm.spinEventLoopUntil("webdriver-bidi-debugging", isResumed);
      },
      serializeValue: value => this.#serializeValue(value),
      serializeUnavailableVariable: kind => ({ type: kind }),
      setDebuggerEnvironment: env => {
        this.messageHandler.debuggerEnvironment = env;
      },
      onPaused: ({ url, line, column, callFrames }) => {
        this.emitEvent("moz:debugging.paused", {
          context: this.messageHandler.context,
          url,
          line,
          column,
          callFrames,
        });
      },
      onResumed: () => {
        this.emitEvent("moz:debugging.resumed", {
          context: this.messageHandler.context,
        });
      },
      log: lazy.logger,
      createError: (kind, message) => {
        switch (kind) {
          case "not-enabled":
            return new lazy.error.UnsupportedOperationError(
              "Debugger is not initialized. Use moz:debugging.enable first."
            );
          case "invalid-argument":
            return new lazy.error.InvalidArgumentError(message);
          default:
            return new lazy.error.UnknownError(message);
        }
      },
    });
  }

  destroy() {
    this.#debugSession.destroy();
  }

  #serializeValue(value) {
    const realm = this.messageHandler.getRealm({
      realmId: null,
      sandboxName: null,
    });

    let rawValue = value;
    if (value instanceof Debugger.Object) {
      // Bug 2041412: This might lead to visible side effects on the content
      // page, needs more investigation.
      rawValue = Cu.waiveXrays(value.unsafeDereference());
    }

    const serializationOptions = {
      maxDomDepth: 0,
      maxObjectDepth: 1,
    };

    return lazy.serialize(
      rawValue,
      serializationOptions,
      lazy.OwnershipModel.None,
      new Map(),
      realm,
      {}
    );
  }

  /**
   * Internal commands
   */

  _applySessionData(params) {
    const { category } = params;

    if (category === "debugging-enabled") {
      const shouldEnable = params.sessionData.some(item =>
        this.messageHandler.matchesContext(item.contextDescriptor)
      );

      if (shouldEnable) {
        if (!this.#debugSession.enable()) {
          lazy.logger.error(
            "Failed to add window as debuggee for browsing context: " +
              this.messageHandler.contextId
          );
        }
      } else {
        this.#debugSession.disable();
      }
    } else if (category === "breakpoint") {
      this.#debugSession.setBreakpoints(
        params.sessionData.map(item => item.value)
      );
    }
  }

  _getScriptSource(params) {
    const { scriptUrl } = params;
    const source = this.#debugSession.getScriptSource(scriptUrl);
    return { source };
  }

  _listScripts() {
    const scripts = this.#debugSession.listScripts();
    return { scripts };
  }

  _resume() {
    this.#debugSession.resume();
  }

  _stepInto() {
    this.#debugSession.stepInto();
  }

  _stepOut() {
    this.#debugSession.stepOut();
  }

  _stepOver() {
    this.#debugSession.stepOver();
  }
}

export const debugging = DebuggingModule;
