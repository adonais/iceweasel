/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

// XPCNativeSet stores its interface count in a uint16_t and always holds
// nsISupports in addition to the interfaces nsIClassInfo reports, so the
// longest list a JS-implemented nsIClassInfo may return is UINT16_MAX - 1.
const MAX_INTERFACES = 65534;

function registerClassInfo(uuid, interfaceCount) {
  const classID = Components.ID(uuid);
  const contractID = `@mozilla.org/test/classinfo/${uuid};1`;

  const instance = {
    QueryInterface: ChromeUtils.generateQI([
      "nsIObserver",
      "nsINamed",
      "nsIClassInfo",
    ]),

    interfaces: new Array(interfaceCount).fill(Ci.nsIObserver),
    contractID,
    classDescription: "test class info",
    classID,
    flags: 0,

    name: "test class info",
    observe() {},
  };

  Components.manager
    .QueryInterface(Ci.nsIComponentRegistrar)
    .registerFactory(classID, instance.classDescription, contractID, {
      createInstance(iid) {
        return instance.QueryInterface(iid);
      },
    });

  return contractID;
}

add_task(function test_interface_count_above_maximum() {
  const contractID = registerClassInfo(
    "8c2f741c-25d4-4c55-b888-ee0bd8b71aee",
    MAX_INTERFACES + 2
  );

  Assert.throws(
    () => Cc[contractID].createInstance(Ci.nsIObserver),
    /NS_ERROR_XPC_CANT_CREATE_WN/,
    "a class info reporting more interfaces than a set can hold is rejected"
  );
});

add_task(function test_interface_count_just_above_maximum() {
  const contractID = registerClassInfo(
    "27515a3a-c444-4e85-bb03-151cda827c82",
    MAX_INTERFACES + 1
  );

  Assert.throws(
    () => Cc[contractID].createInstance(Ci.nsIObserver),
    /NS_ERROR_XPC_CANT_CREATE_WN/,
    "the interface count that would wrap the set's uint16_t is rejected"
  );
});

add_task(function test_interface_count_at_maximum() {
  const contractID = registerClassInfo(
    "dd84c4d0-7ee6-471b-8087-9b4100323f02",
    MAX_INTERFACES
  );

  const instance = Cc[contractID].createInstance(Ci.nsIObserver);
  Assert.ok(instance, "the largest set a class info can ask for is built");

  Assert.throws(
    () => instance.QueryInterface(Ci.nsINamed),
    /NS_NOINTERFACE/,
    "extending a full set is rejected instead of wrapping its count to zero"
  );
});

add_task(function test_extending_a_set_below_the_maximum() {
  const contractID = registerClassInfo(
    "5be70ea4-d21a-4a4e-b949-85c78ffa0c81",
    1
  );

  const instance = Cc[contractID].createInstance(Ci.nsIObserver);
  Assert.ok(
    instance.QueryInterface(Ci.nsINamed),
    "extending a set below the limit still works"
  );
});
