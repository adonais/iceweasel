/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* globals browser */ // extension scripts have access to browser global.

/**
 * Translations actors are created lazily.
 *
 * - Supported top-level pages will receive a TranslationsParent actor.
 *
 * - Page-load language detection does not create a TranslationsChild actor.
 *   It uses document-language metadata collected outside TranslationsChild.
 *
 * - Sub-frame TranslationsParent and TranslationsChild actors are created for
 *   each <iframe> only once translation is requested.
 */

/**
 * Supported top-level web pages get a TranslationsParent actor.
 */
add_task(async function test_top_level_parent_actor_at_https() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  Assert.ok(
    hasTranslationParentActor(tab.linkedBrowser.browsingContext),
    "Tab with https URL has a TranslationsParent actor"
  );
  BrowserTestUtils.removeTab(tab);
});

/**
 * A page in the user's locale may still run language detection, but it
 * should not get a TranslationsChild actor until translation is requested.
 */
add_task(
  async function test_top_level_child_actor_created_after_translation_request() {
    const { appLocaleAsBCP47 } = Services.locale;
    if (!appLocaleAsBCP47.startsWith("en")) {
      info(
        "Skipping parent-only English page test because the app locale is not English."
      );
      return;
    }

    const { cleanup, tab } = await loadTestPage({
      page: ENGLISH_PAGE_URL,
      autoDownloadFromRemoteSettings: true,
      languagePairs: [
        { fromLang: "en", toLang: "es" },
        { fromLang: "es", toLang: "en" },
      ],
    });

    try {
      const { linkedBrowser } = tab;

      Assert.ok(
        hasTranslationParentActor(linkedBrowser.browsingContext),
        "English page has a top-level TranslationsParent actor before translation"
      );
      Assert.ok(
        !(await hasTranslationChildActor(linkedBrowser)),
        "English page does not have a TranslationsChild actor before translation"
      );

      await getTranslationsParent().translate(
        {
          sourceLanguage: "en",
          targetLanguage: "es",
        },
        false
      );

      await waitForTranslationChildActor(
        linkedBrowser,
        "Waiting for the top-level TranslationsChild actor to be created"
      );

      Assert.ok(
        hasTranslationParentActor(linkedBrowser.browsingContext),
        "English page still has a top-level TranslationsParent actor after translation"
      );
      Assert.ok(
        await hasTranslationChildActor(linkedBrowser),
        "English page has a TranslationsChild actor after translation"
      );
    } finally {
      await cleanup();
    }
  }
);

/**
 * A page that may be offered for translation runs language detection without
 * creating a top-level TranslationsChild actor.
 */
add_task(
  async function test_top_level_child_actor_not_created_for_language_detection() {
    const { cleanup, tab } = await loadTestPage({
      page: SPANISH_PAGE_URL,
      languagePairs: [
        { fromLang: "es", toLang: "en" },
        { fromLang: "en", toLang: "es" },
      ],
    });

    try {
      const { linkedBrowser } = tab;
      const actor = getTranslationsParent();

      Assert.ok(
        hasTranslationParentActor(linkedBrowser.browsingContext),
        "Spanish page has a top-level TranslationsParent actor"
      );

      await waitForCondition(
        () => actor.languageState.detectedLanguages?.docLangTag,
        "Waiting for language detection to complete"
      );

      Assert.ok(
        !(await hasTranslationChildActor(linkedBrowser)),
        "Spanish page does not have a TranslationsChild actor after language detection"
      );
    } finally {
      await cleanup();
    }
  }
);

/**
 * Existing and newly inserted cross-origin sub-frame actors are still created
 * lazily, without same-origin DOM access from the top-level page.
 */
