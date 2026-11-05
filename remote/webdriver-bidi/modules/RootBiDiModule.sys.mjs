/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

import { Module } from "chrome://remote/content/shared/messagehandler/Module.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  assert: "chrome://remote/content/shared/webdriver/Assert.sys.mjs",
  error: "chrome://remote/content/shared/webdriver/Errors.sys.mjs",
  getWebDriverSessionByInternalSessionId:
    "chrome://remote/content/shared/webdriver/Session.sys.mjs",
  isPrivilegedContext:
    "chrome://remote/content/shared/BrowsingContextUtils.sys.mjs",
  NavigableManager: "chrome://remote/content/shared/NavigableManager.sys.mjs",
  UserContextManager:
    "chrome://remote/content/shared/UserContextManager.sys.mjs",
  WindowGlobalMessageHandler:
    "chrome://remote/content/shared/messagehandler/WindowGlobalMessageHandler.sys.mjs",
});

// Hidden pref, until the restriction is tested enough to always enable it.
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "containerIsolationEnabled",
  "remote.experimental.dynamicstart.container-isolation-enabled",
  false
);

export class RootBiDiModule extends Module {
  /**
   * Check if the current WebDriver BiDi session owning the RootBiDiModule is
   * restricted to a single user context.
   *
   * @returns {boolean}
   *     True if the session is restricted to a user context, false otherwise.
   */
  get _isSessionRestricted() {
    return this._sessionUserContext !== null;
  }

  /**
   * The user context id the WebDriver session is restricted to.
   *
   * @returns {string|null}
   *     The user context id, or null if the session is not restricted.
   */
  get _sessionUserContext() {
    if (!lazy.containerIsolationEnabled) {
      return null;
    }

    return (
      lazy.getWebDriverSessionByInternalSessionId(
        this.messageHandler.internalSessionId
      )?.userContext ?? null
    );
  }

  /**
   * Asserts that a user context id refers to an existing user context, which
   * can be used by the WebDriver session.
   *
   * @param {string} userContextId
   *     The user context id.
   *
   * @throws {NoSuchUserContextError}
   *     If the user context cannot be found, or if the session is restricted
   *     to another user context.
   */
  _assertUserContextId(userContextId) {
    const sessionUserContext = this._sessionUserContext;

    // User contexts other than the session's user context are handled as if
    // they did not exist.
    if (
      !lazy.UserContextManager.hasUserContextId(userContextId) ||
      (sessionUserContext !== null && userContextId !== sessionUserContext)
    ) {
      throw new lazy.error.NoSuchUserContextError(
        `User Context with id ${userContextId} was not found`
      );
    }
  }

  /**
   * Emits an event for a specific browsing context.
   *
   * @param {string} browsingContextId
   *     The ID of the browsing context to which the event should be emitted.
   * @param {string} eventName
   *     The name of the event to be emitted.
   * @param {object} eventPayload
   *     The payload to be sent with the event.
   *
   * @returns {boolean}
   *     Returns `true` if the event was successfully emitted, otherwise `false`.
   */
  _emitEventForBrowsingContext(browsingContextId, eventName, eventPayload) {
    return this._emitEventForBrowsingContexts(
      [browsingContextId],
      eventName,
      eventPayload
    );
  }

  /**
   * Emits an event for a set of related browsing contexts.
   *
   * @param {Array<string>} browsingContextIds
   *     An array of browsing context ids to which the event is related.
   * @param {string} eventName
   *     The name of the event to be emitted.
   * @param {object} eventPayload
   *     The payload to be sent with the event.
   *
   * @returns {boolean}
   *     Returns `true` if the event was successfully emitted, otherwise `false`.
   */
  _emitEventForBrowsingContexts(browsingContextIds, eventName, eventPayload) {
    // This event is emitted from the parent process but for a given browsing
    // context. Set the event's contextInfo to the message handler corresponding
    // to this browsing context.
    const relatedContexts = browsingContextIds.map(contextId => ({
      contextId,
      type: lazy.WindowGlobalMessageHandler.type,
    }));
    return this.emitEvent(eventName, eventPayload, relatedContexts);
  }

