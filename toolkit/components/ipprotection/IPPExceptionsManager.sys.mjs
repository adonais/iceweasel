/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionService:
    "moz-src:///toolkit/components/ipprotection/IPProtectionService.sys.mjs",
});

const PERM_NAME = "ipp-vpn";

const INCLUSION_PREF = "browser.ipProtection.inclusion.match_patterns";

const MATCH_PATTERN_OPTIONS = {
  ignorePath: true,
  restrictSchemes: false,
};

const DEFAULT_EXCLUDED_URL_PREFS = [
  "browser.ipProtection.guardian.endpoint",
  "captivedetect.canonicalURL",
];

/**
 * Converts an excluded page URL to a host match pattern (scheme://host/*), or
 * null if the URL cannot be parsed.
 *
 * @param {string} url
 * @returns {?string}
 */
function urlToHostPattern(url) {
  try {
    const uri = Services.io.newURI(url);
    return `${uri.scheme}://${uri.host}/*`;
  } catch (_) {
    return null;
  }
}

/** @typedef {"included"|"excluded"|"default"} IPPPrincipalRule */
export const IPPPrincipalRules = Object.freeze({
  INCLUDED: "included",
  EXCLUDED: "excluded",
  DEFAULT: "default",
});

/**
 * Manages site exceptions for IP Protection.
 * It communicates with Services.perms to update the ipp-vpn permission type.
 * Site exclusions are marked as permissions with DENY capabilities.
 *
 * While permissions related UI (eg. panels and dialogs) already handle changes to ipp-vpn,
 * the intention of this class is to abstract methods for updating ipp-vpn as needed
 * from other non-permissions related UI.
 *
 * This is also the single source of truth for classifying a principal as
 * included/excluded/default for the proxy, via getPrincipalRule. It owns the
 * inclusion MatchPatternSet (from INCLUSION_PREF) and the excluded-origins
 * MatchPatternSet (from the default-excluded prefs + authProvider.excludedUrlPrefs),
 * both kept up to date via pref observers while inited.
 */
class ExceptionsManager extends EventTarget {
  #inited = false;
  #observer = null;
  #inclusionPrefObserver = null;
  #inclusionSet = new MatchPatternSet([], MATCH_PATTERN_OPTIONS);
  #excludedOrigins = new MatchPatternSet([], MATCH_PATTERN_OPTIONS);
  #excludedPrefObserver = null;
  #observedExcludedPrefs = [];

  init() {
    if (this.#inited) {
      return;
    }

    // ES6 classes that extend EventTarget cannot be coerced into nsIObserver.
    // Work around this by using a function as the observer.
    this.#observer = (subject, topic, data) => {
      this.observe(subject, topic, data);
    };
    Services.obs.addObserver(this.#observer, "perm-changed");

    this.#inclusionSet = ExceptionsManager.getInclusionList();
    this.#inclusionPrefObserver = () => {
      this.#inclusionSet = ExceptionsManager.getInclusionList();
    };
    Services.prefs.addObserver(INCLUSION_PREF, this.#inclusionPrefObserver);

    // The excluded origins come from the default-excluded prefs plus the active
    // auth provider's prefs; observe each so the set stays current.
    this.#observedExcludedPrefs = [
      ...DEFAULT_EXCLUDED_URL_PREFS,
      ...(lazy.IPProtectionService.authProvider?.excludedUrlPrefs ?? []),
    ];
    this.#excludedPrefObserver = () => this.#rebuildExcludedOrigins();
    for (const pref of this.#observedExcludedPrefs) {
      Services.prefs.addObserver(pref, this.#excludedPrefObserver);
    }
    this.#rebuildExcludedOrigins();

    this.#inited = true;
  }

