/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const ETLD_CONTRACT_ID = "@mozilla.org/network/effective-tld-service;1";

function run_test() {
  // The effective TLD service is a singleton, so createInstance is not allowed
  // on it: it must be accessed via the service getters.
  Assert.throws(
    () => Cc[ETLD_CONTRACT_ID].createInstance(Ci.nsIEffectiveTLDService),
    e => e.result == Cr.NS_ERROR_XPC_CI_RETURNED_FAILURE,
    "createInstance should throw for a singleton component"
  );

  // Check that the service getters all return the same object.
  // eslint-disable-next-line mozilla/use-services
  let etld = Cc[ETLD_CONTRACT_ID].getService(Ci.nsIEffectiveTLDService);

  Assert.equal(etld, Services.eTLD, "getService returns the singleton");

  // For backwards compatibility reasons, we allow calling createInstance for
  // the system principal, so it should not throw.
  let principal = Cc["@mozilla.org/systemprincipal;1"].createInstance(
    Ci.nsIPrincipal
  );
  Assert.notEqual(principal, undefined);
}
