// META: script=/resources/testdriver.js
// META: script=/resources/testdriver-vendor.js
// META: script=/_mozilla/resources/GleanTest.js

promise_setup(async () => {
  await GleanTest.testResetFOG();
  await test_driver.set_permission({ name: "geolocation" }, "denied");
});

promise_test(async () => {
  const { promise, resolve } = Promise.withResolvers();
  navigator.geolocation.getCurrentPosition(resolve, resolve);
  await promise;
  await GleanTest.flush();
  const noneCount = await GleanTest.geolocation.requestActivation.none.testGetValue();
  assert_equals(noneCount, 1, "none count should increment");
}, "A programmatic geolocation request has no transient user gesture activation");

promise_test(async () => {
  await test_driver.bless("request notification permission", async () => {
    const { promise, resolve } = Promise.withResolvers();
    navigator.geolocation.getCurrentPosition(resolve, resolve);
    await promise;
  });
  await GleanTest.flush();
  const fullCount = await GleanTest.geolocation.requestActivation.full_activated.testGetValue();
  assert_equals(fullCount, 1, "full activation count should increment");
}, "A user-initiated geolocation request has transient user gesture activation");

promise_test(async () => {
  SpecialPowers.wrap(document).consumeTransientUserGestureActivation();
  const { promise, resolve } = Promise.withResolvers();
  navigator.geolocation.getCurrentPosition(resolve, resolve);
  await promise;
  await GleanTest.flush();
  const hasBeenCount = await GleanTest.geolocation.requestActivation.has_been_activated.testGetValue();
  assert_equals(hasBeenCount, 1, "has-been activation count should increment");
}, "A programmatic geolocation request previously had transient user gesture activation");
