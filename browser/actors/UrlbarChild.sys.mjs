/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  UrlbarPrefs: "moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs",
  UrlbarQueryContext:
    "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
});

// The content-side input/view methods a parent-side provider hook may invoke
// over the actor (see the `input`/`view` stand-ins on `UrlbarChildControllerProxy`).
// An allowlist, so an `InvokeContentAction` message can't reach arbitrary methods.
const INVOKABLE_CONTENT_ACTIONS = {
  input: new Set(["search", "setValue", "startQuery"]),
  view: new Set(["acknowledgeFeedback", "close", "startTail150"]),
};

/**
 * @import {UrlbarParent} from "./UrlbarParent.sys.mjs"
 * @import {UrlbarParentController} from "moz-src:///browser/components/urlbar/UrlbarParentController.sys.mjs"
 * @import {UrlbarChildController} from "chrome://browser/content/urlbar/UrlbarChildController.mjs"
 */

/**
 * Child-process counterpart of `UrlbarParent`. `UrlbarChildController` builds its
 * own parent controller; this actor tells the two transports apart
 * (`usesMessagePath`) and runs the message-path lifecycle.
 *
 * - Direct path (default for chrome `<moz-urlbar>`): both actors live in the
 *   parent process, so the child builds a real `UrlbarParentController` in place
 *   and invokes it synchronously.
 * - Message path: a content-process `<moz-urlbar>` (e.g. about:newtab), or
 *   chrome when `browser.urlbar.ipc.chromeMessagePassing` is set (so the message
 *   path runs in CI). The child builds a `UrlbarParentControllerProxy` that
 *   trades messages with the parent-side controller, identified by an
 *   `instanceId` this actor allocates. The parent's `Notify` messages are
 *   dispatched back to the paired child controller, held weakly (keyed by
 *   `instanceId`) so as not to pin its input.
 *
 * On the message path the parent retains its controller strongly (keyed by
 * `instanceId`), so we tie its lifetime to the input: the input is registered in
 * a `FinalizationRegistry` that sends `Destroy(instanceId)` when the input is
 * collected, letting the parent drop its entry.
 */
export class UrlbarChild extends JSWindowActorChild {
  #nextInstanceId = 0;

  /** @type {Map<number, WeakRef<UrlbarChildController>>} */
  #childControllers = new Map();

  // Sends `Destroy(instanceId)` to the parent once a message-path input is
  // collected, so the parent can drop the controller it holds for it.
  #destroyRegistry = new FinalizationRegistry(instanceId => {
    this.#childControllers.delete(instanceId);
    try {
      this.sendAsyncMessage("Destroy", { instanceId });
    } catch (ex) {
      // The actor is already gone (e.g. the window global was torn down), so
      // the parent's controllers went with it; nothing left to clean up.
    }
  });

  /**
   * Whether this `<moz-urlbar>` uses the actor message path -- a content-process
   * input (no in-process parent global), or chrome with
   * `browser.urlbar.ipc.chromeMessagePassing` -- rather than the in-process
   * direct path. `UrlbarChildController` keys its controller construction on
   * this: direct builds a real `UrlbarParentController` in place, message builds
   * a `UrlbarParentControllerProxy`.
   *
   * @type {boolean}
   */
  get usesMessagePath() {
    return (
      !this.manager.parentActor ||
      lazy.UrlbarPrefs.get("ipc.chromeMessagePassing")
    );
  }

  /**
   * Registers a message-path `<moz-urlbar>` input for teardown -- so the parent
   * drops the controller once the input is collected -- and returns the instance
   * id the child controller pairs with the proxy it builds.
   *
   * @param {object} input
   *   The `UrlbarInput`/`SmartbarInput` that owns the child controller.
   * @returns {number} The instance id to construct the proxy with.
   */
  registerMessagePathInput(input) {
    let instanceId = ++this.#nextInstanceId;
    this.#destroyRegistry.register(input, instanceId);
    return instanceId;
  }

  /**
   * Records the message-path child controller for an instance so the parent's
   * `Notify` messages can be dispatched to it. Held weakly so it (and its
   * input) stay collectable.
   *
   * @param {number} instanceId
   *   The instance the controller was created for.
   * @param {UrlbarChildController} child
   *   The paired child controller.
   */
  registerChildController(instanceId, child) {
    this.#childControllers.set(instanceId, new WeakRef(child));
  }

  receiveMessage(message) {
    switch (message.name) {
      case "Notify":
        this.#receiveNotify(message.data);
        break;
      case "InvokeContentAction":
        this.#invokeContentAction(message.data);
        break;
    }
  }

  /**
   * Dispatches a parent-side `notify()` to the paired child controller.
   *
   * @param {object} data The `Notify` message data.
   * @param {number} data.instanceId The instance whose child controller to notify.
   * @param {string} data.name The notification (listener method) name.
   * @param {any[]} data.params The notification arguments.
   */
  #receiveNotify({ instanceId, name, params }) {
    let child = this.#childControllers.get(instanceId)?.deref();
    if (!child) {
      this.#childControllers.delete(instanceId);
      return;
    }
    let deserialized = params.map(param =>
      param?.serializedQueryContext
        ? lazy.UrlbarQueryContext.fromWire(param.serializedQueryContext)
        : param
    );
    // The parent ran the query but the input lives here, so let it react to the
    // first result (search mode, autofill) before the results are shown. If it
    // takes over (returns true), the results are stale; don't dispatch them.
    if (name == "onQueryResults") {
      let queryContext = deserialized[0];
      if (
        queryContext.firstResultChanged &&
        child.input.onFirstResult(queryContext.results[0])
      ) {
        return;
      }
    }
    child.notify(name, ...deserialized);
  }

  /**
   * Invokes an allowed input/view method a parent-side provider hook
   * requested (e.g. `view.close()`, `input.startQuery()`), on the real
   * content-side objects.
   *
   * @param {object} data The `InvokeContentAction` message data.
   * @param {number} data.instanceId The instance whose input/view to act on.
   * @param {"input"|"view"} data.target Which content object to invoke on.
   * @param {string} data.method The allowed method to call.
   * @param {any[]} data.args The method arguments.
   */
  #invokeContentAction({ instanceId, target, method, args }) {
    let child = this.#childControllers.get(instanceId)?.deref();
    if (!child) {
      this.#childControllers.delete(instanceId);
      return;
    }
    if (!INVOKABLE_CONTENT_ACTIONS[target]?.has(method)) {
      console.error(`Urlbar: disallowed content action ${target}.${method}`);
      return;
    }
    child[target]?.[method](...args);
  }
}