add_task(async function test_cross_origin_subframe_actors_created_lazily() {
  const { cleanup, runInPage, tab } = await loadTestPage({
    page: SPANISH_IFRAME_PAGE_URL,
    autoDownloadFromRemoteSettings: true,
    languagePairs: [
      { fromLang: "es", toLang: "en" },
      { fromLang: "en", toLang: "es" },
    ],
  });

  try {
    const { linkedBrowser } = tab;
    const preexistingBrowsingContext = await navigateIframeToUrl(runInPage, {
      iframeId: "top-frame",
      url: `${SPANISH_PAGE_URL_DOT_ORG}?frame=preexisting-cross-origin`,
    });

    Assert.equal(
      await getContentOrigin(linkedBrowser),
      "https://example.com",
      "The top-level page is loaded from example.com"
    );
    Assert.equal(
      await getContentOrigin(preexistingBrowsingContext),
      "https://example.org",
      "The existing iframe is loaded from example.org"
    );

    Assert.ok(
      !hasTranslationParentActor(preexistingBrowsingContext),
      "The existing cross-origin iframe has no TranslationsParent actor before translation"
    );
    Assert.ok(
      !(await hasTranslationChildActorInBrowsingContext(
        preexistingBrowsingContext
      )),
      "The existing cross-origin iframe has no TranslationsChild actor before translation"
    );

    await getTranslationsParent().translate(
      {
        sourceLanguage: "es",
        targetLanguage: "en",
      },
      false
    );

    await waitForTranslationParentActorInBrowsingContext(
      preexistingBrowsingContext,
      "Waiting for the existing cross-origin iframe TranslationsParent actor"
    );
    await waitForTranslationChildActorInBrowsingContext(
      preexistingBrowsingContext,
      "Waiting for the existing cross-origin iframe TranslationsChild actor"
    );

    const dynamicBrowsingContext = await insertIframeIntoPage(runInPage, {
      iframeId: "dynamic-cross-origin-frame",
      referenceIframeId: "bottom-frame",
      position: "afterend",
      src: `${SPANISH_PAGE_URL_DOT_ORG}?frame=dynamic-cross-origin`,
    });

    Assert.equal(
      await getContentOrigin(dynamicBrowsingContext),
      "https://example.org",
      "The dynamically inserted iframe is loaded from example.org"
    );

    await waitForTranslationParentActorInBrowsingContext(
      dynamicBrowsingContext,
      "Waiting for the dynamic cross-origin iframe TranslationsParent actor"
    );
    await waitForTranslationChildActorInBrowsingContext(
      dynamicBrowsingContext,
      "Waiting for the dynamic cross-origin iframe TranslationsChild actor"
    );
  } finally {
    await cleanup();
  }
});

add_task(async function test_about_blank_subframe_actors_created_lazily() {
  const { cleanup, runInPage } = await loadTestPage({
    page: SPANISH_IFRAME_PAGE_URL,
    autoDownloadFromRemoteSettings: true,
    languagePairs: [
      { fromLang: "es", toLang: "en" },
      { fromLang: "en", toLang: "es" },
    ],
  });

  try {
    const browsingContextId = await runInPage(async TranslationsTest => {
      const iframe = content.document.createElement("iframe");
      iframe.id = "about-blank-frame";
      iframe.title = "about-blank-frame";

      const loadPromise = new Promise(resolve => {
        iframe.addEventListener("load", resolve, { once: true });
      });

      content.document.body.append(iframe);
      await loadPromise;

      iframe.contentDocument.body.textContent =
        "Este contenido fue escrito en un iframe about:blank.";

      await TranslationsTest.waitForCondition(
        () => iframe.browsingContext,
        "Waiting for the about:blank iframe to have a browsing context"
      );

      return iframe.browsingContext.id;
    });

    const browsingContext = BrowsingContext.get(browsingContextId);

    Assert.equal(
      browsingContext.currentURI.spec,
      "about:blank",
      "The no-src iframe is loaded at about:blank"
    );
    Assert.ok(
      !hasTranslationParentActor(browsingContext),
      "The about:blank iframe has no TranslationsParent actor before translation"
    );
    Assert.ok(
      !(await hasTranslationChildActorInBrowsingContext(browsingContext)),
      "The about:blank iframe has no TranslationsChild actor before translation"
    );

    await getTranslationsParent().translate(
      {
        sourceLanguage: "es",
        targetLanguage: "en",
      },
      false
    );

    await waitForTranslationParentActorInBrowsingContext(
      browsingContext,
      "Waiting for the about:blank iframe TranslationsParent actor"
    );
    await waitForTranslationChildActorInBrowsingContext(
      browsingContext,
      "Waiting for the about:blank iframe TranslationsChild actor"
    );
  } finally {
    await cleanup();
  }
});

add_task(async function test_about_srcdoc_subframe_actors_created_lazily() {
  const { cleanup, runInPage } = await loadTestPage({
    page: SPANISH_IFRAME_PAGE_URL,
    autoDownloadFromRemoteSettings: true,
    languagePairs: [
      { fromLang: "es", toLang: "en" },
      { fromLang: "en", toLang: "es" },
    ],
  });

  try {
    const browsingContextId = await runInPage(async TranslationsTest => {
      const iframe = content.document.createElement("iframe");
      iframe.id = "about-srcdoc-frame";
      iframe.title = "about-srcdoc-frame";
      iframe.srcdoc =
        "<body>Este contenido fue escrito en un iframe about:srcdoc.</body>";

      const loadPromise = new Promise(resolve => {
        iframe.addEventListener("load", resolve, { once: true });
      });

      content.document.body.append(iframe);
      await loadPromise;

      await TranslationsTest.waitForCondition(
        () => iframe.browsingContext,
        "Waiting for the about:srcdoc iframe to have a browsing context"
      );

      return iframe.browsingContext.id;
    });

    const browsingContext = BrowsingContext.get(browsingContextId);

    Assert.equal(
      browsingContext.currentURI.spec,
      "about:srcdoc",
      "The srcdoc iframe is loaded at about:srcdoc"
    );
    Assert.ok(
      !hasTranslationParentActor(browsingContext),
      "The about:srcdoc iframe has no TranslationsParent actor before translation"
    );
    Assert.ok(
      !(await hasTranslationChildActorInBrowsingContext(browsingContext)),
      "The about:srcdoc iframe has no TranslationsChild actor before translation"
    );

    await getTranslationsParent().translate(
      {
        sourceLanguage: "es",
        targetLanguage: "en",
      },
      false
    );

    await waitForTranslationParentActorInBrowsingContext(
      browsingContext,
      "Waiting for the about:srcdoc iframe TranslationsParent actor"
    );
    await waitForTranslationChildActorInBrowsingContext(
      browsingContext,
      "Waiting for the about:srcdoc iframe TranslationsChild actor"
    );
  } finally {
    await cleanup();
  }
});

