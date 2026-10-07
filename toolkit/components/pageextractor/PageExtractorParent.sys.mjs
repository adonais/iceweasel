/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @ts-check

/**
 * @import { HiddenFrame } from "resource://gre/modules/HiddenFrame.sys.mjs"
 * @import { GetTextOptions, ExtractionResult, PageMetadata } from './PageExtractor.d.ts'
 * @import { PageExtractorChild } from './PageExtractorChild.sys.mjs'
 * @import { PageExtractorPhase, TraceId } from './PageExtractorEvents.sys.mjs'
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  HiddenBrowserManager: "resource://gre/modules/HiddenFrame.sys.mjs",
  console: () =>
    console.createInstance({
      prefix: "PageExtractorChild",
      maxLogLevelPref: "browser.ml.logLevel",
    }),
  collapseWhitespace:
    "moz-src:///toolkit/components/pageextractor/DOMExtractor.sys.mjs",
  PageExtractorEvent:
    "moz-src:///toolkit/components/pageextractor/PageExtractorEvents.sys.mjs",
  Phase: () => lazy.PageExtractorEvent.Phase,
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  headlessTimeoutMs: {
    pref: "browser.ml.pageExtractor.headlessTimeoutMs",
    default: 15000,
  },
});

// NOTE: Copied from nsSandboxFlags.h.
// Blocks window.open / target="_blank" popups.
const SANDBOXED_AUXILIARY_NAVIGATION = 0x2;
// Blocks the page from navigating its own top to an attacker-controlled URL.
const SANDBOXED_TOPLEVEL_NAVIGATION = 0x4;
// Blocks form submissions.
const SANDBOXED_FORMS = 0x20;
// Blocks the Pointer Lock API.
const SANDBOXED_POINTER_LOCK = 0x40;
// Blocks automatically triggered features such as autoplay, autofocus, and
// auto-form-submission.
const SANDBOXED_AUTOMATIC_FEATURES = 0x100;
// Blocks modal dialogs (alert, confirm, prompt, print, etc).
const SANDBOXED_MODALS = 0x800;
// Blocks the Screen Orientation API from locking orientation.
const SANDBOXED_ORIENTATION_LOCK = 0x2000;
// Blocks the Presentation API.
const SANDBOXED_PRESENTATION = 0x4000;
// Blocks the Storage Access API.
const SANDBOXED_STORAGE_ACCESS = 0x8000;
// Blocks downloads initiated by the page.
const SANDBOXED_DOWNLOADS = 0x10000;

/**
 * Extract a variety of content from pages for use in a smart window.
 */
