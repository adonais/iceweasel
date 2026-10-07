"use strict";

const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);

async function testAboutWelcomeLogoFor(logo = {}) {
  info(`Testing logo: ${JSON.stringify(logo)}`);

  let screens = [makeTestContent("TEST_LOGO_SELECTION_STEP", { logo })];

  let doExperimentCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "aboutwelcome",
    value: { enabled: true, screens },
  });

  let browser = await openAboutWelcome(JSON.stringify(screens));

  let expected = [
    `.brand-logo[src="${
      logo.imageURL ?? "chrome://branding/content/about-logo.svg"
    }"][alt=""]`,
  ];
  let unexpected = [];
  (logo.alt ? unexpected : expected).push('.brand-logo[role="presentation"]');
  (logo.width ? expected : unexpected).push(`.brand-logo[style*="width"]`);
  (logo.height ? expected : unexpected).push(`.brand-logo[style*="height"]`);
  (logo.marginBlock ? expected : unexpected).push(
    `.logo-container[style*="margin-block"]`
  );
  (logo.marginInline ? expected : unexpected).push(
    `.logo-container[style*="margin-inline"]`
  );
  (logo.darkModeImageURL ? expected : unexpected).push(
    `.logo-container source[media="(prefers-color-scheme: dark)"]${
      logo.darkModeImageURL ? `[srcset="${logo.darkModeImageURL}"]` : ""
    }`
  );
  (logo.reducedMotionImageURL ? expected : unexpected).push(
    `.logo-container source[media="(prefers-reduced-motion: reduce)"]${
      logo.reducedMotionImageURL
        ? `[srcset="${logo.reducedMotionImageURL}"]`
        : ""
    }`
  );
  (logo.darkModeReducedMotionImageURL ? expected : unexpected).push(
    `.logo-container source[media="(prefers-color-scheme: dark) and (prefers-reduced-motion: reduce)"]${
      logo.darkModeReducedMotionImageURL
        ? `[srcset="${logo.darkModeReducedMotionImageURL}"]`
        : ""
    }`
  );
  await test_screen_content(
    browser,
    "renders screen with passed logo",
    expected,
    unexpected
  );

  await doExperimentCleanup();
  browser.closeBrowser();
}

add_setup(async function () {
  registerCleanupFunction(function () {
    Services.prefs.clearUserPref("browser.aboutwelcome.didSeeFinalScreen");
  });
});

/**
 * Test rendering a screen with a customized logo
 */
add_task(async function test_aboutwelcome_with_customized_logo() {
  const TEST_LOGO_URL = "chrome://branding/content/icon64.png";
  const TEST_LOGO_HEIGHT = "50px";
  const TEST_LOGO_CONTENT = makeTestContent("TEST_LOGO_STEP", {
    logo: {
      height: TEST_LOGO_HEIGHT,
      imageURL: TEST_LOGO_URL,
    },
  });
  const TEST_LOGO_JSON = JSON.stringify([TEST_LOGO_CONTENT]);
  let browser = await openAboutWelcome(TEST_LOGO_JSON);

  await test_screen_content(
    browser,
    "renders screen with customized logo",
    // Expected selectors:
    ["main.TEST_LOGO_STEP[pos='center']", `.brand-logo[src="${TEST_LOGO_URL}"]`]
  );

  // Ensure logo has custom height
  await test_element_styles(
    browser,
    ".brand-logo",
    // Expected styles:
    {
      // Override default text-link styles
      height: TEST_LOGO_HEIGHT,
    }
  );
  browser.closeBrowser();
});

/**
 * Test rendering a screen with empty logo used for padding
 */
add_task(async function test_aboutwelcome_with_empty_logo_spacing() {
  const TEST_LOGO_HEIGHT = "50px";
  const TEST_LOGO_CONTENT = makeTestContent("TEST_LOGO_STEP", {
    logo: {
      height: TEST_LOGO_HEIGHT,
      imageURL: "none",
    },
  });
  const TEST_LOGO_JSON = JSON.stringify([TEST_LOGO_CONTENT]);
  let browser = await openAboutWelcome(TEST_LOGO_JSON);

  await test_screen_content(
    browser,
    "renders screen with empty logo element",
    // Expected selectors:
    ["main.TEST_LOGO_STEP[pos='center']", ".brand-logo[src='none']"]
  );

  // Ensure logo has custom height
  await test_element_styles(
    browser,
    ".brand-logo",
    // Expected styles:
    {
      // Override default text-link styles
      height: TEST_LOGO_HEIGHT,
    }
  );
  browser.closeBrowser();
});

/**
 * Test rendering a screen with a "Title Logo"
 */
add_task(async function test_title_logo() {
  const TEST_TITLE_LOGO_URL = "chrome://branding/content/icon64.png";
  const TEST_CONTENT = makeTestContent("TITLE_LOGO", {
    title_logo: {
      imageURL: TEST_TITLE_LOGO_URL,
    },
  });
  const TEST_JSON = JSON.stringify([TEST_CONTENT]);
  let browser = await openAboutWelcome(TEST_JSON);

  await test_screen_content(
    browser,
    "renders screen with title_logo",
    // Expected selectors:
    [".inline-icon-container"]
  );

  browser.closeBrowser();
});

/**
 * Test rendering a screen with different logos depending on reduced motion and
 * color scheme preferences
 */
add_task(async function test_aboutwelcome_logo_selection() {
  // Test a screen config that includes every logo parameter
  await testAboutWelcomeLogoFor({
    imageURL: "chrome://branding/content/icon16.png",
    darkModeImageURL: "chrome://branding/content/icon32.png",
    reducedMotionImageURL: "chrome://branding/content/icon64.png",
    darkModeReducedMotionImageURL: "chrome://branding/content/icon128.png",
    alt: "TEST_LOGO_SELECTION_ALT",
    width: "16px",
    height: "16px",
    marginBlock: "0px",
    marginInline: "0px",
  });
  // Test a screen config with no animated/static logos
  await testAboutWelcomeLogoFor({
    imageURL: "chrome://branding/content/icon16.png",
    darkModeImageURL: "chrome://branding/content/icon32.png",
  });
  // Test a screen config with no dark mode logos
  await testAboutWelcomeLogoFor({
    imageURL: "chrome://branding/content/icon16.png",
    reducedMotionImageURL: "chrome://branding/content/icon64.png",
  });
  // Test a screen config that includes only the default logo
  await testAboutWelcomeLogoFor({
    imageURL: "chrome://branding/content/icon16.png",
  });
  // Test a screen config with no logos
  await testAboutWelcomeLogoFor();
});
