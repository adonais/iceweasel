/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { buildBrowserContextPrompt } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs"
);
const { sanitizeUntrustedContent } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs"
);
const { _setRemoteClientForTesting, _clearRemoteClientForTesting } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
  );

registerCleanupFunction(() => _clearRemoteClientForTesting());

function tabModule(module, version, prompts) {
  return {
    kind: "module",
    feature: "browser-context",
    module,
    model: "generic",
    version,
    prompts,
  };
}

const LEGACY_TAB = tabModule("tab", "1.0", "legacy tab: {url}");
const TAB_V1 = tabModule(
  "tab-conditional-fields",
  "1.0",
  "v1 tab: {url}\n{#pageSlug}Page slug: {pageSlug}{/pageSlug}\nTitle: {title}"
);
const TAB_V2 = tabModule("tab-conditional-fields", "2.0", "v2 tab: {url}");
const PARAMS_V1 = {
  kind: "params",
  feature: "browser-context",
  model: "generic",
  version: "1.0",
  is_default: true,
  modules: [
    { name: "tab-conditional-fields", version: "1.0" },
    { name: "mentions", version: "1.0" },
  ],
};

function buildWith(records, mapping) {
  _setRemoteClientForTesting({ get: async () => records });
  return buildBrowserContextPrompt("generic", {
    getRealTimeMapping: async () => ({
      url: "about:smartpage?page=my-page",
      title: "My page",
      description: "",
      pageSlug: "my-page",
      hasTabInfo: true,
      ...mapping,
    }),
    contextMentions: [],
    securityProperties: new SecurityProperties(),
  });
}

add_task(async function test_params_pin_the_tab_version() {
  const out = await buildWith([PARAMS_V1, LEGACY_TAB, TAB_V1, TAB_V2]);
  Assert.equal(
    out,
    "v1 tab: about:smartpage?page=my-page\nPage slug: my-page\nTitle: My page",
    "The tab module and version named by the params manifest are used"
  );
});

add_task(async function test_tab_without_slug_drops_the_slug_line() {
  const out = await buildWith([PARAMS_V1, LEGACY_TAB, TAB_V1], {
    url: "https://example.com/",
    pageSlug: "",
  });
  Assert.equal(
    out,
    "v1 tab: https://example.com/\nTitle: My page",
    "The slug line is removed when there is no slug"
  );
});

add_task(async function test_no_params_falls_back_to_legacy_tab() {
  const out = await buildWith([LEGACY_TAB, TAB_V1]);
  Assert.equal(
    out,
    "legacy tab: about:smartpage?page=my-page",
    "Without a params manifest the legacy tab fragment is used"
  );
});

add_task(async function test_mentioned_smart_page_includes_its_slug() {
  _setRemoteClientForTesting({
    get: async () => [
      {
        kind: "module",
        feature: "browser-context",
        module: "mentions",
        model: "generic",
        version: "1.0",
        prompts: "Mentioned:\n{contextUrls}",
      },
    ],
  });
  const out = await buildBrowserContextPrompt("generic", {
    getRealTimeMapping: async () => ({ hasTabInfo: false }),
    contextMentions: [
      { type: "tab", url: "about:smartpage?page=my-page", label: "My page" },
      { type: "tab", url: "https://example.com/?page=other", label: "Other" },
    ],
    securityProperties: new SecurityProperties(),
  });

  Assert.ok(
    out.includes(
      `- URL: about:smartpage?page=my-page\n` +
        `  Title: ${sanitizeUntrustedContent("My page")}\n` +
        `  Page slug: my-page\n`
    ),
    `A mentioned smart page lists its slug: ${out}`
  );
  Assert.equal(
    out.match(/Page slug:/g).length,
    1,
    "A mentioned web page has no slug line"
  );
});
