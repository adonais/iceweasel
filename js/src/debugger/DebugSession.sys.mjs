/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Debug session API built on top of the Debugger API.
 *
 * Implements breakpoints by source location, pausing and stepping for a single
 * debuggee global. Everything that depends on the embedding must be provided by
 * the host object passed to the constructor:
 *
 *   createDebugger()            Returns a new Debugger instance.
 *   waitWhilePaused(isResumed)  Blocks until isResumed() returns true, e.g. by
 *                               spinning a nested event loop.
 *   serializeValue(value)       Serializes a debuggee value (a Debugger.Object
 *                               or a primitive) for frame scope chains.
 *   serializeUnavailableVariable(kind)
 *                               Serializes a scope variable without a value.
 *                               `kind` is "uninitialized", "missingArguments"
 *                               or "optimizedOut".
 *   setDebuggerEnvironment(env) Called with {frame, global} for the innermost
 *                               pause, or null once no pause is active.
 *   onPaused(pauseInfo)         Called when a pause starts, with the location
 *                               and the call frames of the pause.
 *   onResumed()                 Called when a pause ends.
 *   log                         Optional object with warn(msg) and error(msg).
 *   createError(kind, message)  Returns the error to throw for an invalid use of
 *                               the session. `kind` is "not-enabled",
 *                               "invalid-argument" or "unknown".
 *
 * This file is shared by WebDriver BiDi and the JS shell, so it must not use
 * any Gecko-specific APIs or JS shell testing functions.
 */

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

/**
 * A debug session for a single debuggee global, see the comment at the top of
 * this file.
 */
export class DebugSession {
  #breakpointHandler;
  #breakpointLocationMap;
  #dbg;
  #global;
  #host;
  #pausedFrames;
  #previousPauseLocation;
  #pauseOnExceptions;

