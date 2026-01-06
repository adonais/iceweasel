/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { WindowGlobalBiDiModule } from "chrome://remote/content/webdriver-bidi/modules/WindowGlobalBiDiModule.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ContextDescriptorType:
    "chrome://remote/content/shared/messagehandler/MessageHandler.sys.mjs",
  RootMessageHandler:
    "chrome://remote/content/shared/messagehandler/RootMessageHandler.sys.mjs",
  WindowGlobalMessageHandler:
    "chrome://remote/content/shared/messagehandler/WindowGlobalMessageHandler.sys.mjs",
});

/**
 * Internal module to set the configuration on the newly created navigables.
 */
class _ConfigurationModule extends WindowGlobalBiDiModule {
  #geolocationConfiguration;
  #localeOverride;
  #preloadScripts;
  #resolveBlockerPromise;
  #screenOrientationOverride;
  #screenSettingsOverride;
  #timezoneOverride;
  #userAgentOverride;
  #viewportConfiguration;

  constructor(messageHandler) {
    super(messageHandler);

    this.#geolocationConfiguration = undefined;
    this.#localeOverride = null;
    this.#preloadScripts = new Set();
    this.#screenOrientationOverride = undefined;
    this.#screenSettingsOverride = undefined;
    this.#timezoneOverride = null;
    this.#userAgentOverride = null;
    this.#viewportConfiguration = new Map();

    Services.obs.addObserver(this, "document-element-inserted");
  }

  destroy() {
    // Unblock the document parsing.
    if (this.#resolveBlockerPromise) {
      this.#resolveBlockerPromise();
    }

    Services.obs.removeObserver(this, "document-element-inserted");

    this.#preloadScripts = null;
    this.#viewportConfiguration = null;
  }

  async observe(subject, topic) {
    if (topic === "document-element-inserted") {
      const window = subject?.defaultView;
      // Ignore events without a window.
      if (window !== this.messageHandler.window) {
        return;
      }

      // Do nothing if there is no configuration to apply.
      if (
        this.#preloadScripts.size === 0 &&
        this.#viewportConfiguration.size === 0 &&
        this.#geolocationConfiguration === undefined &&
        this.#localeOverride === null &&
        this.#screenOrientationOverride === undefined &&
        this.#screenSettingsOverride === undefined &&
        this.#timezoneOverride === null &&
        this.#userAgentOverride === null
      ) {
        this.#onConfigurationComplete(window);
        return;
      }

      // Block document parsing.
      const blockerPromise = new Promise(resolve => {
        this.#resolveBlockerPromise = resolve;
      });
      window.document.blockParsing(blockerPromise);

      // Usually rendering is blocked until layout is started implicitly (by
      // end of parsing) or explicitly. Since we block the implicit
      // initialization and some code we call may block on it (like waiting for
      // requestAnimationFrame or viewport dimensions), we initialize it
      // explicitly here by forcing a layout flush. Note that this will cause
      // flashes of unstyled content, but that was already the case before
      // bug 1958942.
      window.document.documentElement.getBoundingClientRect();

      if (this.#geolocationConfiguration !== undefined) {
        await this.messageHandler.handleCommand({
          moduleName: "emulation",
          commandName: "_setGeolocationOverride",
          destination: {
            type: lazy.WindowGlobalMessageHandler.type,
            id: this.messageHandler.context.id,
          },
          params: {
            coordinates: this.#geolocationConfiguration,
          },
        });
      }

      if (this.#localeOverride !== null) {
        await this.messageHandler.forwardCommand({
          moduleName: "emulation",
          commandName: "_setLocaleForBrowsingContext",
          destination: {
            type: lazy.RootMessageHandler.type,
          },
          params: {
            context: this.messageHandler.context,
            value: this.#localeOverride,
          },
        });
      }

      // Compare with `undefined`, since `null` value is used as a reset value.
      if (this.#screenSettingsOverride !== undefined) {
        await this.messageHandler.forwardCommand({
          moduleName: "emulation",
          commandName: "_setScreenSettingsOverride",
          destination: {
            type: lazy.RootMessageHandler.type,
          },
          params: {
            context: this.messageHandler.context,
            value: this.#screenSettingsOverride,
          },
        });
      }

      if (this.#timezoneOverride !== null) {
        await this.messageHandler.forwardCommand({
          moduleName: "emulation",
          commandName: "_setTimezoneOverride",
          destination: {
            type: lazy.RootMessageHandler.type,
          },
          params: {
            context: this.messageHandler.context,
            value: this.#timezoneOverride,
          },
        });
      }

      if (this.#userAgentOverride !== null) {
        await this.messageHandler.forwardCommand({
          moduleName: "emulation",
          commandName: "_setUserAgentOverride",
          destination: {
            type: lazy.RootMessageHandler.type,
          },
          params: {
            context: this.messageHandler.context,
            value: this.#userAgentOverride,
          },
        });
      }

      if (this.#screenOrientationOverride !== undefined) {
        await this.messageHandler.forwardCommand({
          moduleName: "emulation",
          commandName: "_setEmulatedScreenOrientation",
          destination: {
            type: lazy.RootMessageHandler.type,
          },
          params: {
            context: this.messageHandler.context,
            orientationOverride: this.#screenOrientationOverride,
          },
        });
      }

      if (this.#viewportConfiguration.size !== 0) {
        await this.messageHandler.forwardCommand({
          moduleName: "browsingContext",
          commandName: "_updateNavigableViewport",
          destination: {
            type: lazy.RootMessageHandler.type,
          },
          params: {
            navigable: this.messageHandler.context,
            viewportOverride: Object.fromEntries(this.#viewportConfiguration),
          },
        });
      }

      if (this.#preloadScripts.size !== 0) {
        await this.messageHandler.handleCommand({
          moduleName: "script",
          commandName: "_evaluatePreloadScripts",
          destination: {
            type: lazy.WindowGlobalMessageHandler.type,
            id: this.messageHandler.context.id,
          },
          params: {
            scripts: this.#preloadScripts,
          },
        });
      }

      // Continue script parsing.
      this.#resolveBlockerPromise();
      this.#onConfigurationComplete(window);
    }
  }

  /**
   * Check if the provided value matches the provided type.
   *
   * @param {*} value
   *     The value to verify.
   * @param {string} type
   *     The type to match.
   *
   * @returns {boolean}
   *     Returns true if the value type is the same as
   *     the provided type. False, otherwise.
   */
  #isOfType(value, type) {
    if (type === "object") {
      return typeof value === "object" && value !== null;
    }

    return typeof value === type;
  }

