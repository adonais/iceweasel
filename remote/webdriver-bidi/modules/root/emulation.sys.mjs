/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RootBiDiModule } from "chrome://remote/content/webdriver-bidi/modules/RootBiDiModule.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  assert: "chrome://remote/content/shared/webdriver/Assert.sys.mjs",
  ContextDescriptorType:
    "chrome://remote/content/shared/messagehandler/MessageHandler.sys.mjs",
  error: "chrome://remote/content/shared/webdriver/Errors.sys.mjs",
  pprint: "chrome://remote/content/shared/Format.sys.mjs",
  SessionDataMethod:
    "chrome://remote/content/shared/messagehandler/sessiondata/SessionData.sys.mjs",
  TabManager: "chrome://remote/content/shared/TabManager.sys.mjs",
  UserContextManager:
    "chrome://remote/content/shared/UserContextManager.sys.mjs",
});

class EmulationModule extends RootBiDiModule {
  /**
   * Create a new module instance.
   *
   * @param {MessageHandler} messageHandler
   *     The MessageHandler instance which owns this Module instance.
   */
  constructor(messageHandler) {
    super(messageHandler);
  }

  destroy() {}

  /**
   * Used as an argument for emulation.setGeolocationOverride command
   * to represent an object which holds geolocation coordinates which
   * should override the return result of geolocation APIs.
   *
   * @typedef {object} GeolocationCoordinates
   *
   * @property {number} latitude
   * @property {number} longitude
   * @property {number=} accuracy
   *     Defaults to 1.
   * @property {number=} altitude
   *     Defaults to null.
   * @property {number=} altitudeAccuracy
   *     Defaults to null.
   * @property {number=} heading
   *     Defaults to null.
   * @property {number=} speed
   *     Defaults to null.
   */

