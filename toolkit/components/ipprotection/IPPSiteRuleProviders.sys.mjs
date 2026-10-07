/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionService:
    "moz-src:///toolkit/components/ipprotection/IPProtectionService.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "logConsole", () =>
  console.createInstance({
    prefix: "IPP_SiteRuleProviders",
    maxLogLevel: Services.prefs.getBoolPref("browser.ipProtection.log", false)
      ? "Debug"
      : "Warn",
  })
);

const MATCH_PATTERN_OPTIONS = {
  ignorePath: true,
  restrictSchemes: false,
};

/** @typedef {"included"|"excluded"|null} IPPPrincipalRule */

/**
 * DEFAULT is null because that is what a SiteRuleManager returns when no
 * provider claimed the principal.
 */
export const IPPPrincipalRules = Object.freeze({
  INCLUDED: "included",
  EXCLUDED: "excluded",
  DEFAULT: null,
});

/**
 * Base class for site rule providers.
 *
 * A provider answers "which rule applies to this principal?" for exactly one
 * source of truth, so that adding a new source is adding a new subclass rather
 * than another branch in a shared if-chain.
 *
 * Subclasses override what they need. The defaults are safe no-ops: no opinion
 * and no writes. A provider that stores rules also overrides canSet and
 * setRule.
 *
 * Providers call notifyChange when their underlying data changes; the manager
 * listens for that and re-dispatches a single SiteRuleManager:RuleChanged to
 * consumers, so nothing outside has to subscribe to providers individually.
 */
export class SiteRuleProvider extends EventTarget {
  /**
   * Registers observers and builds any cached state. Called by the manager.
   */
  init() {}

  uninit() {}

  /**
   * This provider's opinion for a principal.
   *
   * @param {?nsIPrincipal} _principal
   * @returns {?string}
   *  The rule, or null for "no opinion, ask the next provider".
   */
  getRule(_principal) {
    return null;
  }

  /**
   * Whether a user-initiated write for this principal would be stored here.
   * Read-only providers keep the default.
   *
   * @param {?nsIPrincipal} _principal
   * @returns {boolean}
   */
  canSet(_principal) {
    return false;
  }

  /**
   * Stores a rule for a principal, or clears it when rule is null.
   *
   * @param {nsIPrincipal} _principal
   * @param {?string} _rule
   */
  setRule(_principal, _rule) {
    throw new Error("setRule() must be implemented by writable subclasses");
  }

  /**
   * Tells the manager this provider's underlying data changed.
   */
  notifyChange() {
    this.dispatchEvent(new CustomEvent("change"));
  }
}

/**
 * Traffic that can never be proxied, whatever the user or the lists say.
 */
export class IPPProxyableRuleProvider extends SiteRuleProvider {
  getRule(principal) {
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
    if (principal.isLoopbackHost || principal.isLocalIpAddress) {
      return IPPPrincipalRules.EXCLUDED;
    }
    return null;
  }
}

/**
 * Origins the VPN itself depends on (the guardian endpoint, captive portal
 * detection). Proxying these would break the VPN, so they beat inclusions.
 */