  /**
   * For some emulations a value set per a browsing context overrides
   * a value set per a user context or set globally. And a value set per
   * a user context overrides a global value.
   *
   * @param {string} type
   *     The type to verify that the value was set.
   * @param {*} contextValue
   *     The override value set per browsing context.
   * @param {*} userContextValue
   *     The override value set per user context.
   * @param {*} globalValue
   *     The override value set globally.
   *
   * @returns {*}
   *     Returns the override value which should be applied.
   */
  #findCorrectOverrideValue(type, contextValue, userContextValue, globalValue) {
    if (this.#isOfType(contextValue, type)) {
      return contextValue;
    }
    if (this.#isOfType(userContextValue, type)) {
      return userContextValue;
    }
    if (this.#isOfType(globalValue, type)) {
      return globalValue;
    }
    return null;
  }

  #updatePreloadScripts(sessionData) {
    this.#preloadScripts.clear();

    for (const { contextDescriptor, value } of sessionData) {
      if (!this.messageHandler.matchesContext(contextDescriptor)) {
        continue;
      }

      this.#preloadScripts.add(value);
    }
  }

  /**
   * Internal commands
   */

  _applySessionData(params) {
    const { category, sessionData } = params;

    if (category === "preload-script") {
      this.#updatePreloadScripts(sessionData);
    }

    // The following overrides apply only to top-level traversables.
    if (
      [
        "geolocation-override",
        "locale-override",
        "screen-orientation-override",
        "screen-settings-override",
        "timezone-override",
        "user-agent-override",
        "viewport-overrides",
      ].includes(category) &&
      !this.messageHandler.context.parent
    ) {
      let localeOverridePerContext = null;
      let localeOverridePerUserContext = null;

      let screenSettingsOverridePerContext = null;
      let screenSettingsOverridePerUserContext = null;

      let timezoneOverridePerContext = null;
      let timezoneOverridePerUserContext = null;

      let userAgentOverrideGlobal = null;
      let userAgentOverridePerUserContext = null;
      let userAgentOverridePerContext = null;

      for (const { contextDescriptor, value } of sessionData) {
        if (!this.messageHandler.matchesContext(contextDescriptor)) {
          continue;
        }

        switch (category) {
          case "geolocation-override": {
            this.#geolocationConfiguration = value;
            break;
          }
          case "viewport-overrides": {
            if (value.viewport !== undefined) {
              this.#viewportConfiguration.set("viewport", value.viewport);
            }

            if (value.devicePixelRatio !== undefined) {
              this.#viewportConfiguration.set(
                "devicePixelRatio",
                value.devicePixelRatio
              );
            }
            break;
          }
          case "locale-override": {
            switch (contextDescriptor.type) {
              case lazy.ContextDescriptorType.TopBrowsingContext: {
                localeOverridePerContext = value;
                break;
              }
              case lazy.ContextDescriptorType.UserContext: {
                localeOverridePerUserContext = value;
                break;
              }
            }
            break;
          }
          case "screen-settings-override": {
            switch (contextDescriptor.type) {
              case lazy.ContextDescriptorType.TopBrowsingContext: {
                screenSettingsOverridePerContext = value;
                break;
              }
              case lazy.ContextDescriptorType.UserContext: {
                screenSettingsOverridePerUserContext = value;
                break;
              }
            }
            break;
          }
          case "screen-orientation-override": {
            this.#screenOrientationOverride = value;
            break;
          }
          case "timezone-override": {
            switch (contextDescriptor.type) {
              case lazy.ContextDescriptorType.TopBrowsingContext: {
                timezoneOverridePerContext = value;
                break;
              }
              case lazy.ContextDescriptorType.UserContext: {
                timezoneOverridePerUserContext = value;
                break;
              }
            }
            break;
          }
          case "user-agent-override": {
            switch (contextDescriptor.type) {
              case lazy.ContextDescriptorType.TopBrowsingContext: {
                userAgentOverridePerContext = value;
                break;
              }
              case lazy.ContextDescriptorType.UserContext: {
                userAgentOverridePerUserContext = value;
                break;
              }
              case lazy.ContextDescriptorType.All: {
                userAgentOverrideGlobal = value;
              }
            }
            break;
          }
        }
      }

      // For the following emulations on the previous step, we found session items
      // that would apply an override for a browsing context,a user context, and in some cases globally.
      // Now from these items we have to choose the one that would take precedence.
      // The order is the user context item overrides the global one, and the browsing context overrides the user context item.
      switch (category) {
        case "locale-override": {
          this.#localeOverride = this.#findCorrectOverrideValue(
            "string",
            localeOverridePerContext,
            localeOverridePerUserContext
          );
          break;
        }
        case "screen-settings-override": {
          this.#screenSettingsOverride = this.#findCorrectOverrideValue(
            "object",
            screenSettingsOverridePerContext,
            screenSettingsOverridePerUserContext
          );

          break;
        }
        case "timezone-override": {
          this.#timezoneOverride = this.#findCorrectOverrideValue(
            "string",
            timezoneOverridePerContext,
            timezoneOverridePerUserContext
          );

          break;
        }
        case "user-agent-override": {
          this.#userAgentOverride = this.#findCorrectOverrideValue(
            "string",
            userAgentOverridePerContext,
            userAgentOverridePerUserContext,
            userAgentOverrideGlobal
          );

          break;
        }
      }
    }
  }

  async #onConfigurationComplete(window) {
    // parser blocking doesn't work for initial about:blank, so ensure
    // browsing_context.create waits for configuration to complete
    if (window.location.href.startsWith("about:blank")) {
      await this.messageHandler.forwardCommand({
        moduleName: "browsingContext",
        commandName: "_onConfigurationComplete",
        destination: {
          type: lazy.RootMessageHandler.type,
        },
        params: {
          navigable: this.messageHandler.context,
        },
      });
    }
  }
}

export const _configuration = _ConfigurationModule;