/**
 * Unsupported top-level schemes do not get a TranslationsParent actor.
 */
add_task(async function test_no_parent_actor_at_data_url() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, "data:,");
  Assert.ok(
    !hasTranslationParentActor(tab.linkedBrowser.browsingContext),
    "Tab with data:-URL does not have a TranslationsParent actor"
  );
  BrowserTestUtils.removeTab(tab);
});

/**
 * Extension documents only get a top-level TranslationsParent actor when they
 * are shown in tabs. Supported child frames still remain actor-free until
 * translation is requested.
 */
add_task(async function test_parent_actor_at_moz_extension_tab() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      background: {
        page: "withframe.html",
      },
    },
    files: {
      "withframe.html": `<body><script src="withframe.js"></script>`,
      "withframe.js": () => {
        let f = document.createElement("iframe");
        f.src = "https://example.com/?bg";
        f.onload = () => {
          browser.test.sendMessage("frame_loaded_in_extpage");
        };
        document.body.append(f);
      },
    },
  });
  await extension.startup();
  await extension.awaitMessage("frame_loaded_in_extpage");

  info("Verifying actor availability in extension background page");
  {
    let bgBrowsingContext;
    for (let view of WebExtensionPolicy.getByID(extension.id).extension.views) {
      if (view.viewType === "background") {
        bgBrowsingContext = view.browsingContext;
      }
    }
    Assert.ok(
      !hasTranslationParentActor(bgBrowsingContext),
      "Extension background pages do not have a TranslationsParent actor"
    );
    Assert.ok(
      !hasTranslationParentActor(bgBrowsingContext.children[0]),
      "https iframe in extension background page does not have a TranslationsParent actor"
    );
  }

  info("Verifying actor availability in extension tab");
  {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      `moz-extension://${extension.uuid}/withframe.html`
    );
    await extension.awaitMessage("frame_loaded_in_extpage");

    Assert.ok(
      hasTranslationParentActor(tab.linkedBrowser.browsingContext),
      "moz-extension:-page in tab has a TranslationsParent actor"
    );
    Assert.ok(
      !hasTranslationParentActor(tab.linkedBrowser.browsingContext.children[0]),
      "https iframe in moz-extension:-page in tab does not have a TranslationsParent actor before translation"
    );

    BrowserTestUtils.removeTab(tab);
  }

  await extension.unload();
});

/**
 * Extension sidebars do not get a TranslationsParent actor, even after
 * navigation to a supported https: document.
 */
add_task(async function test_no_parent_actor_at_moz_extension_sidebar_action() {
  let extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "temporary", // To automatically show sidebar on load.
    manifest: {
      sidebar_action: {
        default_panel: "sidebar.html",
      },
      content_scripts: [
        {
          matches: ["https://example.com/?sidebar"],
          js: ["contentscript_in_sidebar.js"],
        },
      ],
    },
    files: {
      "sidebar.html": `<script src="sidebar.js"></script>`,
      "sidebar.js": () => {
        browser.test.onMessage.addListener(msg => {
          browser.test.assertEq("navigate_to_https", msg, "Expected message");
          location.href = "https://example.com/?sidebar";
        });
        window.onload = () => {
          browser.test.sendMessage("sidebar-ready");
        };
      },
      "contentscript_in_sidebar.js": () => {
        browser.test.sendMessage("contentscript_in_sidebar_loaded");
      },
    },
  });
  await extension.startup();

  await extension.awaitMessage("sidebar-ready");
  let sidebarBrowser =
    SidebarController.browser.contentWindow.gBrowser.selectedBrowser;
  Assert.equal(
    sidebarBrowser.currentURI.spec,
    `moz-extension://${extension.uuid}/sidebar.html`,
    "Sidebar is showing extension sidebar"
  );
  Assert.ok(
    !hasTranslationParentActor(sidebarBrowser.browsingContext),
    "Extension sidebar does not have a TranslationsParent actor"
  );

  extension.sendMessage("navigate_to_https");
  await extension.awaitMessage("contentscript_in_sidebar_loaded");
  Assert.equal(
    sidebarBrowser.currentURI.spec,
    "https://example.com/?sidebar",
    "Sidebar is showing the https document"
  );
  Assert.ok(
    !hasTranslationParentActor(sidebarBrowser.browsingContext),
    "Extension sidebar does not have a TranslationsParent actor, despite it showing a https page"
  );

  await extension.unload();
});