  /**
   * Retrieves a browsing context based on its navigable id.
   *
   * @see https://w3c.github.io/webdriver-bidi/#get-a-navigable
   *
   * @param {string} navigableId
   *     Unique id of the browsing context.
   * @param {object=} options
   * @param {boolean=} options.skipPrivilegeCheck
   *     If set to `true` the privileged scope check is skipped entirely,
   *     allowing any browsing context without requiring system access.
   *     Defaults to `false`.
   * @param {boolean=} options.supportsPrivilegedScope
   *     If set to `true` privileged browsing contexts are supported
   *     for the BiDi command. Defaults to `false`.
   *
   * @returns {BrowsingContext|null}
   *     The browsing context, or null if `navigableId` is null.
   *
   * @throws {NoSuchFrameError}
   *     If the browsing context cannot be found.
   */
  _getNavigable(navigableId, options = {}) {
    const { skipPrivilegeCheck = false, supportsPrivilegedScope = false } =
      options;

    if (navigableId === null) {
      // The WebDriver BiDi specification expects `null` to be
      // returned if navigable id is `null`.
      return null;
    }

    const context = lazy.NavigableManager.getBrowsingContextById(navigableId);
    const sessionUserContext = this._sessionUserContext;

    // Browsing contexts outside of the session's user context are handled as
    // if they did not exist.
    if (
      context === null ||
      (sessionUserContext !== null &&
        lazy.UserContextManager.getIdByBrowsingContext(context) !==
          sessionUserContext)
    ) {
      throw new lazy.error.NoSuchFrameError(
        `Browsing Context with id ${navigableId} not found`
      );
    }

    if (!skipPrivilegeCheck && lazy.isPrivilegedContext(context)) {
      lazy.assert.hasSystemAccess();

      if (!supportsPrivilegedScope) {
        throw new lazy.error.UnsupportedOperationError(
          "The command does not support browsing contexts in privileged scope"
        );
      }
    }

    return context;
  }

  /**
   * Retrieves the internal id of a user context based on its user context id.
   *
   * @param {string} userContextId
   *     The user context id.
   *
   * @returns {number}
   *     The internal user context id.
   *
   * @throws {NoSuchUserContextError}
   *     If the user context cannot be found.
   */
  _getUserContextInternalId(userContextId) {
    this._assertUserContextId(userContextId);
    return lazy.UserContextManager.getInternalIdById(userContextId);
  }

  /**
   * Checks if there is a listener for a specific event and context information.
   *
   * @param {string} eventName
   *     The name of the event to check for listeners.
   * @param {ContextInfo} contextInfo
   *     The context information to check for listeners within.
   * @returns {boolean}
   *     Returns `true` if there is at least one listener for the specified event and context, otherwise `false`.
   */
  _hasListener(eventName, contextInfo) {
    return this.messageHandler.eventsDispatcher.hasListener(
      eventName,
      contextInfo
    );
  }

  /**
   * Forwards a command to the windowglobal module corresponding to the provided
   * browsing context id, using the same module name as the current one.
   *
   * @param {string} commandName
   *     The name of the command to execute.
   * @param {number} browsingContextID
   *     The debuggable context ID.
   * @param {object} params
   *    Any command parameters to pass.
   * @param {object=} args
   *     Any additional command arguments to pass.
   * @returns {Promise}
   *     A Promise that will resolve with the return value of the
   *     command once it has been executed.
   */
  _forwardToWindowGlobal(commandName, browsingContextID, params, args = {}) {
    return this.messageHandler.forwardCommand({
      moduleName: this.moduleName,
      commandName,
      destination: {
        type: lazy.WindowGlobalMessageHandler.type,
        id: browsingContextID,
      },
      ...args,
      params,
    });
  }

  /**
   * Commands which can be used in a session restricted to a single user
   * context. All other commands are rejected in such a session.
   *
   * Should be overridden by individual root bidi modules which want to expose
   * commands.
   *
   * @returns {Array<string>}
   *     The command names.
   */
  static get supportedCommandsInRestrictedSession() {
    return [];
  }

  supportsMethod(methodName, fromContentProcess) {
    if (
      // Internal commands (starting with "_") are always allowed because they
      // cannot be triggered directly by external clients.
      !methodName.startsWith("_") &&
      this._isSessionRestricted &&
      !this.constructor.supportedCommandsInRestrictedSession.includes(
        methodName
      )
    ) {
      throw new lazy.error.UnsupportedOperationError(
        `${this.moduleName}.${methodName} is not supported in a session restricted to a single user context`
      );
    }

    return super.supportsMethod(methodName, fromContentProcess);
  }
}
