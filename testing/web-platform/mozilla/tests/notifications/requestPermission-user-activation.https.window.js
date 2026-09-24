// META: script=/resources/testdriver.js
// META: script=/resources/testdriver-vendor.js

/**
 * Runs `trigger` while intercepting the content permission prompt it causes, so
 * that we can inspect the nsIContentPermissionRequest without any UI being
 * shown.
 *
 * @param {Function} trigger Requests a permission, e.g. by calling
 *   Notification.requestPermission(). May be asynchronous, but must not wait
 *   for the request itself to settle.
 * @returns {Promise<object>} The intercepted permission type and the value of
 *   nsIContentPermissionRequest.hasValidTransientUserGestureActivation.
 */
async function interceptPermissionPrompt(trigger) {
  const promptPromise = SpecialPowers.spawnChrome([], () => {
    const { Integration } = ChromeUtils.importESModule(
      "resource://gre/modules/Integration.sys.mjs"
    );
    const { promise, resolve } = Promise.withResolvers();

    const TestIntegration = base => ({
      __proto__: base,
      createPermissionPrompt(type, request) {
        Integration.contentPermission.unregister(TestIntegration);
        const { hasValidTransientUserGestureActivation } = request;
        resolve({ type, hasValidTransientUserGestureActivation });
        return { prompt: () => request.cancel() };
      },
    });
    Integration.contentPermission.register(TestIntegration);

    return promise;
  });

  // The task above only resolves once the prompt happens, so wait for a second
  // task instead. SpecialPowers tasks are processed in order, thus this
  // resolving means the integration above is registered by now.
  await SpecialPowers.spawnChrome([], () => {});

  await trigger();

  return promptPromise;
}

promise_test(async () => {
  const { type, hasValidTransientUserGestureActivation } =
    await interceptPermissionPrompt(() => {
      Notification.requestPermission();
    });

  assert_equals(type, "desktop-notification", "permission type");
  assert_false(
    hasValidTransientUserGestureActivation,
    "hasValidTransientUserGestureActivation"
  );
}, "A programmatic permission request has no transient user gesture activation");

promise_test(async () => {
  const { type, hasValidTransientUserGestureActivation } =
    await interceptPermissionPrompt(() =>
      test_driver.bless("request notification permission", () => {
        Notification.requestPermission();
      })
    );

  assert_equals(type, "desktop-notification", "permission type");
  assert_true(
    hasValidTransientUserGestureActivation,
    "hasValidTransientUserGestureActivation"
  );
}, "A user-initiated permission request has transient user gesture activation");
