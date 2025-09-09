/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * A connection between app-services tracing-support library and Firefox.
 *
 * Used by logging and other diagnostic support from app-services Rust components.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  // eslint-disable-next-line mozilla/use-console-createInstance
  Log: "resource://gre/modules/Log.sys.mjs",
});

import {
  registerEventSink,
  unregisterEventSink,
  EventSink,
  TracingLevel,
} from "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustTracing.sys.mjs";

ChromeUtils.defineLazyGetter(lazy, "console", () =>
  console.createInstance({
    prefix: "AppServices",
    // maxLogLevelPref: "toolkit.appservicestracing.loglevel"
  })
);

/** A singleton uniffi callback interface. */
class TracingEventHandler extends EventSink {
  static OBSERVER_NAME = "xpcom-will-shutdown";

  constructor() {
    super();
    this.registeredTargets = new Map();

    Services.obs.addObserver(this, TracingEventHandler.OBSERVER_NAME);
  }

  register(target, level, callback) {
    if (this.registeredTargets === null) {
      lazy.console.trace(
        "ignoring attempt to register event handler after shutdown has commenced"
      );
      return;
    }
    if (!this.registeredTargets.has(target)) {
      this.registeredTargets.set(target, { level, callbacks: [callback] });
      registerEventSink(target, level, this);
    } else {
      let { level: existingLevel, callbacks } =
        this.registeredTargets.get(target);
      callbacks.push(callback);
      // if the new verbosity is greater we must re-register.
      if (level > existingLevel) {
        lazy.console.trace("re-registering as new level more verbose");
        registerEventSink(target, level, this);
      }
    }
  }

  onEvent(event) {
    let target = targetRoot(event.target);
    let callbackRecord = this.registeredTargets.get(target);
    if (callbackRecord) {
      for (let callback of callbackRecord.callbacks) {
        try {
          callback(event);
        } catch (e) {
          lazy.console.error("tracing callback failed", callback, e);
        }
      }
    } else {
      lazy.console.error("event callback without a handler");
    }
  }

  observe(_aSubject, aTopic, _aData) {
    if (aTopic == TracingEventHandler.OBSERVER_NAME) {
      for (let target of this.registeredTargets.keys()) {
        unregisterEventSink(target);
      }
      this.registeredTargets = null;
    }
  }
}

// the singleton.
let tracingEventHandler = new TracingEventHandler();

// helper to get the pre '::' part of the target.
function targetRoot(target) {
  let colonIndex = target.indexOf(":");
  if (colonIndex > 0) {
    return target.slice(0, colonIndex);
  }
  return target;
}

/*
 * Log.sys.mjs adaptor.
 * Converts tracing log events to Log calls.
 */

// each target may go to one or more logs.
let targetToLogNames = new Map();

// handles a logging event we previously registered for.
function loggerEventHandler(event) {
  let target = targetRoot(event.target);
  for (const name of targetToLogNames.get(target) || []) {
    let log = lazy.Log.repository.getLogger(name);
    let log_level;
    if (event.level == TracingLevel.Debug) {
      log_level = lazy.Log.Level.Debug;
    } else if (event.level == TracingLevel.Info) {
      log_level = lazy.Log.Level.Info;
    } else if (event.level == TracingLevel.Warn) {
      log_level = lazy.Log.Level.Warn;
    } else {
      log_level = lazy.Log.Level.Error;
    }
    log.log(log_level, event.message);
  }
}

/**
 * send output from a target to a Log.sys.jsm logger.
 */
export function setupLoggerForTarget(target, log) {
  if (typeof log == "string") {
    log = lazy.Log.repository.getLogger(log);
  }
  let log_level = log.level;
  let tracing_level;
  if (log_level == lazy.Log.ERROR) {
    tracing_level = TracingLevel.ERROR;
  } else if (log_level == lazy.Log.WARN) {
    tracing_level = TracingLevel.WARN;
  } else if (log_level == lazy.Log.INFO) {
    tracing_level = TracingLevel.INFO;
  } else if (log_level == lazy.Log.DEBUG) {
    tracing_level = TracingLevel.DEBUG;
  } else {
    tracing_level = TracingLevel.TRACE;
  }
  targetToLogNames.set(target, log.name);
  tracingEventHandler.register(target, tracing_level, loggerEventHandler);
}
