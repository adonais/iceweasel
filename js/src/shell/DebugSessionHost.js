/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * JS shell host for the DebugSession module in DebugSession.sys.mjs.
 * See the SMDOC comment in DebugSession.cpp.
 *
 * This script evaluates to a function that takes the module namespace and
 * returns the entry points called by the natives:
 *
 *   create(debuggee)        Create the debug session. There can only be one
 *                           at a time.
 *   command(name, argJSON)  Commands of the session. Not allowed while it is
 *                           paused.
 */

(function (ns) {
  "use strict";

  const { DebugSession } = ns;
  const ACTIONS = ["resume", "stepInto", "stepOut", "stepOver"];

  // The state of the current session, or null.
  let current = null;

  /**
   * Errors reported to the natives as {error}.
   */
  class HostError extends Error {}

  function serializeValue(value) {
    if (value instanceof Debugger.Object) {
      return { type: "object", class: value.class };
    }
    switch (typeof value) {
      case "undefined":
        return { type: "undefined" };
      case "boolean":
      case "string":
        return { type: typeof value, value };
      case "number":
        if (!Number.isFinite(value) || Object.is(value, -0)) {
          return { type: "number", value: String(value) };
        }
        return { type: "number", value };
      case "bigint":
        return { type: "bigint", value: String(value) };
      case "symbol":
        return { type: "symbol", description: value.description ?? null };
    }
    if (value === null) {
      return { type: "null" };
    }
    return { type: "unknown" };
  }

  function checkBreakpoints(arg) {
    if (!Array.isArray(arg)) {
      throw new HostError("setBreakpoints expects an array");
    }
    const breakpoints = [];
    for (const bp of arg) {
      if (typeof bp !== "object" || bp === null) {
        throw new HostError("breakpoint must be an object");
      }
      const { id, url, line, column } = bp;
      if (typeof id !== "string" && typeof id !== "number") {
        throw new HostError("breakpoint id must be a string or number");
      }
      if (typeof url !== "string") {
        throw new HostError("breakpoint url must be a string");
      }
      if (!Number.isInteger(line) || line < 1) {
        throw new HostError("breakpoint line must be a positive integer");
      }
      if (column !== undefined && (!Number.isInteger(column) || column < 1)) {
        throw new HostError("breakpoint column must be a positive integer");
      }
      breakpoints.push({ id: String(id), url, line, column });
    }
    return breakpoints;
  }

  function checkActions(arg) {
    if (!Array.isArray(arg)) {
      throw new HostError("setPauseActions expects an array");
    }
    const actions = [];
    for (const action of arg) {
      if (typeof action === "string") {
        if (!ACTIONS.includes(action)) {
          throw new HostError("unknown pause action: " + action);
        }
        actions.push(action);
        continue;
      }
      if (typeof action !== "object" || action === null) {
        throw new HostError("pause action must be a string or an object");
      }
      const { evaluate: expression, frame = 0 } = action;
      if (typeof expression !== "string") {
        throw new HostError("evaluate action expects an expression string");
      }
      if (!Number.isInteger(frame) || frame < 0) {
        throw new HostError("frame index must be a non-negative integer");
      }
      actions.push({ evaluate: expression, frame });
    }
    return actions;
  }

  function evaluate(entry, expression, frameIndex) {
    let frame = entry.environment?.frame;
    for (let i = 0; frame && i < frameIndex; i++) {
      frame = frame.older;
    }
    if (!frame) {
      return { error: "no frame with index " + frameIndex };
    }
    const completion = frame.eval(expression);
    if (!completion) {
      return { terminated: true };
    }
    if ("throw" in completion) {
      return { throw: serializeValue(completion.throw) };
    }
    return { return: serializeValue(completion.return) };
  }

  // Run the pause actions of |entry| until a resume or step action, and return
  // that action.
  function runPauseActions(entry) {
    while (entry.actions.length) {
      const action = entry.actions.shift();
      if (typeof action === "string") {
        return action;
      }
      const { evaluate: expression, frame } = action;
      const logEntry = { type: "evaluate", expression, frame, result: null };
      entry.log.push(logEntry);
      logEntry.result = evaluate(entry, expression, frame);
    }
    return "resume";
  }

  function create(debuggee) {
    if (current) {
      throw new HostError("a debug session already exists");
    }
    const entry = {
      actions: [],
      environment: null,
      log: [],
      pausedInfo: null,
      session: null,
    };

    entry.session = new DebugSession(debuggee, {
      createDebugger: () => new Debugger(),
      waitWhilePaused() {
        const logEntry = { type: "paused", ...entry.pausedInfo, action: null };
        entry.log.push(logEntry);

        const action = runPauseActions(entry);
        logEntry.action = action;
        entry.session[action]();
      },
      serializeValue,
      serializeUnavailableVariable(kind) {
        return { type: kind };
      },
      createError(kind, message) {
        return new HostError(kind + ": " + message);
      },
      setDebuggerEnvironment(environment) {
        entry.environment = environment;
      },
      onPaused(info) {
        entry.pausedInfo = info;
      },
      onResumed() {
        entry.pausedInfo = null;
        entry.log.push({ type: "resumed" });
      },
    });

    current = entry;
  }

  function command(name, arg) {
    const entry = current;
    if (!entry) {
      throw new HostError("no debug session");
    }
    const { session } = entry;
    // Evaluated debuggee code must not change the session during a pause.
    if (session.paused) {
      throw new HostError(name + " is not allowed while the session is paused");
    }
    switch (name) {
      case "enable":
        if (!session.enable()) {
          session.disable();
          throw new HostError("can't debug this global");
        }
        return undefined;
      case "disable":
        session.disable();
        return undefined;
      case "destroy":
        current = null;
        session.destroy();
        return undefined;
      case "setBreakpoints":
        session.setBreakpoints(checkBreakpoints(arg));
        return undefined;
      case "setPauseOnExceptions":
        if (typeof arg !== "string") {
          throw new HostError("setPauseOnExceptions expects a mode string");
        }
        session.setPauseOnExceptions(arg);
        return undefined;
      case "setPauseActions":
        entry.actions = checkActions(arg);
        return undefined;
      case "listScripts":
        return session.listScripts();
      case "getScriptSource":
        if (typeof arg !== "string") {
          throw new HostError("getScriptSource expects a URL string");
        }
        return session.getScriptSource(arg);
      case "takeLog": {
        const log = entry.log;
        entry.log = [];
        return log;
      }
    }
    throw new HostError("unknown command: " + name);
  }

  function errorMessage(e) {
    if (e instanceof Error) {
      return e.message;
    }
    return "unknown error";
  }

  // The entry points only return JSON strings. Arguments arrive as JSON strings
  // and errors are reported as {error} instead of throwing objects of this
  // global.
  return {
    create(debuggee) {
      try {
        create(debuggee);
        return JSON.stringify({ result: undefined });
      } catch (e) {
        return JSON.stringify({ error: errorMessage(e) });
      }
    },
    command(name, argJSON) {
      try {
        const arg = argJSON === undefined ? undefined : JSON.parse(argJSON);
        return JSON.stringify({ result: command(name, arg) });
      } catch (e) {
        return JSON.stringify({ error: errorMessage(e) });
      }
    },
  };
});
