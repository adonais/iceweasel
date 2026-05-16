/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionService:
    "moz-src:///toolkit/components/ipprotection/IPProtectionService.sys.mjs",
});
ChromeUtils.defineLazyGetter(
  lazy,
  "hiddenBrowserManager",
  () =>
    ChromeUtils.importESModule("resource://gre/modules/HiddenFrame.sys.mjs")
      .HiddenBrowserManager
);
ChromeUtils.defineLazyGetter(
  lazy,
  "JsonSchemaValidator",
  () =>
    ChromeUtils.importESModule(
      "resource://gre/modules/components-utils/JsonSchemaValidator.sys.mjs"
    ).JsonSchemaValidator
);
ChromeUtils.defineLazyGetter(lazy, "logConsole", () =>
  console.createInstance({
    prefix: "GuardianClient",
    maxLogLevel: Services.prefs.getBoolPref("browser.ipProtection.log", false)
      ? "Debug"
      : "Warn",
  })
);

if (Services.appinfo.processType !== Services.appinfo.PROCESS_TYPE_DEFAULT) {
  throw new Error("Guardian.sys.mjs should only run in the parent process");
}

export const GUARDIAN_EXPERIMENT_TYPE = "alpha";

/**
 * An HTTP Client to talk to the Guardian service.
 * Allows to enroll users to the proxy service,
 * fetch a proxy pass and check if the user is a proxy user.
 *
 */
