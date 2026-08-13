/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  UrlbarParentController:
    "moz-src:///browser/components/urlbar/UrlbarParentController.sys.mjs",
  UrlbarQueryContext:
    "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
  UrlbarResult: "chrome://browser/content/urlbar/UrlbarResult.mjs",
});

/**
 * @import {UrlbarParentController} from "moz-src:///browser/components/urlbar/UrlbarParentController.sys.mjs"
 */

/**
 * Parent-process endpoint of the `UrlbarChild` actor pair, for the message path.
 * A content-side `UrlbarChildController` (content-process `<moz-urlbar>`, or
 * chrome with `browser.urlbar.ipc.chromeMessagePassing`) holds a
 * `UrlbarParentControllerProxy` and trades actor messages with us: we build the
 * `UrlbarParentController` from the `Init` payload and retain it in a `Map` keyed
 * by the child-assigned `instanceId`, routing subsequent messages to it. The
 * controller's notifications go back to the child as `Notify` messages
 * (dispatched through a parent-side `UrlbarChildControllerProxy` stand-in). The
 * controller is dropped on the `Destroy` message the child sends when its input
 * is collected (via a `FinalizationRegistry`).
 *
 * The direct path (in-process chrome `<moz-urlbar>`) doesn't go through this
 * actor at all: `UrlbarChildController` builds its `UrlbarParentController` in
 * place, since both live in the same process.
 */
export class UrlbarParent extends JSWindowActorParent {
  /** @type {Map<number, UrlbarParentController>} */
  #messageControllers = new Map();

  /**
   * Message path: routes child->parent messages to the controller identified
   * by `instanceId`, deserializing their payloads.
   *
   * @param {object} message
   *   The actor message, with `name` and `data`.
   */
  receiveMessage(message) {
    let { instanceId } = message.data;

    if (message.name == "Init") {
      let { sapName, isPrivate } = message.data;
      let controller = new lazy.UrlbarParentController({
        sapName,
        isPrivate,
        actor: this,
      });
      // The real child controller lives across the boundary, so hand the
      // parent controller a proxy that forwards its notifications over the
      // actor.
      controller.setChild(new UrlbarChildControllerProxy(this, instanceId));
      this.#messageControllers.set(instanceId, controller);
      return undefined;
    }

    if (message.name == "Destroy") {
      this.#messageControllers.delete(instanceId);
      return undefined;
    }

    let controller = this.#messageControllers.get(instanceId);
    if (!controller) {
      return undefined;
    }

    switch (message.name) {
      case "GetViewUpdate":
        return controller.getViewUpdate(
          lazy.UrlbarResult.fromWire(message.data.result),
          message.data.idsByName
        );
      case "GetHeuristicResult":
        return controller
          .getHeuristicResult(
            lazy.UrlbarQueryContext.fromWire(message.data.queryContext)
          )
          .then(result => result?.toWire() ?? null);
      case "RecordEngagement":
        controller.recordEngagement(message.data.wire);
        break;
      case "ResetEngagement":
        controller.resetEngagement();
        break;
      case "HandleBounceTrigger":
        controller.handleBounceTrigger(message.data.payload);
        break;
      case "TrackBounceBrowser":
        controller.trackBounceBrowser(message.data.browserId);
        break;
      case "StartQuery":
        // Round-trips so the proxy's startQuery resolves at true completion with
        // the finished context. The context's results keep their data in private
        // fields, so reduce it to wire form like the QUERY_RESULTS notifications.
        return controller
          .startQuery(
            lazy.UrlbarQueryContext.fromWire(message.data.queryContext)
          )
          .then(context => context.toWire());
      case "CancelQuery":
        controller.cancelQuery();
        break;
      case "SpeculativeConnect":
        controller.speculativeConnect(
          lazy.UrlbarResult.fromWire(message.data.result),
          lazy.UrlbarQueryContext.fromWire(message.data.queryContext),
          message.data.reason
        );
        break;
      case "RemoveResult":
        controller.removeResult(
          lazy.UrlbarResult.fromWire(message.data.result),
          message.data.options
        );
        break;
      case "SetLastQueryContextCache":
        controller.setLastQueryContextCache(
          lazy.UrlbarQueryContext.fromWire(message.data.queryContext)
        );
        break;
      case "ClearLastQueryContextCache":
        controller.clearLastQueryContextCache();
        break;
      // onBeforeSelection/onSelection drop their second argument (the selected
      // DOM element), which can't cross the boundary. Only
      // UrlbarProviderQuickSuggestContextualOptIn reads it, and it isn't active
      // on the message path. Bug 2052166 removes the parameter with that
      // provider.
      case "OnBeforeSelection":
        controller.onBeforeSelection(
          lazy.UrlbarResult.fromWire(message.data.result)
        );
        break;
      case "OnSelection":
        controller.onSelection(lazy.UrlbarResult.fromWire(message.data.result));
        break;
    }
    return undefined;
  }
}