  /**
   * Set the geolocation override to the list of top-level navigables
   * or user contexts.
   *
   * @param {object=} options
   * @param {Array<string>=} options.contexts
   *     Optional list of browsing context ids.
   * @param {(GeolocationCoordinates|null)} options.coordinates
   *     Geolocation coordinates which have to override
   *     the return result of geolocation APIs.
   *     Null value resets the override.
   * @param {Array<string>=} options.userContexts
   *     Optional list of user context ids.
   *
   * @throws {InvalidArgumentError}
   *     Raised if an argument is of an invalid type or value.
   * @throws {NoSuchFrameError}
   *     If the browsing context cannot be found.
   * @throws {NoSuchUserContextError}
   *     Raised if the user context id could not be found.
   */
  async setGeolocationOverride(options = {}) {
    let { coordinates } = options;
    const { contexts: contextIds = null, userContexts: userContextIds = null } =
      options;

    if (coordinates !== null) {
      lazy.assert.object(
        coordinates,
        lazy.pprint`Expected "coordinates" to be an object, got ${coordinates}`
      );

      const {
        latitude,
        longitude,
        accuracy = 1,
        altitude = null,
        altitudeAccuracy = null,
        heading = null,
        speed = null,
      } = coordinates;

      lazy.assert.numberInRange(
        latitude,
        [-90, 90],
        lazy.pprint`Expected "latitude" to be in the range of -90 to 90, got ${latitude}`
      );

      lazy.assert.numberInRange(
        longitude,
        [-180, 180],
        lazy.pprint`Expected "longitude" to be in the range of -180 to 180, got ${longitude}`
      );

      lazy.assert.positiveNumber(
        accuracy,
        lazy.pprint`Expected "accuracy" to be a positive number, got ${accuracy}`
      );

      if (altitude !== null) {
        lazy.assert.number(
          altitude,
          lazy.pprint`Expected "altitude" to be a number, got ${altitude}`
        );
      }

      if (altitudeAccuracy !== null) {
        lazy.assert.positiveNumber(
          altitudeAccuracy,
          lazy.pprint`Expected "altitudeAccuracy" to be a positive number, got ${altitudeAccuracy}`
        );

        if (altitude === null) {
          throw new lazy.error.InvalidArgumentError(
            `When "altitudeAccuracy" is provided it's required to provide "altitude" as well`
          );
        }
      }

      if (heading !== null) {
        lazy.assert.number(
          heading,
          lazy.pprint`Expected "heading" to be a number, got ${heading}`
        );

        lazy.assert.that(
          number => number >= 0 && number < 360,
          lazy.pprint`Expected "heading" to be >= 0 and < 360, got ${heading}`
        )(heading);
      }

      if (speed !== null) {
        lazy.assert.positiveNumber(
          speed,
          lazy.pprint`Expected "speed" to be a positive number, got ${speed}`
        );
      }

      coordinates = {
        ...coordinates,
        accuracy,
        // For platform API if we want to set values to null
        // we have to set them to NaN.
        altitude: altitude === null ? NaN : altitude,
        altitudeAccuracy: altitudeAccuracy === null ? NaN : altitudeAccuracy,
        heading: heading === null ? NaN : heading,
        speed: speed === null ? NaN : speed,
      };
    }

    const navigables = new Set();
    const userContexts = new Set();
    if (contextIds !== null) {
      lazy.assert.isNonEmptyArray(
        contextIds,
        lazy.pprint`Expected "contexts" to be a non-empty array, got ${contextIds}`
      );

      for (const contextId of contextIds) {
        lazy.assert.string(
          contextId,
          lazy.pprint`Expected elements of "contexts" to be a string, got ${contextId}`
        );

        const context = this.#getBrowsingContext(contextId);

        lazy.assert.topLevel(
          context,
          `Browsing context with id ${contextId} is not top-level`
        );

        navigables.add(context);
      }
    } else if (userContextIds !== null) {
      lazy.assert.isNonEmptyArray(
        userContextIds,
        lazy.pprint`Expected "userContexts" to be a non-empty array, got ${userContextIds}`
      );

      for (const userContextId of userContextIds) {
        lazy.assert.string(
          userContextId,
          lazy.pprint`Expected elements of "userContexts" to be a string, got ${userContextId}`
        );

        const internalId =
          lazy.UserContextManager.getInternalIdById(userContextId);

        if (internalId === null) {
          throw new lazy.error.NoSuchUserContextError(
            `User context with id: ${userContextId} doesn't exist`
          );
        }

        userContexts.add(internalId);

        // Prepare the list of navigables to update.
        lazy.UserContextManager.getTabsForUserContext(internalId).forEach(
          tab => {
            const contentBrowser = lazy.TabManager.getBrowserForTab(tab);
            navigables.add(contentBrowser.browsingContext);
          }
        );
      }
    } else {
      throw new lazy.error.InvalidArgumentError(
        `At least one of "contexts" or "userContexts" arguments should be provided`
      );
    }

    if (contextIds !== null && userContextIds !== null) {
      throw new lazy.error.InvalidArgumentError(
        `Providing both "contexts" and "userContexts" arguments is not supported`
      );
    }

    const sessionDataItems = [];
    if (userContextIds !== null) {
      for (const userContext of userContexts) {
        sessionDataItems.push({
          category: "geolocation-override",
          moduleName: "_configuration",
          values: [coordinates],
          contextDescriptor: {
            type: lazy.ContextDescriptorType.UserContext,
            id: userContext,
          },
          method: lazy.SessionDataMethod.Add,
        });
      }
    } else {
      for (const navigable of navigables) {
        sessionDataItems.push({
          category: "geolocation-override",
          moduleName: "_configuration",
          values: [coordinates],
          contextDescriptor: {
            type: lazy.ContextDescriptorType.TopBrowsingContext,
            id: navigable.browserId,
          },
          method: lazy.SessionDataMethod.Add,
        });
      }
    }

    if (sessionDataItems.length) {
      // TODO: Bug 1953079. Saving the geolocation override in the session data works fine
      // with one session, but when we start supporting multiple BiDi session, we will
      // have to rethink this approach.
      await this.messageHandler.updateSessionData(sessionDataItems);
    }

    const commands = [];

    for (const navigable of navigables) {
      commands.push(
        this._forwardToWindowGlobal(
          "_setGeolocationOverride",
          navigable.id,
          {
            coordinates,
          },
          { retryOnAbort: true }
        )
      );
    }

    await Promise.all(commands);
  }