export class IPPInfrastructureRuleProvider extends SiteRuleProvider {
  static #DEFAULT_URL_PREFS = [
    "browser.ipProtection.guardian.endpoint",
    "captivedetect.canonicalURL",
  ];

  #origins = new MatchPatternSet([], MATCH_PATTERN_OPTIONS);
  #observedPrefs = [];
  #prefObserver = null;

  init() {
    // The excluded origins come from the default-excluded prefs plus the active
    // auth provider's prefs; observe each so the set stays current.
    this.#observedPrefs = [
      ...IPPInfrastructureRuleProvider.#DEFAULT_URL_PREFS,
      ...IPPInfrastructureRuleProvider.#authProviderPrefs(),
    ];
    this.#prefObserver = () => {
      this.#rebuild();
      this.notifyChange();
    };
    for (const pref of this.#observedPrefs) {
      Services.prefs.addObserver(pref, this.#prefObserver);
    }
    this.#rebuild();
  }

  uninit() {
    if (!this.#prefObserver) {
      return;
    }
    for (const pref of this.#observedPrefs) {
      Services.prefs.removeObserver(pref, this.#prefObserver);
    }
    this.#prefObserver = null;
    this.#observedPrefs = [];
  }

  getRule(principal) {
    const uri = principal?.URI;
    if (uri && this.#origins.matches(uri)) {
      return IPPPrincipalRules.EXCLUDED;
    }
    return null;
  }

  #rebuild() {
    const patterns = [];
    for (const pref of this.#observedPrefs) {
      const pattern = IPPInfrastructureRuleProvider.#toHostPattern(pref);
      if (pattern) {
        patterns.push(pattern);
      }
    }
    try {
      this.#origins = new MatchPatternSet(patterns, MATCH_PATTERN_OPTIONS);
    } catch (error) {
      // Keep the origins we already had: dropping an infrastructure exclusion
      // would send the VPN's own traffic through the proxy.
      lazy.logConsole.error("Cannot build the infrastructure origins:", error);
      Glean.ipprotection.error.record({
        source: "IPPInfrastructureRuleProvider:Origins",
      });
    }
  }

  /**
   * The active auth provider's excluded prefs, or an empty list if it has none
   * or cannot be reached.
   *
   * @returns {string[]}
   */
  static #authProviderPrefs() {
    try {
      const prefs = lazy.IPProtectionService.authProvider?.excludedUrlPrefs;
      return Array.isArray(prefs) ? prefs : [];
    } catch (error) {
      lazy.logConsole.error("Cannot read the auth provider's prefs:", error);
      Glean.ipprotection.error.record({
        source: "IPPInfrastructureRuleProvider:AuthProviderPrefs",
      });
      return [];
    }
  }

  /**
   * Converts the excluded page URL held by a pref to a host match pattern
   * (scheme://host/*), or null if the pref cannot be read or parsed.
   *
   * @param {string} pref
   * @returns {?string}
   */
  static #toHostPattern(pref) {
    try {
      const uri = Services.io.newURI(Services.prefs.getStringPref(pref, ""));
      return `${uri.scheme}://${uri.host}/*`;
    } catch (_) {
      return null;
    }
  }
}

/**
 * Applies one rule to every origin matching a MatchPatternSet, read from a
 * pref holding a JSON array of match patterns. Used for remotely controlled
 * lists, where the set changes without a restart.
 */
export class MatchPatternPrefRule extends SiteRuleProvider {
  #pref;
  #rule;
  #patterns = new MatchPatternSet([], MATCH_PATTERN_OPTIONS);
  #prefObserver = null;

  /**
   * @param {string} pref
   *  Pref holding a JSON array of match pattern strings.
   * @param {string} rule
   *  The rule to apply to a principal the patterns match.
   */
  constructor(pref, rule) {
    super();
    this.#pref = pref;
    this.#rule = rule;
  }

  init() {
    this.#prefObserver = () => {
      this.#rebuild();
      this.notifyChange();
    };
    Services.prefs.addObserver(this.#pref, this.#prefObserver);
    this.#rebuild();
  }

