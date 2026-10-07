/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SiteRuleManager } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPPSiteRuleManager.sys.mjs"
);
const { SiteRuleProvider } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPPSiteRuleProviders.sys.mjs"
);

const RULE_CHANGED_EVENT = "SiteRuleManager:RuleChanged";

const PRINCIPAL = Services.scriptSecurityManager.createContentPrincipal(
  Services.io.newURI("https://example.com"),
  {}
);

/**
 * A provider with a fixed answer (null to abstain, or throws instead) that
 * counts how often it was asked, so a test can prove precedence
 * short-circuits rather than just picking the winner.
 */
class TestProvider extends SiteRuleProvider {
  calls = 0;
  inits = 0;
  uninits = 0;

  constructor({
    rule = null,
    writable = false,
    throws = false,
    throwsOnInit = false,
  } = {}) {
    super();
    this.rule = rule;
    this.writable = writable;
    this.throws = throws;
    this.throwsOnInit = throwsOnInit;
  }

  init() {
    this.inits++;
    if (this.throwsOnInit) {
      throw new Error("boom");
    }
  }

  uninit() {
    this.uninits++;
  }

  getRule() {
    this.calls++;
    if (this.throws) {
      throw new Error("boom");
    }
    return this.rule;
  }

  canSet(principal) {
    return this.writable && !!principal;
  }
}

const managerOf = (...providers) => new SiteRuleManager(providers);
const abstaining = () => new TestProvider();
const writable = () => new TestProvider({ writable: true });

/**
 * The array order is the precedence: the first provider with an opinion wins,
 * the ones after it are never asked, and one that abstains defers to the next.
 */
add_task(function test_precedence() {
  const secondary = new TestProvider({ rule: "two" });
  const opinionated = new TestProvider({ rule: "one" });
  Assert.equal(
    managerOf(opinionated, secondary).getRule(PRINCIPAL),
    "one",
    "the first opinion wins"
  );
  Assert.equal(secondary.calls, 0, "a lower-precedence provider is not asked");

  const abstains = abstaining();
  Assert.equal(
    managerOf(abstains, secondary).getRule(PRINCIPAL),
    "two",
    "an abstaining provider defers to the next"
  );
  Assert.equal(abstains.calls, 1, "the abstaining provider was still asked");

  Assert.equal(
    managerOf(abstaining()).getRule(PRINCIPAL),
    null,
    "nobody with an opinion -> no rule"
  );
});

/**
 * A throwing provider does not propagate: the manager fails closed so that a
 * broken provider cannot leak traffic onto the proxy.
 */
add_task(function test_fails_closed_on_throw() {
  const failing = managerOf(new TestProvider({ throws: true }));

  Assert.equal(
    failing.getRule(PRINCIPAL),
    IPPPrincipalRules.EXCLUDED,
    "a throw fails closed to EXCLUDED"
  );
  Assert.ok(!failing.canManage(PRINCIPAL), "a throw makes canManage false");
});

/**
 * Providers fall back to a safe state themselves, so a throw from init is a
 * bug; the chain still inits around it rather than losing every provider after
 * the failing one.
 */
add_task(function test_init_survives_a_throwing_provider() {
  const failing = new TestProvider({ throwsOnInit: true });
  const next = abstaining();

  managerOf(failing, next).init();

  Assert.equal(next.inits, 1, "a provider after a failing one still inits");
  Assert.equal(failing.uninits, 1, "the failing provider is reset");
});

/**
 * canManage walks the same ordered array as getRule: true once the writable
 * provider is reached, false when a higher-precedence provider already claimed
 * the principal, since a rule stored below it would be masked. The writable
 * provider's own opinion does not count as masking, so a site the user has
 * already set stays toggleable.
 */
add_task(function test_canManage() {
  const pinned = new TestProvider({ rule: "pinned" });
  const alreadySet = new TestProvider({ rule: "excluded", writable: true });

  Assert.ok(
    managerOf(abstaining(), writable()).canManage(PRINCIPAL),
    "the writable provider is reachable when nobody claims the principal"
  );
  Assert.ok(
    !managerOf(pinned, writable()).canManage(PRINCIPAL),
    "a higher-precedence opinion makes the principal unmanageable"
  );
  Assert.ok(
    !managerOf(abstaining()).canManage(PRINCIPAL),
    "no writable provider -> not manageable"
  );
  Assert.ok(
    managerOf(alreadySet).canManage(PRINCIPAL),
    "the writable provider's own opinion does not block a write to itself"
  );
});

/**
 * Provider changes reach consumers as one manager event, and stop once the
 * manager is uninited.
 */
add_task(async function test_change_events_are_aggregated() {
  const providers = [abstaining(), abstaining()];
  const aggregating = managerOf(...providers);
  aggregating.init();

  for (const provider of providers) {
    const changed = waitForEvent(aggregating, RULE_CHANGED_EVENT);
    provider.notifyChange();
    await changed;
    Assert.ok(true, "a provider change reaches consumers");
  }

  aggregating.uninit();

  let seen = 0;
  aggregating.addEventListener(RULE_CHANGED_EVENT, () => seen++);
  providers[0].notifyChange();
  Assert.equal(seen, 0, "an uninited manager stops forwarding changes");
});

/**
 * Lifecycle calls reach every provider exactly once, so repeated init cannot
 * double-register observers, and the first read inits the manager so a caller
 * on the channel path never sees a provider with unbuilt state.
 */
add_task(function test_lifecycle() {
  const provider = abstaining();
  const cycled = managerOf(provider);

  cycled.init();
  cycled.init();
  Assert.equal(provider.inits, 1, "init is forwarded exactly once");

  cycled.uninit();
  cycled.uninit();
  Assert.equal(provider.uninits, 1, "uninit is forwarded exactly once");

  const read = abstaining();
  managerOf(read).getRule(PRINCIPAL);
  Assert.equal(read.inits, 1, "getRule inits the manager");

  const managed = abstaining();
  managerOf(managed).canManage(PRINCIPAL);
  Assert.equal(managed.inits, 1, "canManage inits the manager");
});

/**
 * The base class is a usable no-op: it abstains, refuses writes, and refuses to
 * pretend a write happened.
 */
add_task(function test_base_class_defaults() {
  const base = new SiteRuleProvider();

  Assert.equal(base.getRule(PRINCIPAL), null, "the base class abstains");
  Assert.ok(!base.canSet(PRINCIPAL), "the base class is read-only");
  Assert.throws(
    () => base.setRule(PRINCIPAL, "rule"),
    /setRule\(\) must be implemented/,
    "setRule must be overridden to write"
  );
});
