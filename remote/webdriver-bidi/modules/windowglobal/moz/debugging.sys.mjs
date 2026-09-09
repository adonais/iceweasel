/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { WindowGlobalBiDiModule } from "chrome://remote/content/webdriver-bidi/modules/WindowGlobalBiDiModule.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  addDebuggerToGlobal: "resource://gre/modules/jsdebugger.sys.mjs",

  error: "chrome://remote/content/shared/webdriver/Errors.sys.mjs",
  Log: "chrome://remote/content/shared/Log.sys.mjs",
  serialize: "chrome://remote/content/webdriver-bidi/RemoteValue.sys.mjs",
  OwnershipModel: "chrome://remote/content/webdriver-bidi/RemoteValue.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "logger", () =>
  lazy.Log.get(lazy.Log.TYPES.WEBDRIVER_BIDI)
);

/**
 * An object that identifies a live breakpoint set on a script.
 *
 * @typedef LiveBreakpoint
 *
 * @property {Debugger.Script} script
 *    The script instance where the breakpoint is set.
 * @property {number} offset
 *    The offset corresponding to the live breakpoint location in this script.
 */

class DebuggingModule extends WindowGlobalBiDiModule {
  #breakpointHandler;
  #breakpointLocationMap;
  #dbg;
  #pausedFrames;
  #previousPauseLocation;