export class GuardianClient {
  constructor() {
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "guardianEndpoint",
      "browser.ipProtection.guardian.endpoint",
      "https://vpn.mozilla.com"
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "fxaOrigin",
      "identity.fxaccounts.remote.root"
    );
  }
  /**
   * Tries to enroll the user to the proxy service via a hidden browser sign-in flow.
   * The FxA OAuth flow is completed silently using the existing FxA session cookies.
   * If the user already has a proxy entitlement, the experiment type will update.
   *
   * @param { "alpha" | "beta" | "delta" | "gamma" } aExperimentType - The experiment type to enroll the user into.
   * The experiment type controls which feature set the user will get in Firefox.
   *
   * @param { AbortSignal | null } aAbortSignal - An AbortSignal to cancel the operation.
   * @returns {Promise<{error?: string, ok?: boolean}>}
   */
  async enrollWithFxa(
    aExperimentType = GUARDIAN_EXPERIMENT_TYPE,
    aAbortSignal = null
  ) {
    // We abort loading the page if the origin is not allowed.
    const allowedOrigins = [
      new URL(this.guardianEndpoint).origin,
      new URL(this.fxaOrigin).origin,
    ];
    const { loginURL, successURL, errorURL } =
      this.enrollmentURLs(aExperimentType);
    // If the browser is redirected to one of those urls
    // we know we're done with the browser.
    const finalizerURLs = [successURL, errorURL];
    return await lazy.hiddenBrowserManager.withHiddenBrowser(async browser => {
      const aborted = new Promise((_, reject) => {
        aAbortSignal?.addEventListener("abort", () => {
          browser.stop();
          browser.remove();
          reject(new Error("aborted"));
        });
      });
      const finalEndpoint = waitUntilURL(browser, url => {
        const urlObj = new URL(url);
        if (url === "about:blank") {
          return false;
        }
        if (!allowedOrigins.includes(urlObj.origin)) {
          browser.stop();
          browser.remove();
          throw new Error(
            `URL ${url} with origin ${urlObj.origin} is not allowed.`
          );
        }
        if (
          finalizerURLs.some(
            finalizer =>
              urlObj.pathname === finalizer.pathname &&
              urlObj.origin === finalizer.origin
          )
        ) {
          return true;
        }
        return false;
      });
      const loginURI = Services.io.newURI(loginURL.href);
      if (!allowedOrigins.includes(loginURL.origin)) {
        throw new Error(`Login URL origin ${loginURL.origin} is not allowed.`);
      }
      browser.loadURI(loginURI, {
        triggeringPrincipal:
          Services.scriptSecurityManager.createContentPrincipal(loginURI, {}),
      });

      const result = await Promise.race([finalEndpoint, aborted]);
      return GuardianClient._parseGuardianSuccessURL(result);
    });
  }

  static _parseGuardianSuccessURL(aUrl) {
    if (!aUrl) {
      return { error: "timeout", ok: false };
    }
    const url = new URL(aUrl);
    const params = new URLSearchParams(url.search);
    const error = params.get("error");
    if (error) {
      return { error, ok: false };
    }
    // Otherwise we should have:
    // - a code in the URL query
    if (!params.has("code")) {
      return { error: "missing_code", ok: false };
    }
    return { ok: true };
  }

  /**
   * Fetches a proxy pass from the Guardian service.
   *
   * @param {AbortSignal} [abortSignal=null] - a signal to indicate the fetch should be aborted
   * @returns {Promise<{error?: string, status?:number, pass?: ProxyPass, usage?: ProxyUsage|null, retryAfter?: string|null}>} Resolves with an object containing either an error string or the proxy pass data and a status code.
   *
   * Return values:
   * - {pass, status, usage}: Success with proxy pass and optional usage info
   * - {error: "login_needed", usage: null}: No auth token available
   * - {status: 429, error: "quota_exceeded", usage, retryAfter}: Usage quota exceeded
   * - {status, error: "invalid_response", usage}: Invalid response from server
   * - {status, error: "parse_error", usage}: Failed to parse response
   *
   * Status codes to watch for:
   * - 200: User is a proxy user and a new pass was fetched
   * - 429: Usage quota exceeded
   * - 403: The auth token was valid but the user is not a proxy user.
   * - 401: The auth token was rejected.
   * - 5xx: Internal guardian error.
   */
  async fetchProxyPass(abortSignal = null) {
    using tokenHandle =
      await lazy.IPProtectionService.authProvider.getToken(abortSignal);
    const response = await fetch(this.#tokenURL, {
      method: "GET",
      cache: "no-cache",
      headers: {
        Authorization: `Bearer ${tokenHandle.token}`,
        "Content-Type": "application/json",
      },
      signal: abortSignal,
    });
    if (!response) {
      return { error: "login_needed", usage: null };
    }
    const status = response.status;

    let usage = null;
    try {
      usage = ProxyUsage.fromResponse(response);
    } catch (error) {
      lazy.logConsole.warn(
        "Usage headers missing or invalid, continuing without usage:",
        error
      );
    }

    if (status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      return {
        status,
        error: "quota_exceeded",
        usage,
        retryAfter,
      };
    }

    try {
      const pass = await ProxyPass.fromResponse(response);
      if (!pass) {
        return { status, error: "invalid_response", usage };
      }
      return { pass, status, usage };
    } catch (error) {
      lazy.logConsole.error("Error parsing pass:", error);
      return { status, error: "parse_error", usage };
    }
  }
  /**
   * Fetches the user's entitlement information.
   *
   * @param {AbortSignal} [abortSignal=null] - a signal to indicate the fetch should be aborted
   * @returns {Promise<{status?: number, entitlement?: Entitlement|null, error?:string}>} A promise that resolves to an object containing the HTTP status code and the user's entitlement information.
   *
   * Status codes to watch for:
   * - 200: User is a proxy user and the entitlement information is available.
   * - 404: User is not a proxy user, no entitlement information available.
   * - 401: The auth token was rejected, probably a guardian/auth provider environment mismatch.
   */
  async fetchUserInfo(abortSignal = null) {
    using tokenHandle =
      await lazy.IPProtectionService.authProvider.getToken(abortSignal);
    const response = await fetch(this.#statusURL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenHandle.token}`,
        "Content-Type": "application/json",
      },
      cache: "no-cache",
      signal: abortSignal,
    });
    if (!response) {
      return { error: "login_needed" };
    }
    const status = response.status;
    try {
      const entitlement = await Entitlement.fromResponse(response);
      if (!entitlement) {
        return { status, error: "parse_error" };
      }
      return {
        status,
        entitlement,
      };
    } catch (error) {
      return { status, error: "parse_error" };
    }
  }

  /**
   * Returns the user's proxy usage information, without fetching a new proxy pass.
   *
   * @param {AbortSignal} abortSignal - Signal for when this function should be aborted
   * @returns {ProxyUsage | null}
   */
  async fetchProxyUsage(abortSignal) {
    using tokenHandle =
      await lazy.IPProtectionService.authProvider.getToken(abortSignal);
    const response = await fetch(this.#tokenURL, {
      method: "HEAD",
      cache: "no-cache",
      signal: abortSignal,
      headers: {
        Authorization: `Bearer ${tokenHandle.token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response) {
      return null;
    }
    try {
      return ProxyUsage.fromResponse(response);
    } catch (error) {
      lazy.logConsole.warn(
        "Usage headers missing or invalid, continuing without usage:",
        error
      );
    }
    return null;
  }

  /** This is the URL that will be used to fetch the proxy pass. */
  get #tokenURL() {
    const url = new URL(this.guardianEndpoint);
    url.pathname = "/api/v1/fpn/token";
    return url;
  }
  /**
   * Returns the URLs needed to perform FxA enrollment with Guardian.
   *
   * @param {"alpha"|"beta"|"delta"|"gamma"} experimentType
   * @returns {{ loginURL: URL, successURL: URL, errorURL: URL }}
   */
  enrollmentURLs(experimentType = GUARDIAN_EXPERIMENT_TYPE) {
    const loginURL = new URL(this.guardianEndpoint);
    loginURL.pathname = "/api/v1/fpn/auth";
    loginURL.searchParams.set("experiment", experimentType);

    const successURL = new URL(this.guardianEndpoint);
    successURL.pathname = "/oauth/success";

    const errorURL = new URL(this.guardianEndpoint);
    errorURL.pathname = "/api/v1/fpn/error";

    return { loginURL, successURL, errorURL };
  }
  /** This is the URL that will be used to check the user's proxy status. */
  get #statusURL() {
    const url = new URL(this.guardianEndpoint);
    url.pathname = "/api/v1/fpn/status";
    return url;
  }
  guardianEndpoint = "";
}

/**
 * A ProxyPass contains a JWT token that can be used to authenticate the proxy service.
 * It also contains the timestamp until which the token is valid.
 * The Proxy will reject new connections if the token is not valid anymore.
 *
 * Immutable after creation.
 */
export class ProxyPass extends EventTarget {
  #body = {
    /** Not Before */
    nbf: 0,
    /** Expiration */
    exp: 0,
  };
  /**
   * @param {string} token - The JWT to use for authentication.
   */
  constructor(token) {
    super();
    if (typeof token !== "string") {
      throw new TypeError(
        "Invalid arguments for ProxyPass constructor, token is not a string"
      );
    }
    this.token = token;
    // Contains [header.body.signature]
    const parts = this.token.split(".");
    if (parts.length !== 3) {
      throw new TypeError("Invalid token format");
    }
    try {
      const body = JSON.parse(atob(parts[1]));
      if (
        !lazy.JsonSchemaValidator.validate(body, ProxyPass.bodySchema).valid
      ) {
        throw new TypeError("Token body does not match schema");
      }
      this.#body = body;
    } catch (error) {
      throw new TypeError("Invalid token format: " + error.message);
    }
  }

  isValid(now = Temporal.Now.instant()) {
    // If the remaining duration is zero or positive, the pass is still valid.
    return (
      Temporal.Instant.compare(now, this.from) >= 0 &&
      Temporal.Instant.compare(now, this.until) < 0
    );
  }

  shouldRotate(now = Temporal.Now.instant()) {
    if (!this.isValid(now)) {
      return true;
    }
    return Temporal.Instant.compare(now, this.rotationTimePoint) >= 0;
  }

  get from() {
    // nbf is in seconds since epoch
    return Temporal.Instant.fromEpochMilliseconds(this.#body.nbf * 1000);
  }

  get until() {
    // exp is in seconds since epoch
    return Temporal.Instant.fromEpochMilliseconds(this.#body.exp * 1000);
  }

  /**
   * Parses a ProxyPass from a Response object.
   *
   * @param {Response} response
   * @returns {Promise<ProxyPass|null>} A promise that resolves to a ProxyPass instance or null if the response is invalid.
   */
  static async fromResponse(response) {
    // if the response is not 200 return null
    if (!response.ok) {
      lazy.logConsole.error(
        `Failed to fetch proxy pass: ${response.status} ${response.statusText}`
      );
      return null;
    }

    try {
      // Parse JSON response
      const responseData = await response.json();
      const token = responseData?.token;

      if (!token || typeof token !== "string") {
        lazy.logConsole.error("Missing or invalid token in response");
        return null;
      }
      return new ProxyPass(token);
    } catch (error) {
      lazy.logConsole.error("Error parsing proxy pass response:", error);
      return null;
    }
  }
  /**
   * @type {Temporal.Instant} - The Point in time when the token should be rotated.
   */
  get rotationTimePoint() {
    return this.until.subtract(ProxyPass.ROTATION_TIME);
  }

  asBearerToken() {
    return `Bearer ${this.token}`;
  }
  // Rotate 2 Minutes from the End Time
  static ROTATION_TIME = Temporal.Duration.from({ minutes: 2 });

  static get bodySchema() {
    return {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "JWT Claims",
      type: "object",
      properties: {
        sub: {
          type: "string",
          description: "Subject identifier",
        },
        aud: {
          type: "string",
          format: "uri",
          description: "Audience for which the token is intended",
        },
        iat: {
          type: "integer",
          description: "Issued-at time (seconds since Unix epoch)",
        },
        nbf: {
          type: "integer",
          description: "Not-before time (seconds since Unix epoch)",
        },
        exp: {
          type: "integer",
          description: "Expiration time (seconds since Unix epoch)",
        },
        iss: {
          type: "string",
          description: "Issuer identifier",
        },
      },
      required: ["sub", "aud", "iat", "nbf", "exp", "iss"],
      additionalProperties: true,
    };
  }
}

/**
 * Represents a user's Entitlement for the Proxy Service of Guardian.
 * If a user has an entitlement, they may access the proxy service.
 *
 * Immutable after creation.
 */
export class Entitlement {
  /** True if the User has any valid subscription plan to the Mozilla VPN (not firefox VPN) */
  subscribed = false;
  /** The Guardian User ID */
  uid = 0;
  /** The maximum number of bytes allowed for the user */
  maxBytes = BigInt(0);

  constructor(
    args = {
      subscribed: false,
      uid: 0,
      maxBytes: "0",
    }
  ) {
    this.subscribed = args.subscribed;
    this.uid = args.uid;
    this.maxBytes = BigInt(args.maxBytes);
    Object.freeze(this);
  }
  static fromResponse(response) {
    // if the response is not 200 return null
    if (!response.ok) {
      return null;
    }
    return response.json().then(data => {
      const result = lazy.JsonSchemaValidator.validate(
        data,
        Entitlement.schema
      );
      if (!result.valid) {
        return null;
      }
      return new Entitlement(data);
    });
  }

  static get schema() {
    return {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "Entitlement",
      type: "object",
      properties: {
        subscribed: {
          type: "boolean",
        },
        uid: {
          type: "integer",
        },
        maxBytes: {
          type: "string",
          description:
            "A BigInt string representing the maximum number of bytes allowed for the user",
        },
      },
      required: ["subscribed", "uid", "maxBytes"],
      additionalProperties: true,
    };
  }

  toString() {
    return JSON.stringify({
      ...this,
      maxBytes: this.maxBytes.toString(),
    });
  }
}

/**
 * Represents usage tracking information for the Proxy Service.
 * Contains data about quota limits, remaining quota, and reset time.
 *
 * Immutable after creation.
 */
export class ProxyUsage {
  /** @type {bigint} - Maximum bytes allowed */
  max = BigInt(0);
  /** @type {bigint} - Remaining bytes available */
  remaining = BigInt(0);
  /** @type {Temporal.Instant} - When the usage quota resets */
  reset = null;

  /**
   * @param {string} max - Maximum bytes allowed (as string for BigInt parsing)
   * @param {string} remaining - Remaining bytes available (as string for BigInt parsing)
   * @param {string} reset - ISO 8601 timestamp when quota resets
   */
  constructor(max, remaining, reset) {
    this.max = BigInt(max);
    if (this.max < BigInt(0)) {
      throw new TypeError("max must be non-negative");
    }

    this.remaining = BigInt(remaining);
    if (this.remaining < BigInt(0)) {
      throw new TypeError("remaining must be non-negative");
    }

    if (this.remaining > this.max) {
      throw new TypeError("remaining cannot exceed max");
    }

    this.reset = Temporal.Instant.from(reset);

    Object.freeze(this);
  }

  static fromResponse(response) {
    const getOrThrow = headerName => {
      const value = response.headers.get(headerName);
      if (!value) {
        throw new TypeError(`Missing required header: ${headerName}`);
      }
      return value;
    };

    const quotaLimit = getOrThrow("X-Quota-Limit");
    const quotaRemaining = getOrThrow("X-Quota-Remaining");
    const quotaReset = getOrThrow("X-Quota-Reset");

    return new ProxyUsage(quotaLimit, quotaRemaining, quotaReset);
  }
}

/**
 * Adds a strong reference to keep listeners alive until
 * we're done with it.
 * (From kungFuDeathGrip in XPCShellContentUtils.sys.mjs)
 */
const listeners = new Set();

/**
 * Waits for a specific URL to be loaded in the browser.
 *
 * @param {*} browser - The browser instance to listen for URL changes.
 * @param {(location: string) => boolean} predicate - A function that returns true if the location matches the desired URL.
 * @returns {Promise<string>} A promise that resolves to the matching URL.
 */
async function waitUntilURL(browser, predicate) {
  const prom = Promise.withResolvers();
  let done = false;
  const check = arg => {
    if (done) {
      return;
    }
    if (predicate(arg)) {
      done = true;
      listeners.delete(listener);
      browser.removeProgressListener(listener);
      prom.resolve(arg);
    }
  };
  const listener = {
    QueryInterface: ChromeUtils.generateQI([
      "nsIWebProgressListener",
      "nsISupportsWeakReference",
    ]),

    // Runs the check after the document has stopped loading.
    onStateChange(webProgress, request, stateFlags, status) {
      request.QueryInterface(Ci.nsIChannel);

      if (
        webProgress.isTopLevel &&
        stateFlags & Ci.nsIWebProgressListener.STATE_STOP &&
        status !== Cr.NS_BINDING_ABORTED
      ) {
        check(request.URI?.spec);
      }
    },

    // Unused callbacks we still need to implement:
    onLocationChange() {},
    onProgressChange() {},
    onStatusChange(_, request, status) {
      if (Components.isSuccessCode(status)) {
        return;
      }
      try {
        const url = request.QueryInterface(Ci.nsIChannel).URI.spec;
        check(url);
      } catch (ex) {}
    },
    onSecurityChange() {},
    onContentBlockingEvent() {},
  };
  listeners.add(listener);
  browser.addProgressListener(listener, Ci.nsIWebProgress.NOTIFY_STATE_WINDOW);
  const url = await prom.promise;
  return url;
}
