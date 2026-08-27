// META: script=/_mozilla/resources/GleanTest.js
// META: script=/resources/testdriver.js
// META: script=/resources/testdriver-vendor.js
// META: script=/notifications/resources/helpers.js
// META: script=resources/MockAlertsService.js
// META: script=resources/SiteCategory.js

async function overrideSiteCategory(t, category) {
  await GleanTest.testResetFOG();
  await MockAlertsService.register(t);
  await SiteCategory.register(t);
  await SpecialPowers.pushPrefEnv({
    set: [[
      "toolkit.telemetry.site_categories",
      JSON.stringify({ "{{hosts[][]}}": category }),
    ]],
  });
}

promise_setup(async () => {
  await trySettingPermission("granted");
});

promise_test(async (t) => {
  await overrideSiteCategory(t, "other");

  const notification = new Notification("foo");
  await new Promise((resolve) => notification.onshow = resolve);

  const shown = await GleanTest.webNotification.shown.testGetValue();
  assert_equals(shown.length, 1, "shown should have one entry");
  assert_equals(shown[0].extra.site_category, "other", "site_category should be set to 'other'");

  await MockAlertsService.closeNotifications();

  const dismissed = await GleanTest.webNotification.dismissed.testGetValue();
  assert_equals(dismissed.length, 1, "dismissed should have one entry");
  assert_equals(dismissed[0].extra.site_category, "other", "site_category should be set to 'other'");

  const clicked = await GleanTest.webNotification.clicked.testGetValue();
  assert_equals(clicked, null, "clicked should have no entries");
}, "Closing notification without clicking");


promise_test(async (t) => {
  await overrideSiteCategory(t, "social");

  const notification = new Notification("foo");
  await new Promise((resolve) => notification.onshow = resolve);

  const shown = await GleanTest.webNotification.shown.testGetValue();
  assert_equals(shown.length, 1, "shown should have one entry");
  assert_equals(shown[0].extra.site_category, "social", "site_category should be set to 'social'");

  await MockAlertsService.clickNotifications();
  await MockAlertsService.closeNotifications();

  const dismissed = await GleanTest.webNotification.dismissed.testGetValue();
  assert_equals(dismissed, null, "dismissed should have no entries");

  const clicked = await GleanTest.webNotification.clicked.testGetValue();
  assert_equals(clicked.length, 1, "clicked should have one entry");
  assert_equals(clicked[0].extra.site_category, "social", "site_category should be set to 'social'");
}, "Clicking notification");