  uninit() {
    if (!this.#inited) {
      return;
    }

    Services.obs.removeObserver(this.#observer, "perm-changed");
    this.#observer = null;

    if (this.#inclusionPrefObserver) {
      Services.prefs.removeObserver(
        INCLUSION_PREF,
        this.#inclusionPrefObserver
      );
      this.#inclusionPrefObserver = null;
    }

    if (this.#excludedPrefObserver) {
      for (const pref of this.#observedExcludedPrefs) {
        Services.prefs.removeObserver(pref, this.#excludedPrefObserver);
      }
      this.#excludedPrefObserver = null;
      this.#observedExcludedPrefs = [];
    }

    this.#inited = false;
  }

  /**
   * Rebuilds the excluded-origins MatchPatternSet from the observed prefs
   * (default-excluded prefs + the active auth provider's prefs).
   */
  #rebuildExcludedOrigins() {
    const patterns = [];
    for (const pref of this.#observedExcludedPrefs) {
      const pattern = urlToHostPattern(Services.prefs.getStringPref(pref, ""));
      if (pattern) {
        patterns.push(pattern);
      }
    }
    this.#excludedOrigins = new MatchPatternSet(
      patterns,
      MATCH_PATTERN_OPTIONS
    );
  }

  observe(subject, topic, data) {
    if (topic !== "perm-changed") {
      return;
    }

    let permission = subject.QueryInterface(Ci.nsIPermission);
    if (permission.type !== PERM_NAME) {
      return;
    }

    const isExclusion =
      permission.capability === Ci.nsIPermissionManager.DENY_ACTION;
    const added = data === "added" && isExclusion;
    const removed = data === "deleted" && isExclusion;

    if (added || removed) {
      if (added) {
        Glean.ipprotection.exclusionAdded.add(1);
      }

      this.dispatchEvent(
        new CustomEvent("IPPExceptionsManager:ExclusionChanged")
      );
    }
  }

  /**
   * Adds a principal to ipp-vpn with capability DENY_ACTION
   * for site exclusions.
   *
   * @param {nsIPrincipal} principal
   *  The principal that we want to add as a site exception.
   */
  addExclusion(principal) {
    Services.perms.addFromPrincipal(
      principal,
      PERM_NAME,
      Ci.nsIPermissionManager.DENY_ACTION
    );
  }

  /**
   * Removes an existing principal from ipp-vpn.
   *
   * @param {nsIPrincipal} principal
   *  The principal that we want to remove as a site exception.
   */
  removeExclusion(principal) {
    Services.perms.removeFromPrincipal(principal, PERM_NAME);
  }

  /**
   * Returns true if the principal already exists in ipp-vpn
   * and is registered as a permission with a DENY_ACTION
   * capability (site exclusions).
   * Else returns false if no such principal exists.
   *
   * @param {nsIPrincipal} principal
   *  The principal that we want to check is saved in ipp-vpn
   *  as a site exclusion.
   * @returns {boolean}
   *  True if the principal exists as a site exclusion.
   */
  hasExclusion(principal) {
    let permission = this.getExceptionPermissionObject(principal);
    return permission?.capability === Ci.nsIPermissionManager.DENY_ACTION;
  }

  /**
   * Get the permission object for a site exception if it exists in ipp-vpn.
   *
   * Use exactHost=true to only match the specific origin, not the base domain.
   * This ensures that subdomains aren't implicitly excluded when entering
   * a site in the about:preferences dialog. It also avoids an issue where we
   * try to remove a subdomain as an exclusion when the site doesn't exist in ipp-vpn
   * (see Bug 2016676).
   *
   * Eg. if we enter "example.com" in the dialog, "www.example.com" and
   * "subdomain.example.com" won't be considered exclusions.
   *
   * @param {nsIPrincipal} principal
   *  The principal that we want to check is saved in ipp-vpn.
   *
   * @returns {nsIPermission}
   *  The permission object for a site exception, or null if unavailable.
   */
  getExceptionPermissionObject(principal) {
    let permissionObject = Services.perms.getPermissionObject(
      principal,
      PERM_NAME,
      true /* exactHost */
    );
    return permissionObject;
  }

  /**
   * Gets the total number of site exclusions added to ipp-vpn.
   *
   * @returns {number}
   *  The count of site exclusions in ipp-vpn.
   */
  getExclusionCount() {
    let count = 0;
    for (let perm of Services.perms.getAllByTypes([PERM_NAME])) {
      if (perm.capability === Ci.nsIPermissionManager.DENY_ACTION) {
        count++;
      }
    }
    return count;
  }