export class PageExtractorParent extends JSWindowActorParent {
  /**
   * Waits for DOMContentLoaded.
   *
   * @see PageExtractorChild#waitForPageReady
   *
   * @param {TraceId} [traceId] - Correlates this call with an enclosing
   *   headless-extractor request's profiler markers. Internal only, not a
   *   GetTextOptions field: starts its own trace when omitted.
   * @returns {Promise<void>}
   */
  async waitForPageReady(traceId) {
    return this.#trace(lazy.Phase.waitForReady, { traceId }, event =>
      this.sendQuery("PageExtractorParent:WaitForPageReady", {
        traceId: event.traceId,
      })
    );
  }

  /**
   * Get metadata related to the page.
   *
   * @see PageExtractorChild#getPageMetadata
   *
   * @returns {Promise<PageMetadata>}
   */
  async getPageMetadata() {
    return this.#trace(lazy.Phase.getPageMetadata, {}, event =>
      this.sendQuery("PageExtractorParent:GetPageMetadata", {
        traceId: event.traceId,
      })
    );
  }

  /**
   * Gets the visible text from the page. This function is a bit smarter than just
   * document.body.innerText. See GetTextOptions
   *
   * @see PageExtractorChild#getText
   *
   * @param {Partial<GetTextOptions>} options
   * @param {TraceId} [traceId] - Correlates this call with an enclosing
   *   headless-extractor request's profiler markers. Internal only, not a
   *   GetTextOptions field: starts its own trace when omitted.
   * @returns {Promise<ExtractionResult | null>}
   */
  async getText(options = {}, traceId) {
    if (options._forceRemoveBoilerplate && !Cu.isInAutomation) {
      throw new Error(
        "The _forceRemoveBoilerplate option from GetTextOptions can only be used in tests."
      );
    }

    return this.#trace(
      lazy.Phase.getText,
      { options, traceId },
      async event => {
        if (this.#isPDF()) {
          const result = await this.#getTextFromPDF(options, event.traceId);
          event.finish({
            status: "success",
            strategy: "pdf",
            textLength: result.text.length,
            linkCount: result.links.length,
            canvasCount: result.canvasSnapshots.length,
          });
          return result;
        }

        const result = await this.sendQuery("PageExtractorParent:GetText", {
          options,
          traceId: event.traceId,
        });
        if (!result) {
          event.finish({ status: "unavailable" });
          return null;
        }
        event.finish({
          status: "success",
          textLength: result.text.length,
          linkCount: result.links.length,
          canvasCount: result.canvasSnapshots.length,
        });
        return result;
      }
    );
  }

  /**
   * Call out to pdf.js to get the text content and apply the GetTextOptions.
   *
   * @param {GetTextOptions} options
   * @param {TraceId} traceId
   */
  async #getTextFromPDF(options, traceId) {
    return this.#trace(
      lazy.Phase.pdfExtract,
      { traceId, strategy: "pdf" },
      async event => {
        let text = await this.browsingContext.currentWindowGlobal
          .getActor("PdfJs")
          .getTextContent();

        if (
          options.sufficientLength &&
          text.length > options.sufficientLength
        ) {
          // Try to cut at a sentence boundary within the last 100 characters of the
          // end.
          //
          // TODO(Bug 2023932) Make this internationalized, splitting on a "." only works
          // in certain scripts like Latin.
          const truncatePoint = text.lastIndexOf(".", options.sufficientLength);
          if (truncatePoint > options.sufficientLength - 100) {
            text = text.substring(0, truncatePoint + 1);
          } else {
            text = text.substring(0, options.sufficientLength) + "…";
          }
        }

        text = lazy.collapseWhitespace(text).trim();

        event.finish({ status: "success", textLength: text.length });
        return { text, links: [], canvasSnapshots: [] };
      }
    );
  }

  #isPDF() {
    return (
      this.browsingContext.currentWindowGlobal.documentPrincipal
        .originNoSuffix == "resource://pdf.js"
    );
  }

  /**
   * @see PageExtractorEvent.trace for docs
   *
   * @template T
   * @param {PageExtractorPhase} phase
   * @param {Record<string, any>} data
   * @param {(event: import('./PageExtractorEvents.sys.mjs').PageExtractorEvent) => Promise<T> | T} task
   * @returns {Promise<T>}
   */
  #trace(phase, data, task) {
    return lazy.PageExtractorEvent.trace(
      phase,
      {
        process: "parent",
        innerWindowId:
          this.browsingContext?.currentWindowGlobal?.innerWindowId ?? 0,
        ...data,
      },
      task
    );
  }

  /**
   * Get a Headless PageExtractor. It is available until the callback's returned
   * Promise is resolved. Then the headless browser is cleaned up.
   *
   * @see PageExtractorChild#getText
   *
   * @template T - The value resolved in the callback.
   *
   * @param {object} options
   * @param {string} options.urlString
   * @param {(actor: PageExtractorParent, traceId: TraceId) => Promise<T>} options.callback
   *   Called with the actor once the headless page is ready, and the trace
   *   to pass into a follow-up `actor.getText(options, traceId)` call so it
   *   correlates with this request.
   * @param {boolean} [options.anonymousFetch]
   * @returns {Promise<T>}
   */
  static async getHeadlessExtractor({ urlString, callback, anonymousFetch }) {
    const url = URL.parse(urlString);
    if (!url) {
      throw new Error("A valid URL must be provided.");
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Only http: and https: URLs are supported.");
    }
    if (anonymousFetch && url.protocol === "http:") {
      // Only loopback (e.g. localhost) and local network URLs are allowed to use
      // http since they do not perform external network requests.
      const principal = Services.scriptSecurityManager.createContentPrincipal(
        url.URI,
        {}
      );
      if (!principal.isLoopbackHost && !principal.isLocalIpAddress) {
        throw new Error(
          "Only https: URLs are supported for anonymous fetches."
        );
      }
    }
    return lazy.PageExtractorEvent.trace(
      lazy.Phase.headlessExtractor,
      {
        process: "parent",
        strategy: anonymousFetch ? "headless-anonymous" : "headless",
      },
      event => {
        const { traceId } = event;

        // Covers navigating the hidden browser up to onLocationChange,
        // before the page-ready wait starts. Whichever of three outcomes
        // (navigation commits, the actor lookup throws, or the load times
        // out) happens first finishes it; finish()'s idempotency handles
        // the rest.
        const navigateEvent = new lazy.PageExtractorEvent(
          lazy.Phase.headlessNavigate,
          { process: "parent", traceId }
        );

        // The hidden browser manager controls the lifetime of the hidden browser.
        return lazy.HiddenBrowserManager.withHiddenBrowser(
          async browser => {
            if (anonymousFetch) {
              // The goal of these settings is to fetch the page without sending
              // any user data to the origin and without letting the visit affect
              // the user's browsing profile (history, cache, trackers, etc).

              // Keep the visit out of browsing history
              // TODO (bug 2043254) - Move this into the HiddenBrowserManager so all hidden browsers don't affect global history.
              browser.setAttribute("disableglobalhistory", "true");
              // Suppress audio output from the loaded page.
              browser.browsingContext?.mediaController?.mute();
              browser.addEventListener("DidChangeBrowserRemoteness", () =>
                browser.browsingContext?.mediaController?.mute()
              );
              const { browsingContext } = browser;
              // Tracking Protection so third-party trackers on the page cannot profile the request or correlate it with the user.
              browsingContext.useTrackingProtection = true;
              browsingContext.defaultLoadFlags =
                // Strip cookies, HTTP auth, and other credentials from the request
                Ci.nsIRequest.LOAD_ANONYMOUS |
                // Don't write the response into the user's memory cache
                Ci.nsIRequest.INHIBIT_CACHING |
                // Don't write the response into the user's persistent (disk) cache
                Ci.nsIRequest.INHIBIT_PERSISTENT_CACHING;
              // Restrict what the loaded page can do.
              browsingContext.sandboxFlags |=
                SANDBOXED_AUXILIARY_NAVIGATION |
                SANDBOXED_TOPLEVEL_NAVIGATION |
                SANDBOXED_FORMS |
                SANDBOXED_POINTER_LOCK |
                SANDBOXED_AUTOMATIC_FEATURES |
                SANDBOXED_MODALS |
                SANDBOXED_ORIENTATION_LOCK |
                SANDBOXED_PRESENTATION |
                SANDBOXED_STORAGE_ACCESS |
                SANDBOXED_DOWNLOADS;
            }

            const { host } = url;

            /** @type {PromiseWithResolvers<PageExtractorParent>} */
            let actorResolver = Promise.withResolvers();

            const locationChangeFlags = Ci.nsIWebProgress.NOTIFY_LOCATION;
            const onLocationChange = {
              QueryInterface: ChromeUtils.generateQI([
                "nsIWebProgressListener",
                "nsISupportsWeakReference",
              ]),
              /**
               * @param {nsIWebProgress} webProgress
               * @param {nsIRequest} _request
               * @param {nsIURI} location
               * @param {number} _flags
               */
              onLocationChange(webProgress, _request, location, _flags) {
                if (!webProgress.isTopLevel) {
                  lazy.console.log(
                    "Headless browser had a non-top level location change."
                  );
                  return;
                }
                if (URL.fromURI(location).host != host) {
                  lazy.console.log(
                    "A location change happened that wasn't the host.",
                    location.host,
                    host
                  );
                  // This is probably overkill, but make sure this is not a spurious
                  // redirect.
                  return;
                }
                browser.removeProgressListener(
                  onLocationChange,
                  locationChangeFlags
                );

                /** @type {any} - This is reported as an `Element`, but it's a <browser> */
                const topBrowser = webProgress.browsingContext.topFrameElement;

                try {
                  const actor =
                    topBrowser.browsingContext.currentWindowGlobal.getActor(
                      "PageExtractor"
                    );

                  navigateEvent.finish({ status: "success" });
                  actor.waitForPageReady(traceId).then(
                    () => {
                      lazy.console.log("Headless PageExtractor is ready", url);
                      actorResolver.resolve(actor);
                    },
                    error => actorResolver.reject(error)
                  );
                } catch (error) {
                  // TODO (Bug 2001385) - It would be nice to catch if this is the
                  // `about:neterror` page or other similar errors. This will also fail if you
                  // try to access something like `about:reader` with the same error.
                  navigateEvent.finish({
                    status: "error",
                    errorName: error.name,
                  });
                  actorResolver.reject(
                    new Error(
                      "PageExtractor could not run on that page or the page could not be found."
                    )
                  );
                }
              },
            };

            browser.addProgressListener(onLocationChange, locationChangeFlags);

            lazy.console.log("Loading a headless PageExtractor", url);

            /** @type {LoadURIOptions} */
            const loadURIOptions = {
              triggeringPrincipal:
                Services.scriptSecurityManager.createNullPrincipal({}),
            };
            if (anonymousFetch) {
              // Suppress the Referer header so the origin can't learn where the
              // request came from (e.g. the SERP page that surfaced this URL).
              const referrerInfo = Cc[
                "@mozilla.org/referrer-info;1"
              ].createInstance(Ci.nsIReferrerInfo);
              referrerInfo.init(Ci.nsIReferrerInfo.NO_REFERRER, true, null);
              loadURIOptions.referrerInfo = referrerInfo;
              // Don't add an entry for this load to session history.
              loadURIOptions.loadFlags =
                Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_HISTORY;
            }

            browser.loadURI(url.URI, loadURIOptions);

            // The load may never commit on the requested host: the network can
            // stall, or bot detection can redirect to a challenge page elsewhere.
            const timeoutMs = lazy.headlessTimeoutMs;
            const timeoutId = lazy.setTimeout(() => {
              navigateEvent.finish({
                status: "error",
                errorName: "TimeoutError",
              });
              actorResolver.reject(
                new DOMException(
                  `The page did not load in a headless browser within ${timeoutMs}ms: ${url.href}`,
                  "TimeoutError"
                )
              );
            }, timeoutMs);

            let actor;
            try {
              actor = await actorResolver.promise;
            } finally {
              lazy.clearTimeout(timeoutId);
            }

            return callback(actor, traceId);
          },
          {
            // Create a custom message manager group for this browser so that the PageExtractor
            // actor can communicate with it. The actor is registered to use this custom
            // message manager group.
            messageManagerGroup: "headless-browsers",
          }
        );
      }
    );
  }
}
