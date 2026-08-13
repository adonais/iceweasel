const PI_URL = `data:text/xml,
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="data:text/xml,"?>
<root/>
`;

const HEADER_URL =
  "https://example.com/browser/dom/base/test/file_xslt_stylesheet_header.sjs";

const XSLT_DISABLED_MESSAGE =
  "It uses XSLT, which the browser does not support";

async function checkXSLTDisabledMessage(url, xsltEnabled) {
  await SpecialPowers.pushPrefEnv({ set: [["dom.xslt.enabled", xsltEnabled]] });

  await BrowserTestUtils.withNewTab(url, async function (browser) {
    await SpecialPowers.spawn(
      browser,
      [XSLT_DISABLED_MESSAGE, !xsltEnabled],
      (message, expected) => {
        const docElement = content.document.documentElement;
        const shadowRoot = docElement?.openOrClosedShadowRoot;
        const shown = shadowRoot?.textContent.includes(message) ?? false;
        is(
          shown,
          expected,
          `The XSLT-disabled message should ${expected ? "" : "not "}be displayed`
        );
      }
    );
  });
}

add_task(async function xslt_disabled() {
  await checkXSLTDisabledMessage(PI_URL, false);
});

add_task(async function xslt_enabled() {
  await checkXSLTDisabledMessage(PI_URL, true);
});

add_task(async function xslt_disabled_header() {
  await checkXSLTDisabledMessage(HEADER_URL, false);
});

add_task(async function xslt_enabled_header() {
  await checkXSLTDisabledMessage(HEADER_URL, true);
});