  uninit() {
    if (!this.#prefObserver) {
      return;
    }
    Services.prefs.removeObserver(this.#pref, this.#prefObserver);
    this.#prefObserver = null;
  }

  getRule(principal) {
    const uri = principal?.URI;
    if (uri && this.#patterns.matches(uri)) {
      return this.#rule;
    }
    return null;
  }

  #rebuild() {
    try {
      let arr = JSON.parse(Services.prefs.getStringPref(this.#pref, "[]"));
      if (!Array.isArray(arr)) {
        throw new TypeError(`${this.#pref} does not contain a JSON array`);
      }
      let patterns = arr.filter(s => typeof s === "string" && s.length);
      this.#patterns = new MatchPatternSet(patterns, MATCH_PATTERN_OPTIONS);
    } catch (error) {
      // An unreadable list means no opinion rather than a provider that cannot
      // init. The pref observer stays registered, so a later good value applies.
      this.#patterns = new MatchPatternSet([], MATCH_PATTERN_OPTIONS);
      lazy.logConsole.error(`Cannot read ${this.#pref}:`, error);
      Glean.ipprotection.error.record({
        source: "MatchPatternPrefRule:BadPref",
      });
    }
  }
}

/**
 * The user's own per-site choice, stored in the ipp-vpn permission type:
 * ALLOW for inclusions, DENY for exclusions. A site holds at most one of the
 * two, because addFromPrincipal replaces any existing ipp-vpn permission for
 * the principal.
 *
 * This is the only writable provider. Permissions related UI (eg. panels and
 * dialogs) already handles changes to ipp-vpn; this class exists so that
 * non-permissions related UI can update it too.
 */
export class IPPPermissionRuleProvider extends SiteRuleProvider {
  static #PERM_NAME = "ipp-vpn";

  #observer = null;

  init() {
    // ES6 classes that extend EventTarget cannot be coerced into nsIObserver.
    // Work around this by using a function as the observer.
    this.#observer = (subject, topic, data) => {
      this.observe(subject, topic, data);
    };
    Services.obs.addObserver(this.#observer, "perm-changed");
  }

  uninit() {
    if (!this.#observer) {
      return;
    }
    Services.obs.removeObserver(this.#observer, "perm-changed");
    this.#observer = null;
  }

  observe(subject, topic, data) {
    if (topic !== "perm-changed") {
      return;
    }

    let permission = subject.QueryInterface(Ci.nsIPermission);
    if (permission.type !== IPPPermissionRuleProvider.#PERM_NAME) {
      return;
    }

    if (data !== "added" && data !== "deleted" && data !== "changed") {
      return;
    }

    // "changed" carries the new permission, so replacing an exclusion with an
    // inclusion (or the reverse) is reported under the new capability.
    if (
      data === "added" &&
      permission.capability === Ci.nsIPermissionManager.DENY_ACTION
    ) {
      Glean.ipprotection.exclusionAdded.add(1);
    }

    this.notifyChange();
  }

  getRule(principal) {
    return this.#ruleForCapability(
      this.getPermissionObject(principal)?.capability
    );
  }

  canSet(principal) {
    // Whether a write is worth making is the manager's call: it knows if a
    // higher-precedence provider would mask it. Here we only need a principal
    // to hang the permission on.
    return !!principal;
  }

  setRule(principal, rule) {
    if (!principal || rule === this.getRule(principal)) {
      return;
    }

    if (rule === IPPPrincipalRules.DEFAULT) {
      Services.perms.removeFromPrincipal(
        principal,
        IPPPermissionRuleProvider.#PERM_NAME
      );
      return;
    }

    Services.perms.addFromPrincipal(
      principal,
      IPPPermissionRuleProvider.#PERM_NAME,
      rule === IPPPrincipalRules.INCLUDED
        ? Ci.nsIPermissionManager.ALLOW_ACTION
        : Ci.nsIPermissionManager.DENY_ACTION
    );
  }

  /**
   * How many sites are stored with the given rule.
   *
   * @param {?string} rule
   * @returns {number}
   */
  count(rule) {
    let count = 0;
    for (let perm of Services.perms.getAllByTypes([
      IPPPermissionRuleProvider.#PERM_NAME,
    ])) {
      if (this.#ruleForCapability(perm.capability) === rule) {
        count++;
      }
    }
    return count;
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
  getPermissionObject(principal) {
    let permissionObject = Services.perms.getPermissionObject(
      principal,
      IPPPermissionRuleProvider.#PERM_NAME,
      true /* exactHost */
    );
    return permissionObject;
  }

  #ruleForCapability(capability) {
    switch (capability) {
      case Ci.nsIPermissionManager.ALLOW_ACTION:
        return IPPPrincipalRules.INCLUDED;
      case Ci.nsIPermissionManager.DENY_ACTION:
        return IPPPrincipalRules.EXCLUDED;
      default:
        return IPPPrincipalRules.DEFAULT;
    }
  }
}