  /**
   * Sets the given principal as an exclusion or non exclusion.
   *
   * @param {nsIPrincipal} principal
   *  The principal we want to update for the exclusion state.
   * @param {boolean} shouldExclude
   *  True to set the principal as an exclusion. Otherwise false.
   *
   * @example
   * // Assuming the principal represents a site https://www.example.com,
   * // this line sets https://www.example.com as an exclusion
   * // in ipp-vpn.
   * IPPExceptionsManager.setExclusion(nsIPrincipal, true);
   */
  setExclusion(principal, shouldExclude) {
    if (!principal) {
      return;
    }

    const isExclusion = this.hasExclusion(principal);

    // Early return if already in desired state
    if ((shouldExclude && isExclusion) || (!shouldExclude && !isExclusion)) {
      return;
    }

    if (shouldExclude) {
      this.addExclusion(principal);
    } else {
      this.removeExclusion(principal);
    }
  }

  /**
   * Builds the inclusion MatchPatternSet from INCLUSION_PREF.
   *
   * @returns {MatchPatternSet}
   */
  static getInclusionList() {
    let raw = Services.prefs.getStringPref(INCLUSION_PREF, "[]");
    let arr = JSON.parse(raw);
    if (!Array.isArray(arr)) {
      throw new TypeError(`${INCLUSION_PREF} does not contain a JSON array`);
    }
    let patterns = arr.filter(s => typeof s === "string" && s.length);
    return new MatchPatternSet(patterns, MATCH_PATTERN_OPTIONS);
  }

  /**
   * @param {nsIPrincipal} principal
   * @returns {boolean} True if the principal is a loopback host or a local IP.
   */
  static isLocal(principal) {
    return principal.isLoopbackHost || principal.isLocalIpAddress;
  }

  /**
   * Classifies a principal as included/excluded/default for the proxy.
   *
   * This is the single source of truth shared by the channel filter and the UI.
   * Everything is derived from the principal: the inclusion match (its URI),
   * scheme, loopback/local, the ipp-vpn user permission, and the default
   * excluded origins. Fails safe to EXCLUDED on any error.
   *
   * @param {nsIPrincipal} principal
   * @returns {IPPPrincipalRule}
   */
  getPrincipalRule(principal) {
    if (!this.#inited) {
      this.init();
    }
    try {
      const uri = principal?.URI;
      // Exclude non-http(s) schemes (about:, file:, etc.), but NOT null
      // principals: a null principal's scheme is moz-nullprincipal even when it
      // backs real http(s) content (e.g. a sandboxed iframe), so its scheme says
      // nothing about whether the traffic should be proxied.
      if (
        !principal?.isNullPrincipal &&
        !principal?.schemeIs("http") &&
        !principal?.schemeIs("https")
      ) {
        return IPPPrincipalRules.EXCLUDED;
      }
      if (ExceptionsManager.isLocal(principal)) {
        return IPPPrincipalRules.EXCLUDED;
      }
      // Infrastructure origins the VPN itself depends on (guardian endpoint,
      // captive detection). These must beat inclusion.
      if (uri && this.#excludedOrigins.matches(uri)) {
        return IPPPrincipalRules.EXCLUDED;
      }
      if (uri && this.#inclusionSet.matches(uri)) {
        return IPPPrincipalRules.INCLUDED;
      }
      if (this.hasExclusion(principal)) {
        return IPPPrincipalRules.EXCLUDED;
      }
      return IPPPrincipalRules.DEFAULT;
    } catch (_) {
      return IPPPrincipalRules.EXCLUDED;
    }
  }

  /**
   * Whether the user can manage a VPN site exclusion for this principal — i.e.
   * it is a normal content page, not an about: page or the system principal.
   *
   * @param {nsIPrincipal} principal
   *  The principal to evaluate.
   * @returns {boolean}
   *  True if the user can manage an exclusion for this page.
   */
  canManage(principal) {
    if (!principal) {
      return false;
    }
    // about:/chrome:/resource: pages and the system principal are not
    // user-manageable sites. The chrome: check matters because the UI derives
    // this principal from the URL bar URI via createContentPrincipal, which
    // yields a chrome-scoped content principal rather than the system principal
    // gBrowser.contentPrincipal used to surface. Loopback/local hosts are
    // always excluded by the proxy so the user cannot toggle them either.
    return (
      !principal.schemeIs("about") &&
      !principal.schemeIs("chrome") &&
      !principal.schemeIs("resource") &&
      !principal.isSystemPrincipal &&
      !ExceptionsManager.isLocal(principal)
    );
  }
}

const IPPExceptionsManager = new ExceptionsManager();
export { IPPExceptionsManager };