  constructor(messageHandler) {
    super(messageHandler);

    // Map of breakpoint id to BreakpointLocation with an additional
    // "liveBreakpoints" property which is a set of LiveBreakpoint, initially
    // empty.
    this.#breakpointLocationMap = new Map();

    // State flags.
    this.#pausedFrames = [];

    this.#dbg = null;
    this.#previousPauseLocation = null;

    this.#breakpointHandler = {
      hit: this.#pauseAtFrame,
    };
  }

  get #paused() {
    return !!this.#pausedFrames.length;
  }

  destroy() {
    this.#destroyDebugger();
    this.#breakpointHandler = null;
    this.#breakpointLocationMap = null;
  }

  #buildScopeChain(frame) {
    const scopeChain = [];
    const realm = this.messageHandler.getRealm({
      realmId: null,
      sandboxName: null,
    });

    let env = frame.environment;
    while (env) {
      if (env.type === "declarative" && env.scopeKind != null) {
        const scope = {
          type: env.scopeKind,
          variables: {},
        };

        const names = env.names();
        for (const name of names) {
          try {
            const value = env.getVariable(name);
            scope.variables[name] = this.#serializeVariable(value, realm);
          } catch (e) {
            lazy.logger.error(
              "Unable to retrieve and serialize the scope variable: " + name
            );
          }
        }

        scopeChain.push(scope);
      }

      env = env.parent;
    }

    return scopeChain;
  }

  #buildCallFrames(startFrame) {
    const callFrames = [];
    let frame = startFrame;
    let frameIndex = 0;

    while (frame) {
      const { url, line, column } = this.#getFrameLocation(frame);
      const scopeChain = this.#buildScopeChain(frame);

      let functionName = "(anonymous)";
      if (frame.callee && frame.callee.name) {
        functionName = frame.callee.name;
      } else if (frame.callee && frame.callee.displayName) {
        functionName = frame.callee.displayName;
      }

      callFrames.push({
        callFrameId: String(frameIndex),
        functionName,
        location: { url, line, column },
        scopeChain,
      });

      frame = frame.older;
      frameIndex++;
    }

    return callFrames;
  }

  /**
   * Recursively collect the provided script and all of its descendant scripts.
   * A breakpoint line often belongs to an inner function, which is a distinct
   * child script only reachable by walking the tree.
   *
   * @param {Debugger.Script} script
   *     The root script to start the traversal from.
   * @returns {Array<Debugger.Script>}
   *     The script and all of its transitive child scripts.
   */
  #collectScriptTree(script) {
    const scripts = [];
    const stack = [script];
    while (stack.length) {
      const current = stack.pop();
      scripts.push(current);
      if (current.format === "js") {
        try {
          stack.push(...current.getChildScripts());
        } catch (e) {
          // Accessing child scripts can throw for optimized-out scripts.
        }
      }
    }
    return scripts;
  }

  #createDebugger() {
    if (this.#dbg) {
      return;
    }

    if (!("Debugger" in globalThis)) {
      // eslint-disable-next-line mozilla/reject-globalThis-modification
      lazy.addDebuggerToGlobal(globalThis);
    }

    // Create a debugger instance and add the current window as debuggee.
    this.#dbg = new Debugger();
    this.#dbg.onNewScript = this.#onNewScript;
    this.#dbg.onDebuggerStatement = this.#onDebuggerStatement;
    try {
      this.#dbg.addDebuggee(this.messageHandler.window);
    } catch {
      lazy.logger.error(
        "Failed to add window as debuggee for browsing context: " +
          this.messageHandler.contextId
      );
    }
  }

  #destroyDebugger() {
    if (!this.#dbg) {
      return;
    }

    // Remove all debuggees and resume.
    this.#dbg.removeAllDebuggees();
    while (this.#paused) {
      this._resume();
    }

    this.#dbg.onNewScript = undefined;
    this.#dbg.onDebuggerStatement = undefined;
    this.#dbg = null;

    for (const breakpointLocation of this.#breakpointLocationMap.values()) {
      breakpointLocation.liveBreakpoints.clear();
    }
  }

  #getFrameLocation(frame) {
    const { offset, script } = frame;
    const { columnNumber, lineNumber } = script.getOffsetMetadata(offset);
    return { column: columnNumber, line: lineNumber, url: script.url };
  }

  #hasMoved(frame) {
    const newLocation = this.#getFrameLocation(frame);

    if (!this.#previousPauseLocation) {
      return true;
    }

    const { line, column } = this.#previousPauseLocation;

    return line !== newLocation.line || column !== newLocation.column;
  }

  /**
   * Create a Debugger Handler/Callback that will not override `this`.
   * SpiderMonkey forces `this` to be set to the paused frame, the callback
   * wrapper will instead provide the frame as first argument.
   *
   * @param {Function} method
   *     The actual method used for the callback.
   * @param {object} params
   *     Additional fixed parameters which will be passed every time the wrapped
   *     callback is invoked
   *
   * @returns {Function}
   *     A wrapped method which can be consumed by SpiderMonkey as a Debugger
   *     Handler.
   */
  #makeFrameHookCallback(method, params) {
    return function () {
      const frame = this;
      return method(frame, params, ...arguments);
    };
  }

  #makeSteppingHooks({ steppingType, startFrame }) {
    return {
      onEnterFrame: this.#makeFrameHookCallback(this.#onFrameEnter, {}),
      onStep: this.#makeFrameHookCallback(this.#onFrameStep, {
        startFrame,
        steppingType,
      }),
      onPop: this.#makeFrameHookCallback(this.#onFramePop, {
        steppingType,
      }),
    };
  }

  /**
   * Debugger handler function.
   * See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
   * for signature and return value.
   */
  #onDebuggerStatement = frame => {
    return this.#pauseAtFrame(frame);
  };

  /**
   * Debugger handler function.
   * See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
   * for signature and return value.
   */
  #onFrameEnter = (frame, params, newFrame) => {
    // Clear the global onEnterFrame hook since we've entered a frame
    this.#dbg.onEnterFrame = undefined;

    // Clear hooks on the older frame since we entered a new frame
    if (newFrame.older) {
      newFrame.older.onStep = undefined;
      newFrame.older.onPop = undefined;
    }

    // Continue forward until we get to a valid step target using "next" mode
    const { onStep, onPop } = this.#makeSteppingHooks({
      steppingType: "next",
      startFrame: newFrame,
    });

    newFrame.onStep = onStep;
    newFrame.onPop = onPop;

    return undefined;
  };

  /**
   * Debugger handler function.
   * See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
   * for signature and return value.
   */
  #onFramePop = (frame, params) => {
    // If there's no older frame, execution will complete naturally
    if (!frame.older) {
      return undefined;
    }
    const { steppingType } = params;

    // For "finish" (step out), we need to handle two cases:
    // 1. If older frame has remaining code to execute, pause there
    // 2. If older frame is at the end (eval context finishing), let it complete
    if (steppingType === "finish") {
      // Check if we're at a position where we can pause
      const meta = frame.older.script.getOffsetMetadata(frame.older.offset);

      // If not at a breakpoint position or if we haven't moved from prior pause,
      // attach hooks to continue with "next" mode
      if (!meta.isBreakpoint || !this.#hasMoved(frame.older)) {
        const { onStep, onPop } = this.#makeSteppingHooks({
          steppingType: "next",
          startFrame: frame.older,
        });

        this.#dbg.onEnterFrame = undefined;
        frame.older.onStep = onStep;
        frame.older.onPop = onPop;
        return undefined;
      }

      // Otherwise pause immediately in the older frame
      return this.#pauseAtFrame(frame.older);
    }

    // For other stepping modes, pause when frame pops
    return this.#pauseAtFrame(frame.older);
  };

  /**
   * Debugger handler function.
   * See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
   * for signature and return value.
   */
  #onFrameStep = (frame, params) => {
    const { startFrame } = params;
    if (this.#validFrameStepOffset(frame, startFrame, frame.offset)) {
      return this.#pauseAtFrame(frame);
    }
    return undefined;
  };

  /**
   * Debugger handler function.
   * See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
   * for signature and return value.
   */
  #onNewScript = script => {
    // onNewScript only delivers top-level scripts, expand the tree to reach
    // inner function scripts.
    const scripts = this.#collectScriptTree(script);
    for (const breakpointLocation of this.#breakpointLocationMap.values()) {
      if (breakpointLocation.url === script.url) {
        this.#setBreakpointOnScripts(scripts, breakpointLocation);
      }
    }
  };

  /**
   * Debugger handler function.
   * See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
   * for signature and return value.
   */
  #pauseAtFrame = frame => {
    const { url, line, column } = this.#getFrameLocation(frame);
    const callFrames = this.#buildCallFrames(frame);
    const depthAtThisPause = this.#pausedFrames.length + 1;

    // Save the current pause location for hasMoved() checks
    this.#previousPauseLocation = { line, column };

    // Set the paused debugger environment on the message handler so other
    // modules can access it.
    this.messageHandler.debuggerEnvironment = {
      frame,
      global: this.#dbg.makeGlobalObjectReference(this.messageHandler.window),
    };

    this.emitEvent("moz:debugging.paused", {
      context: this.messageHandler.context,
      url,
      line,
      column,
      callFrames,
    });

    try {
      this.#pausedFrames.push(frame);
      Services.tm.spinEventLoopUntil("webdriver-bidi-debugging", () => {
        return this.#pausedFrames.length < depthAtThisPause;
      });
    } catch (e) {
      while (this.#pausedFrames.length >= depthAtThisPause) {
        this.#pausedFrames.pop();
      }
    }

    this.emitEvent("moz:debugging.resumed", {
      context: this.messageHandler.context,
    });

    if (this.#pausedFrames.length === 0) {
      this.messageHandler.debuggerEnvironment = null;
    } else {
      this.messageHandler.debuggerEnvironment = {
        frame: this.#pausedFrames[this.#pausedFrames.length - 1],
        global: this.#dbg.makeGlobalObjectReference(this.messageHandler.window),
      };
    }

    return undefined;
  };

  /**
   * Remove the live breakpoints corresponding to the provided BreakpointLocation.
   *
   * @param {BreakpointLocation} breakpointLocation
   *     The breakpoint location data for which live breakpoints should be
   *     removed.
   */
  #removeBreakpoint(breakpointLocation) {
    for (const {
      script,
      offset,
    } of breakpointLocation.liveBreakpoints.values()) {
      script.clearBreakpoint(this.#breakpointHandler, offset);
    }
    breakpointLocation.liveBreakpoints.clear();
  }

  #serializeVariable(value, realm) {
    if (value?.uninitialized) {
      return { type: "uninitialized" };
    }
    if (value?.missingArguments) {
      return { type: "missingArguments" };
    }
    if (value?.optimizedOut) {
      return { type: "optimizedOut" };
    }

    const rawValue = this.#toRawObject(value);
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
   * Set a live breakpoint for the provided BreakpointLocation on whichever of
   * the provided candidate scripts owns the breakpoint line.
   *
   * @param {Array<Debugger.Script>} scripts
   *     The candidate scripts to consider for the breakpoint.
   * @param {BreakpointLocation} breakpointLocation
   *     The breakpoint location describing where (line, column) the breakpoint
   *     should be added.
   */
  #setBreakpointOnScripts(scripts, breakpointLocation) {
    const { column, line, url } = breakpointLocation;

    const lineMatches = [];
    for (const candidate of scripts) {
      let offsets;
      try {
        offsets = candidate.getPossibleBreakpoints({ line });
      } catch (e) {
        // Accessing breakpoints of an optimized-out script can throw.
        continue;
      }
      for (const offsetMetadata of offsets) {
        lineMatches.push({ script: candidate, offsetMetadata });
      }
    }

    if (lineMatches.length === 0) {
      lazy.logger.warn(
        `Unable to set a breakpoint for url: ${url} at line: ${line}`
      );
      return;
    }

    let matches;
    if (column !== undefined) {
      matches = lineMatches.filter(
        ({ offsetMetadata }) => offsetMetadata.columnNumber === column
      );
      if (matches.length === 0) {
        lazy.logger.warn(
          `Unable to set a column breakpoint for url: ${url}, line: ${line} and column: ${column}.`
        );
        return;
      }
    } else {
      // Use the first breakpoint position on the line, keeping all scripts
      // which match that column (a source can have several scripts at the same
      // position after multiple evaluations).
      const firstColumn = Math.min(
        ...lineMatches.map(({ offsetMetadata }) => offsetMetadata.columnNumber)
      );
      matches = lineMatches.filter(
        ({ offsetMetadata }) => offsetMetadata.columnNumber === firstColumn
      );
    }

    for (const { script: matchingScript, offsetMetadata } of matches) {
      const { offset } = offsetMetadata;

      // Avoid registering a breakpoint twice on the same script and offset.
      let alreadySet = false;
      for (const bp of breakpointLocation.liveBreakpoints) {
        if (bp.script === matchingScript && bp.offset === offset) {
          alreadySet = true;
          break;
        }
      }
      if (alreadySet) {
        continue;
      }

      matchingScript.setBreakpoint(offset, this.#breakpointHandler);
      breakpointLocation.liveBreakpoints.add({
        script: matchingScript,
        offset,
      });
    }
  }

  #toRawObject(maybeDebuggerObject) {
    if (maybeDebuggerObject instanceof Debugger.Object) {
      const rawObject = maybeDebuggerObject.unsafeDereference();
      // Bug 2041412: This might lead to visible side effects on the content
      // page, needs more investigation.
      return Cu.waiveXrays(rawObject);
    }
    return maybeDebuggerObject;
  }

  #validFrameStepOffset(frame, startFrame, offset) {
    const meta = frame.script.getOffsetMetadata(offset);

    // Continue if:
    // 1. the location is not a valid breakpoint position
    // 2. we have not moved since the last pause
    if (!meta.isBreakpoint || !this.#hasMoved(frame)) {
      return false;
    }

    // Pause if:
    // 1. the frame has changed OR
    // 2. the location is a step position
    return frame !== startFrame || meta.isStepStart;
  }

  /**
   * Internal commands
   */

  _applySessionData(params) {
    const { category } = params;

    if (category === "debugging-enabled") {
      const isEnabled = !!this.#dbg;
      const shouldEnable = params.sessionData.some(item =>
        this.messageHandler.matchesContext(item.contextDescriptor)
      );

      if (shouldEnable && !isEnabled) {
        this.#createDebugger();

        // Check if any breakpoint needs to be set on the current scripts.
        for (const breakpointLocation of this.#breakpointLocationMap.values()) {
          const scripts = this.#dbg.findScripts({
            url: breakpointLocation.url,
          });
          this.#setBreakpointOnScripts(scripts, breakpointLocation);
        }
      } else if (!shouldEnable && isEnabled) {
        // Destroy the current debugger. This will clear live breakpoints and
        // resume paused frames.
        this.#destroyDebugger();
      }
    } else if (category === "breakpoint") {
      for (const { value } of params.sessionData) {
        const { id, column, line, url } = value;

        // If the unique breakpoint id is already stored in the map, the
        // corresponding location data is immutable so there is nothing to do.
        if (!this.#breakpointLocationMap.has(id)) {
          // Otherwise this is a new breakpoint, it needs to be stored and
          // applied to existing scripts if debugging is enabled.
          const breakpointLocation = {
            url,
            line,
            column,
            liveBreakpoints: new Set(),
          };
          this.#breakpointLocationMap.set(id, breakpointLocation);

          if (this.#dbg) {
            const scripts = this.#dbg.findScripts({ url });
            this.#setBreakpointOnScripts(scripts, breakpointLocation);
          }
        }
      }

      // Finally remove breakpoints which are in the local map, but no longer
      // listed in SessionData.
      for (const [id, breakpointLocation] of this.#breakpointLocationMap) {
        if (!params.sessionData.some(item => item.value.id === id)) {
          this.#breakpointLocationMap.delete(id);

          if (this.#dbg) {
            this.#removeBreakpoint(breakpointLocation);
          }
        }
      }
    }
  }

  _getScriptSource(params) {
    if (!this.#dbg) {
      throw new lazy.error.UnsupportedOperationError(
        "Debugger is not initialized. Use moz:debugging.enable first."
      );
    }

    const { scriptUrl } = params;
    const scripts = this.#dbg.findScripts({ url: scriptUrl });

    if (scripts.length === 0) {
      throw new lazy.error.InvalidArgumentError(
        `No script found with URL: ${scriptUrl}`
      );
    }

    const script = scripts[0];
    const source = script.source;

    if (!source || source.text === "[no source]") {
      throw new lazy.error.UnknownError(
        `Source text not available for script: ${scriptUrl}`
      );
    }

    return { source: source.text };
  }

  _listScripts() {
    if (!this.#dbg) {
      throw new lazy.error.UnsupportedOperationError(
        "Debugger is not initialized. Use moz:debugging.enable first."
      );
    }

    const urls = new Set();

    // Bug 2041407: garbage collected scripts will not be returned here.
    // They should be listed and resurrected.
    for (const { url } of this.#dbg.findScripts()) {
      if (url) {
        urls.add(url);
      }
    }

    return { scripts: [...urls] };
  }

  _resume() {
    if (this.#paused) {
      const debuggerEnvironment = this.messageHandler.debuggerEnvironment;
      if (debuggerEnvironment) {
        // Clear any stepping hooks
        debuggerEnvironment.frame.onStep = undefined;
        debuggerEnvironment.frame.onPop = undefined;
      }

      this.#dbg.onEnterFrame = undefined;

      this.#pausedFrames.pop();
    }
  }

  _stepInto() {
    if (this.#paused) {
      const debuggerEnvironment = this.messageHandler.debuggerEnvironment;
      if (debuggerEnvironment) {
        const { onEnterFrame, onStep, onPop } = this.#makeSteppingHooks({
          steppingType: "step",
          startFrame: debuggerEnvironment.frame,
        });

        // Attach onEnterFrame globally to catch function calls
        this.#dbg.onEnterFrame = onEnterFrame;

        // Attach onStep and onPop to current frame
        debuggerEnvironment.frame.onStep = onStep;
        debuggerEnvironment.frame.onPop = onPop;
      }

      this.#pausedFrames.pop();
    }
  }

  _stepOut() {
    if (this.#paused) {
      const debuggerEnvironment = this.messageHandler.debuggerEnvironment;
      if (debuggerEnvironment) {
        const { onPop } = this.#makeSteppingHooks({
          steppingType: "finish",
          startFrame: debuggerEnvironment.frame,
        });

        debuggerEnvironment.frame.onPop = onPop;
      }

      this.#pausedFrames.pop();
    }
  }

  _stepOver() {
    if (this.#paused) {
      const debuggerEnvironment = this.messageHandler.debuggerEnvironment;
      if (debuggerEnvironment) {
        const { onStep, onPop } = this.#makeSteppingHooks({
          steppingType: "next",
          startFrame: debuggerEnvironment.frame,
        });

        debuggerEnvironment.frame.onStep = onStep;
        debuggerEnvironment.frame.onPop = onPop;
      }

      this.#pausedFrames.pop();
    }
  }
}

export const debugging = DebuggingModule;
