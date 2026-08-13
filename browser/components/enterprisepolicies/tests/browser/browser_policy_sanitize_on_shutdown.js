/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  Sanitizer: "resource:///modules/Sanitizer.sys.mjs",
  SiteDataTestUtils: "resource://testing-common/SiteDataTestUtils.sys.mjs",
});

const SRD_ENABLED = Services.prefs.getBoolPref(
  "browser.settings-redesign.enabled",
  false
);

async function checkPrivacyPreferences(expectedDisabled) {
  await BrowserTestUtils.withNewTab(
    "about:preferences#privacy",
    async browser => {
      await SpecialPowers.spawn(
        browser,
        [{ expectedDisabled, srdEnabled: SRD_ENABLED }],
        async ({ expectedDisabled: expected, srdEnabled }) => {
          let { historyMode, ...sub } = expected;
          is(
            content.document.getElementById("historyMode").disabled,
            historyMode,
            "#historyMode disabled state"
          );
          if (srdEnabled) {
            await content.gotoPref("paneHistory");
            await new Promise(r => content.requestAnimationFrame(r));
          }
          for (let [id, exp] of Object.entries(sub)) {
            let el = srdEnabled
              ? content.document.querySelector(
                  `setting-group[groupid='historyAdvanced'] #${id}`
                )
              : content.document.getElementById(id);
            is(el.disabled, exp, `#${id} disabled state`);
          }
        }
      );
    }
  );
}

const ALL_DISABLED = {
  historyMode: true,
  privateBrowsingAutoStart: true,
  alwaysClear: true,
  rememberHistory: false,
  rememberForms: false,
};

const NONE_DISABLED = {
  historyMode: false,
  privateBrowsingAutoStart: false,
  alwaysClear: false,
  rememberHistory: false,
  rememberForms: false,
};

add_task(async function test_sanitizeOnShutdown_boolean_true() {
  await setupPolicyEngineWithJson({
    policies: { SanitizeOnShutdown: true },
  });
  await checkPrivacyPreferences(ALL_DISABLED);
});

add_task(async function test_sanitizeOnShutdown_object_locked_true() {
  await setupPolicyEngineWithJson({
    policies: {
      SanitizeOnShutdown: { History: true, Locked: true },
    },
  });
  await checkPrivacyPreferences(ALL_DISABLED);
});

add_task(async function test_sanitizeOnShutdown_object_locked_false() {
  await setupPolicyEngineWithJson({
    policies: {
      SanitizeOnShutdown: { History: true, Locked: false },
    },
  });
  await checkPrivacyPreferences(NONE_DISABLED);
});

// Bug 2049937: end-to-end check that a SanitizeOnShutdown.Exceptions entry set
// via enterprise policy causes the Sanitizer to preserve that site's data on
// shutdown, while a non-excepted site is cleared.
add_task(async function test_sanitizeOnShutdown_exceptions_honored() {
  const exceptedOrigin = "https://exception.example.com";
  const clearedOrigin = "https://cleared.example.com";

  await SiteDataTestUtils.clear();

  await setupPolicyEngineWithJson({
    policies: {
      SanitizeOnShutdown: {
        Cookies: true,
        Exceptions: [exceptedOrigin],
      },
    },
  });

  SiteDataTestUtils.addToCookies({ origin: exceptedOrigin });
  SiteDataTestUtils.addToCookies({ origin: clearedOrigin });
  ok(
    SiteDataTestUtils.hasCookies(exceptedOrigin),
    "Excepted origin has cookies before shutdown"
  );
  ok(
    SiteDataTestUtils.hasCookies(clearedOrigin),
    "Non-excepted origin has cookies before shutdown"
  );

  await Sanitizer.runSanitizeOnShutdown();

  ok(
    SiteDataTestUtils.hasCookies(exceptedOrigin),
    "Policy exception preserves cookies for the excepted origin on shutdown"
  );
  ok(
    !SiteDataTestUtils.hasCookies(clearedOrigin),
    "Non-excepted origin cookies are cleared on shutdown"
  );

  await SiteDataTestUtils.clear();
});