  /**
   * Set the locale override to the list of top-level navigables
   * or user contexts.
   *
   * @param {object=} options
   * @param {Array<string>=} options.contexts
   *     Optional list of browsing context ids.
   * @param {(string|null)} options.locale
   *     Locale string which have to override
   *     the return result of JavaScript Intl APIs.
   *     Null value resets the override.
   * @param {Array<string>=} options.userContexts
   *     Optional list of user context ids.
   *
   * @throws {InvalidArgumentError}
   *     Raised if an argument is of an invalid type or value.
   * @throws {NoSuchFrameError}
   *     If the browsing context cannot be found.
   * @throws {NoSuchUserContextError}
   *     Raised if the user context id could not be found.
   */
  async setLocaleOverride(options = {}) {
    const {
      contexts: contextIds = null,
      locale: localeArg,
      userContexts: userContextIds = null,
    } = options;

    let locale;
    if (localeArg !== undefined) {
      if (localeArg === null) {
        // The API requires an empty string to reset the override.
        locale = "";
      } else {
        locale = lazy.assert.string(
          localeArg,
          lazy.pprint`Expected "locale" to be a string, got ${localeArg}`
        );

        // Validate if locale is a structurally valid language tag.
        try {
          Intl.getCanonicalLocales(localeArg);
        } catch (err) {
          if (err instanceof RangeError) {
            throw new lazy.error.InvalidArgumentError(
              `Expected "locale" to be a structurally valid language tag (e.g., "en-GB"), got ${localeArg}`
            );
          }

          throw err;
        }
      }
    }

    if (contextIds !== null && userContextIds !== null) {
      throw new lazy.error.InvalidArgumentError(
        `Providing both "contexts" and "userContexts" arguments is not supported`
      );
    }

    const navigables = new Set();
    const userContexts = new Set();
    if (contextIds !== null) {
      lazy.assert.isNonEmptyArray(
        contextIds,
        lazy.pprint`Expected "contexts" to be a non-empty array, got ${contextIds}`
      );

      for (const contextId of contextIds) {
        lazy.assert.string(
          contextId,
          lazy.pprint`Expected elements of "contexts" to be a string, got ${contextId}`
        );

        const context = this.#getBrowsingContext(contextId);

        lazy.assert.topLevel(
          context,
          `Browsing context with id ${contextId} is not top-level`
        );

        navigables.add(context);
      }
    } else if (userContextIds !== null) {
      lazy.assert.isNonEmptyArray(
        userContextIds,
        lazy.pprint`Expected "userContexts" to be a non-empty array, got ${userContextIds}`
      );

      for (const userContextId of userContextIds) {
        lazy.assert.string(
          userContextId,
          lazy.pprint`Expected elements of "userContexts" to be a string, got ${userContextId}`
        );

        const internalId =
          lazy.UserContextManager.getInternalIdById(userContextId);

        if (internalId === null) {
          throw new lazy.error.NoSuchUserContextError(
            `User context with id: ${userContextId} doesn't exist`
          );
        }

        userContexts.add(internalId);

        // Prepare the list of navigables to update.
        lazy.UserContextManager.getTabsForUserContext(internalId).forEach(
          tab => {
            const contentBrowser = lazy.TabManager.getBrowserForTab(tab);
            navigables.add(contentBrowser.browsingContext);
          }
        );
      }
    } else {
      throw new lazy.error.InvalidArgumentError(
        `At least one of "contexts" or "userContexts" arguments should be provided`
      );
    }

    const sessionDataItems = [];
    if (userContextIds !== null) {
      for (const userContext of userContexts) {
        sessionDataItems.push({
          category: "locale-override",
          moduleName: "_configuration",
          values: [locale],
          contextDescriptor: {
            type: lazy.ContextDescriptorType.UserContext,
            id: userContext,
          },
          method: lazy.SessionDataMethod.Add,
        });
      }
    } else {
      for (const navigable of navigables) {
        sessionDataItems.push({
          category: "locale-override",
          moduleName: "_configuration",
          values: [locale],
          contextDescriptor: {
            type: lazy.ContextDescriptorType.TopBrowsingContext,
            id: navigable.browserId,
          },
          method: lazy.SessionDataMethod.Add,
        });
      }
    }

    if (sessionDataItems.length) {
      // TODO: Bug 1953079. Saving the locale override in the session data works fine
      // with one session, but when we start supporting multiple BiDi session, we will
      // have to rethink this approach.
      await this.messageHandler.updateSessionData(sessionDataItems);
    }

    for (const navigable of navigables) {
      this._setLocaleForBrowsingContext({ locale, context: navigable });
    }
  }

  /**
   * Set the locale override to the top-level browsing context.
   *
   * @param {object=} options
   * @param {BrowsingContext} options.context
   *     Top-level browsing context object which is a target
   *     for the locale override.
   * @param {(string|null)} options.locale
   *     Locale string which have to override
   *     the return result of JavaScript Intl APIs.
   *     Null value resets the override.
   */
  _setLocaleForBrowsingContext(options) {
    const { context, locale } = options;

    context.languageOverride = locale;
  }

  #getBrowsingContext(contextId) {
    const context = lazy.TabManager.getBrowsingContextById(contextId);
    if (context === null) {
      throw new lazy.error.NoSuchFrameError(
        `Browsing Context with id ${contextId} not found`
      );
    }

    return context;
  }
}

export const emulation = EmulationModule;