/**
 * Parent-side stand-in for the `UrlbarChildController`, mirroring
 * `UrlbarParentControllerProxy` on the content side. The parent controller
 * calls `notify()` here, and we forward each notification to the real child
 * controller across the boundary as a `Notify` message, serializing any
 * `UrlbarQueryContext` argument.
 */
class UrlbarChildControllerProxy {
  /** @type {UrlbarParent} */
  #actor;

  /** @type {number} */
  #instanceId;

  constructor(actor, instanceId) {
    this.#actor = actor;
    this.#instanceId = instanceId;
  }

  notify(name, ...params) {
    this.#actor.sendAsyncMessage("Notify", {
      instanceId: this.#instanceId,
      name,
      params: params.map(param =>
        param instanceof lazy.UrlbarQueryContext
          ? { serializedQueryContext: param.toWire() }
          : param
      ),
    });
  }

  get input() {
    return new InputProxy(this.#actor, this.#instanceId);
  }

  get view() {
    return new ViewProxy(this.#actor, this.#instanceId);
  }
}

/**
 * Parent-side stand-in for the content `UrlbarView` a provider engagement hook
 * reaches through `controller.view` on the message path. Each method forwards
 * to the real view as an `InvokeContentAction` message; the content side runs
 * the genuine method (so its normal notifications fire once, no loops).
 */
class ViewProxy {
  /** @type {UrlbarParent} */
  #actor;

  /** @type {number} */
  #instanceId;

  constructor(actor, instanceId) {
    this.#actor = actor;
    this.#instanceId = instanceId;
  }

  #invoke(method, args) {
    this.#actor.sendAsyncMessage("InvokeContentAction", {
      instanceId: this.#instanceId,
      target: "view",
      method,
      args,
    });
  }

  acknowledgeFeedback(result) {
    this.#invoke("acknowledgeFeedback", [result.toWire()]);
  }

  close() {
    this.#invoke("close", []);
  }

  startTail150() {
    this.#invoke("startTail150", []);
  }
}

/**
 * Parent-side stand-in for the content `UrlbarInput` a provider engagement hook
 * reaches through `controller.input` on the message path. See `ViewProxy`; args
 * must be structured-cloneable (search strings, plain option objects).
 */
class InputProxy {
  /** @type {UrlbarParent} */
  #actor;

  /** @type {number} */
  #instanceId;

  constructor(actor, instanceId) {
    this.#actor = actor;
    this.#instanceId = instanceId;
  }

  #invoke(method, args) {
    this.#actor.sendAsyncMessage("InvokeContentAction", {
      instanceId: this.#instanceId,
      target: "input",
      method,
      args,
    });
  }

  search(value, options) {
    this.#invoke("search", [value, options]);
  }

  setValue(value) {
    this.#invoke("setValue", [value]);
  }

  startQuery(options) {
    this.#invoke("startQuery", [options]);
  }

  get view() {
    return new ViewProxy(this.#actor, this.#instanceId);
  }
}
