/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_cn_repack_uses_cn_links() {
  await clearPolicies();
  let defaultBranch = Services.prefs.getDefaultBranch(null);
  defaultBranch.setCharPref("distribution.id", "MozillaOnline");

  let { mobilePromo } = await getPromoCards();
  let win = gBrowser.contentWindow;

  let promoLinkControl = await settingControlRenders("promoGroupLink", win);
  let link = promoLinkControl.querySelector("a");
  ok(
    link.href.startsWith("https://www.firefox.com.cn/browsers/mobile/"),
    "CN repack uses the firefox.com.cn link"
  );
  ok(
    mobilePromo.imageSrc.includes("-cn"),
    "CN repack uses the CN QR code image"
  );

  defaultBranch.setCharPref("distribution.id", "");
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function test_email_link_visible_for_supported_locale() {
  await clearPolicies();
  const initialLocale = Services.locale.appLocaleAsBCP47;
  setLocale("pt-BR");

  await getPromoCards();
  let win = gBrowser.contentWindow;
  let emailLinkControl = await settingControlRenders(
    "firefoxMobilePromoLink",
    win
  );
  ok(!emailLinkControl.hidden, "Email link is visible for pt-BR locale");

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  setLocale(initialLocale);
});

add_task(async function test_email_link_hidden_for_unsupported_locale() {
  await clearPolicies();
  const initialLocale = Services.locale.appLocaleAsBCP47;
  setLocale("af");

  await getPromoCards();
  let win = gBrowser.contentWindow;
  let emailLinkControl = await settingControlRenders(
    "firefoxMobilePromoLink",
    win
  );
  ok(emailLinkControl.hidden, "Email link is hidden for unsupported locale");

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  setLocale(initialLocale);
});