  /**
   * @param {object} global
   *     The debuggee global.
   * @param {object} host
   *     The embedding hooks, see the comment at the top of this file.
   */
  constructor(global, host) {
    this.#global = global;
    this.#host = host;

    // Map of breakpoint id to BreakpointLocation with an additional
    // "liveBreakpoints" property which is a set of LiveBreakpoint, initially
    // empty.
    this.#breakpointLocationMap = new Map();

    // State flags.
    this.#pausedFrames = [];

    this.#dbg = null;
    this.#previousPauseLocation = null;

    // "none", "uncaught" or "all".
    this.#pauseOnExceptions = "none";

    this.#breakpointHandler = {
      hit: this.#pauseAtFrame,
    };
  }

  get enabled() {
    return !!this.#dbg;
  }

  get paused() {
    return !!this.#pausedFrames.length;
  }

  destroy() {
    this.disable();
    this.#breakpointHandler = null;
    this.#breakpointLocationMap = null;
  }

  /**
   * Create the Debugger and apply the known breakpoints to the existing
   * scripts.
   *
   * @returns {boolean}
   *     False if the global couldn't be added as debuggee.
   */
  enable() {
    if (this.#dbg) {
      return true;
    }

    this.#dbg = this.#host.createDebugger();
    this.#dbg.onNewScript = this.#onNewScript;
    this.#dbg.onDebuggerStatement = this.#onDebuggerStatement;
    this.#updateExceptionHook();
    let added = true;
    try {
      this.#dbg.addDebuggee(this.#global);
    } catch {
      added = false;
    }

    // Check if any breakpoint needs to be set on the current scripts.
    for (const breakpointLocation of this.#breakpointLocationMap.values()) {
      const scripts = this.#dbg.findScripts({ url: breakpointLocation.url });
      this.#setBreakpointOnScripts(scripts, breakpointLocation);
    }

    return added;
  }

  /**
   * Destroy the Debugger. This clears live breakpoints and resumes paused
   * frames.
   */
  disable() {
    if (!this.#dbg) {
      return;
    }

    this.#dbg.removeAllDebuggees();
    while (this.paused) {
      this.resume();
    }

    this.#dbg.onNewScript = undefined;
    this.#dbg.onDebuggerStatement = undefined;
    this.#dbg.onExceptionUnwind = undefined;
    this.#dbg = null;

    for (const breakpointLocation of this.#breakpointLocationMap.values()) {
      breakpointLocation.liveBreakpoints.clear();
    }
  }

  /**
   * Replace the set of breakpoints. Breakpoints are identified by their id
   * and their location can't change.
   *
   * @param {Array<object>} breakpoints
   *     List of {id, url, line, column}, column being optional.
   */
  setBreakpoints(breakpoints) {
    for (const { id, column, line, url } of breakpoints) {
      // If the unique breakpoint id is already stored in the map, the
      // corresponding location data is immutable so there is nothing to do.
      if (this.#breakpointLocationMap.has(id)) {
        continue;
      }

      // Otherwise this is a new breakpoint, it needs to be stored and applied
      // to existing scripts if debugging is enabled.
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

    // Finally remove breakpoints which are in the local map, but no longer
    // listed in the provided breakpoints.
    for (const [id, breakpointLocation] of this.#breakpointLocationMap) {
      if (!breakpoints.some(bp => bp.id === id)) {
        this.#breakpointLocationMap.delete(id);

        if (this.#dbg) {
          this.#removeBreakpoint(breakpointLocation);
        }
      }
    }
  }

  /**
   * Set whether to pause when an exception is thrown. An exception pauses in
   * every frame it unwinds through.
   *
   * @param {string} mode
   *     "none", "uncaught" (only exceptions that no try block in the debuggee
   *     frames on the stack will catch) or "all".
   */
  setPauseOnExceptions(mode) {
    if (!["none", "uncaught", "all"].includes(mode)) {
      throw this.#host.createError(
        "invalid-argument",
        `Invalid pause on exceptions mode: ${mode}`
      );
    }
    this.#pauseOnExceptions = mode;
    this.#updateExceptionHook();
  }

  getScriptSource(scriptUrl) {
    this.#assertEnabled();

    const scripts = this.#dbg.findScripts({ url: scriptUrl });
    if (scripts.length === 0) {
      throw this.#host.createError(
        "invalid-argument",
        `No script found with URL: ${scriptUrl}`
      );
    }

    const source = scripts[0].source;
    if (!source || source.text === "[no source]") {
      throw this.#host.createError(
        "unknown",
        `Source text not available for script: ${scriptUrl}`
      );
    }

    return source.text;
  }

  listScripts() {
    this.#assertEnabled();

    const urls = new Set();

    // Bug 2041407: garbage collected scripts will not be returned here.
    // They should be listed and resurrected.
    for (const script of this.#dbg.findScripts()) {
      const url = this.#getScriptURL(script);
      if (url) {
        urls.add(url);
      }
    }

    return [...urls];
  }

  resume() {
    if (!this.paused) {
      return;
    }

    const frame = this.#currentPausedFrame();
    frame.onStep = undefined;
    frame.onPop = undefined;
    this.#dbg.onEnterFrame = undefined;

    this.#pausedFrames.pop();
  }

  stepInto() {
    if (!this.paused) {
      return;
    }

    const frame = this.#currentPausedFrame();
    const { onEnterFrame, onStep, onPop } = this.#makeSteppingHooks({
      steppingType: "step",
      startFrame: frame,
    });

    // Attach onEnterFrame globally to catch function calls
    this.#dbg.onEnterFrame = onEnterFrame;

    // Attach onStep and onPop to current frame
    frame.onStep = onStep;
    frame.onPop = onPop;

    this.#pausedFrames.pop();
  }

  stepOut() {
    if (!this.paused) {
      return;
    }

    const frame = this.#currentPausedFrame();
    const { onPop } = this.#makeSteppingHooks({
      steppingType: "finish",
      startFrame: frame,
    });
    frame.onPop = onPop;

    this.#pausedFrames.pop();
  }

  stepOver() {
    if (!this.paused) {
      return;
    }

    const frame = this.#currentPausedFrame();
    const { onStep, onPop } = this.#makeSteppingHooks({
      steppingType: "next",
      startFrame: frame,
    });
    frame.onStep = onStep;
    frame.onPop = onPop;

    this.#pausedFrames.pop();
  }

  #assertEnabled() {
    if (!this.#dbg) {
      throw this.#host.createError(
        "not-enabled",
        "The debug session isn't enabled."
      );
    }
  }

  #buildScopeChain(frame) {
    const scopeChain = [];

    let env = frame.environment;
    while (env) {
      if (env.type === "declarative" && env.scopeKind != null) {
        const scope = {
          type: env.scopeKind,
          variables: Object.create(null),
        };

        const names = env.names();
        for (const name of names) {
          try {
            const value = env.getVariable(name);
            scope.variables[name] = this.#serializeVariable(value);
          } catch (e) {
            this.#host.log?.error(
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

  #currentPausedFrame() {
    return this.#pausedFrames[this.#pausedFrames.length - 1];
  }

  #getScriptURL(script) {
    // Debugger.Script.prototype.url only supports JS scripts.
    return script.format === "wasm" ? script.source.url : script.url;
  }

  #getFrameLocation(frame) {
    const { offset, script } = frame;
    const { columnNumber, lineNumber } = script.getOffsetMetadata(offset);
    return {
      column: columnNumber,
      line: lineNumber,
      url: this.#getScriptURL(script),
    };
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

  #updateExceptionHook() {
    if (this.#dbg) {
      this.#dbg.onExceptionUnwind =
        this.#pauseOnExceptions === "none"
          ? undefined
          : this.#onExceptionUnwind;
    }
  }

  #isCaught(frame) {
    for (let f = frame; f; f = f.older) {
      try {
        if (f.script.isInCatchScope(f.offset)) {
          return true;
        }
      } catch (e) {
        // Wasm frames don't support isInCatchScope.
      }
    }
    return false;
  }

  // Debugger handler function.
  // See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
  // for signature and return value.
  #onExceptionUnwind = (frame, value) => {
    // Don't pause for exceptions thrown by code evaluated during a pause.
    if (this.paused) {
      return undefined;
    }

    if (this.#pauseOnExceptions === "uncaught" && this.#isCaught(frame)) {
      return undefined;
    }

    return this.#pauseAtFrame(frame, {
      exception: this.#serializeVariable(value),
    });
  };

  // Debugger handler function.
  // See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
  // for signature and return value.
  #onDebuggerStatement = frame => {
    return this.#pauseAtFrame(frame);
  };

  // Debugger handler function.
  // See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
  // for signature and return value.
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

  // Debugger handler function.
  // See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
  // for signature and return value.
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

  // Debugger handler function.
  // See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
  // for signature and return value.
  #onFrameStep = (frame, params) => {
    const { startFrame } = params;
    if (this.#validFrameStepOffset(frame, startFrame, frame.offset)) {
      return this.#pauseAtFrame(frame);
    }
    return undefined;
  };

  // Debugger handler function.
  // See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
  // for signature and return value.
  #onNewScript = script => {
    // onNewScript only delivers top-level scripts, expand the tree to reach
    // inner function scripts.
    const scripts = this.#collectScriptTree(script);
    for (const breakpointLocation of this.#breakpointLocationMap.values()) {
      if (breakpointLocation.url === this.#getScriptURL(script)) {
        this.#setBreakpointOnScripts(scripts, breakpointLocation);
      }
    }
  };

  // Debugger handler function.
  // See https://firefox-source-docs.mozilla.org/devtools-user/debugger-api/debugger/index.html#debugger-handler-functions
  // for signature and return value.
  #pauseAtFrame = (frame, details = {}) => {
    const { url, line, column } = this.#getFrameLocation(frame);
    const callFrames = this.#buildCallFrames(frame);
    const depthAtThisPause = this.#pausedFrames.length + 1;

    // Save the current pause location for hasMoved() checks
    this.#previousPauseLocation = { line, column };

    // Set the paused debugger environment on the host so other code can access
    // it.
    this.#host.setDebuggerEnvironment({
      frame,
      global: this.#dbg.makeGlobalObjectReference(this.#global),
    });

    this.#host.onPaused({ url, line, column, callFrames, ...details });

    try {
      this.#pausedFrames.push(frame);
      this.#host.waitWhilePaused(() => {
        return this.#pausedFrames.length < depthAtThisPause;
      });
    } catch (e) {
      while (this.#pausedFrames.length >= depthAtThisPause) {
        this.#pausedFrames.pop();
      }
    }

    this.#host.onResumed();

    if (this.#pausedFrames.length === 0) {
      this.#host.setDebuggerEnvironment(null);
    } else {
      this.#host.setDebuggerEnvironment({
        frame: this.#currentPausedFrame(),
        global: this.#dbg.makeGlobalObjectReference(this.#global),
      });
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

  #serializeVariable(value) {
    if (value?.uninitialized) {
      return this.#host.serializeUnavailableVariable("uninitialized");
    }
    if (value?.missingArguments) {
      return this.#host.serializeUnavailableVariable("missingArguments");
    }
    if (value?.optimizedOut) {
      return this.#host.serializeUnavailableVariable("optimizedOut");
    }

    return this.#host.serializeValue(value);
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
      this.#host.log?.warn(
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
        this.#host.log?.warn(
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
}
