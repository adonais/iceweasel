/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The test directory as a path, e.g. "/browser/toolkit/.../tests/browser/", so
// the support files can be requested from any of the mochitest server's hosts
// by prepending an origin such as https://example.com.
const TEST_DIR = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  ""
);

/**
 * Tests basic headless content extraction. The page is loaded in the background and
 * the content is extracted.
 */
add_task(async function test_headless_extraction() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );
  const { html } = MLTestUtils.serveHTML();
  const { url, cleanup } = html`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Headless Document</title>
      </head>
      <body>
        <div>This is a headless document</div>
      </body>
    </html>
  `;

  const result = await PageExtractorParent.getHeadlessExtractor({
    urlString: url,
    callback: async pageExtractor => pageExtractor.getText(),
  });

  is(
    result.text,
    "This is a headless document",
    "The page's content is extracted"
  );

  await cleanup();
});

/**
 * Test what happens on a 404 page.
 */
add_task(async function test_headless_extraction_404() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );
  const { html } = MLTestUtils.serveHTML({ code: 404 });
  const { url, cleanup } = html`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>404 not found</title>
      </head>
      <body>
        <div>404 page not found.</div>
      </body>
    </html>
  `;

  const result = await PageExtractorParent.getHeadlessExtractor({
    urlString: url,
    callback: async pageExtractor => pageExtractor.getText(),
  });

  is(
    result.text,
    "404 page not found.",
    "The page's content is extracted even if it's a 404"
  );

  await cleanup();
});

/**
 * A page that never responds must not leave the extractor waiting forever.
 */
add_task(async function test_headless_extraction_never_loads() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.pageExtractor.headlessTimeoutMs", 500]],
  });

  const { url, cleanup } = MLTestUtils.serveStalledPage();
  await Assert.rejects(
    PageExtractorParent.getHeadlessExtractor({
      urlString: url,
      callback: () =>
        ok(false, "The callback must not run for a page that never loaded."),
    }),
    /did not load in a headless browser within 500ms/,
    "The extractor gives up on a stalled page."
  );
  await cleanup();

  await SpecialPowers.popPrefEnv();
});

/**
 * A redirect to another site, the way bot detection sends a request off to a
 * challenge page, is reported as a block rather than a timeout.
 */
add_task(async function test_headless_extraction_cross_site_redirect() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.pageExtractor.headlessTimeoutMs", 500]],
  });

  await Assert.rejects(
    PageExtractorParent.getHeadlessExtractor({
      urlString: `https://example.com${TEST_DIR}redirect_to.sjs?https://w3c-test.org/`,
      callback: () =>
        ok(false, "The callback must not run for a page redirected off-site."),
    }),
    error =>
      error.name === "BlockedError" &&
      /ended up at https:\/\/w3c-test\.org\//.test(error.message),
    "The cross-site redirect is reported as a block, not a timeout."
  );

  await SpecialPowers.popPrefEnv();
});

/**
 * A page can redirect itself instead of the server doing it, with a meta
 * refresh or by setting location. When it lands on the requested site, the
 * page it lands on is the one read.
 */
add_task(async function test_headless_extraction_same_site_self_redirect() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  const onSite = `https://example.com${TEST_DIR}redirect_target.html`;

  for (const [mode, mechanism] of [
    ["meta", '<meta http-equiv="refresh">'],
    ["replace", "location.replace()"],
    ["assign", "location.assign()"],
    ["href", "location.href ="],
  ]) {
    const result = await PageExtractorParent.getHeadlessExtractor({
      urlString:
        `https://example.com${TEST_DIR}client_redirect.sjs?` +
        `${mode}|${encodeURIComponent(onSite)}`,
      callback: pageExtractor => pageExtractor.getText(),
    });
    // The two pages carry different text, so this also rules out the read
    // having come from the page that issued the redirect.
    is(
      result.text,
      "This page was reached through a redirect.",
      `${mechanism}: the page the redirect lands on is the one read.`
    );
  }
});

/**
 * A challenge page is as often reached without a server redirect: a meta
 * refresh, or a script setting location. Whether the navigation beats the read
 * or the read beats it, the caller is told the page was blocked.
 */
add_task(async function test_headless_extraction_client_side_redirect() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  const offSite = `https://w3c-test.org${TEST_DIR}redirect_target.html`;

  for (const [mode, mechanism] of [
    ["meta", '<meta http-equiv="refresh">'],
    ["replace", "location.replace()"],
    ["assign", "location.assign()"],
    ["href", "location.href ="],
  ]) {
    let readBegan = false;
    let documentReplaced = false;
    await Assert.rejects(
      PageExtractorParent.getHeadlessExtractor({
        urlString:
          `https://example.com${TEST_DIR}client_redirect.sjs?` +
          `${mode}|${encodeURIComponent(offSite)}`,
        callback: async pageExtractor => {
          readBegan = true;
          // A meta refresh only runs once the page has loaded, so the read
          // can be handed a live actor.
          await TestUtils.waitForCondition(() => {
            try {
              return !pageExtractor.browsingContext;
            } catch {
              // The actor went with the document it was bound to.
              return true;
            }
          }, `The ${mode} redirect should replace the document being read.`);
          documentReplaced = true;
          return pageExtractor.getText();
        },
      }),
      error =>
        error.name === "BlockedError" && /w3c-test\.org/.test(error.message),
      `${mechanism} off-site is reported as a block.`
    );
    // Either ordering is fine, but a read that began must have lost its
    // document. A wait that timed out instead would reach the same rejection
    // by another route, and pass.
    ok(
      !readBegan || documentReplaced,
      `${mechanism}: any read that began lost its document to the redirect.`
    );
  }
});

/**
 * The History API and fragment navigation rewrite the address without loading
 * a page, and cannot leave the origin, which is how single-page apps move
 * between views. Such a page is read, not taken for a redirect off the site.
 */
add_task(async function test_headless_extraction_history_api() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  for (const [mode, mechanism, address] of [
    ["pushstate", "history.pushState()", "/pushed-by-the-page"],
    ["replacestate", "history.replaceState()", "/replaced-by-the-page"],
    ["hash", "location.hash", "#moved-by-the-page"],
  ]) {
    const read = await PageExtractorParent.getHeadlessExtractor({
      urlString: `https://example.com${TEST_DIR}client_redirect.sjs?${mode}|`,
      callback: async pageExtractor => ({
        text: (await pageExtractor.getText())?.text,
        address: pageExtractor.browsingContext.currentURI.spec,
      }),
    });
    // Without this the task would pass whether or not the page ever called
    // the API, which is the whole point of the case.
    ok(
      read.address.endsWith(address),
      `${mechanism} moved the address to ${address}, so the API ran.`
    );
    is(
      read.text,
      "This page redirects itself.",
      `${mechanism}: the page is still read after rewriting its address.`
    );
  }
});

/**
 * A page that reloads itself every few minutes, the way news front pages do,
 * would not be replaced before the read gives up, so it is read as it is.
 */
add_task(async function test_headless_extraction_long_self_refresh() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  for (const [mode, mechanism] of [
    ["longrefresh", '<meta http-equiv="refresh" content="300">'],
    ["longrefreshheader", "Refresh: 300"],
    [
      "malformedrefresh",
      '<meta http-equiv="refresh" content="0x"> beside Refresh: 300',
    ],
  ]) {
    const read = await PageExtractorParent.getHeadlessExtractor({
      urlString: `https://example.com${TEST_DIR}client_redirect.sjs?${mode}|`,
      callback: async pageExtractor => ({
        text: (await pageExtractor.getText())?.text,
        refreshPending: await SpecialPowers.spawn(
          pageExtractor.browsingContext,
          [],
          () => docShell.QueryInterface(Ci.nsIRefreshURI).refreshPending
        ),
      }),
    });
    // Without this the task would pass whether or not the page ever scheduled
    // its refresh, which is the whole point of the case.
    ok(read.refreshPending, `${mechanism} scheduled a refresh.`);
    is(
      read.text,
      "This page redirects itself.",
      `${mechanism}: the page is read without waiting for its refresh.`
    );
  }
});

/**
 * A short refresh whose URL does not parse is dropped by the docshell, but its
 * time is still read, so a long refresh beside it is waited on until the read
 * gives up.
 */
add_task(async function test_headless_extraction_unparsable_refresh_url() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.pageExtractor.headlessTimeoutMs", 500]],
  });

  let text;
  try {
    ({ text } = await PageExtractorParent.getHeadlessExtractor({
      urlString: `https://example.com${TEST_DIR}client_redirect.sjs?unparsableurlrefresh|`,
      callback: pageExtractor => pageExtractor.getText(),
    }));
  } catch (error) {
    // Only the timeout from waiting on the dropped refresh is the known
    // failure; anything else must fail the test rather than hide behind it.
    if (error?.name !== "TimeoutError") {
      throw error;
    }
    info(`The read timed out: ${error.message}`);
  }
  // TODO (Bug 2075047) - The docshell does not expose which refreshes it
  // scheduled, so the dropped declaration cannot be told apart from them.
  todo_is(
    text,
    "This page redirects itself.",
    "The page is read without waiting on the dropped refresh."
  );

  await SpecialPowers.popPrefEnv();
});

/**
 * A loopback host is registered to nobody and answers for whatever is
 * listening on the port, so each port is a separate program rather than
 * another part of one site.
 */
add_task(async function test_headless_extraction_loopback_port() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );
  const { HttpServer } = ChromeUtils.importESModule(
    "resource://testing-common/httpd.sys.mjs"
  );

  function serveHTML(response, body) {
    response.setHeader("Content-Type", "text/html; charset=utf-8", false);
    response.write(`<!DOCTYPE html><p>${body}</p>`);
  }

  const otherService = new HttpServer();
  otherService.registerPathHandler("/service", (request, response) =>
    serveHTML(response, "Another local service.")
  );
  otherService.start(-1);
  // eslint-disable-next-line sdl/no-insecure-url
  const otherServiceUrl = `http://localhost:${otherService.identity.primaryPort}/service`;

  const requested = new HttpServer();
  requested.registerPathHandler("/to-another-port", (request, response) => {
    response.setStatusLine(request.httpVersion, 302, "Found");
    response.setHeader("Location", otherServiceUrl);
  });
  requested.registerPathHandler("/to-another-path", (request, response) => {
    response.setStatusLine(request.httpVersion, 302, "Found");
    response.setHeader("Location", "/moved");
  });
  requested.registerPathHandler("/moved", (request, response) =>
    serveHTML(response, "The requested local service.")
  );
  requested.start(-1);
  // eslint-disable-next-line sdl/no-insecure-url
  const requestedOrigin = `http://localhost:${requested.identity.primaryPort}`;

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.pageExtractor.headlessTimeoutMs", 500]],
  });
  await Assert.rejects(
    PageExtractorParent.getHeadlessExtractor({
      urlString: `${requestedOrigin}/to-another-port`,
      callback: () =>
        ok(false, "The callback must not run for a different local service."),
    }),
    error =>
      error.name === "BlockedError" && error.message.includes(otherServiceUrl),
    "A redirect to another port on the same loopback host is a block."
  );
  await SpecialPowers.popPrefEnv();

  const result = await PageExtractorParent.getHeadlessExtractor({
    urlString: `${requestedOrigin}/to-another-path`,
    callback: pageExtractor => pageExtractor.getText(),
  });
  is(
    result.text,
    "The requested local service.",
    "A redirect within the same loopback port is the requested site."
  );

  await new Promise(resolve => requested.stop(resolve));
  await new Promise(resolve => otherService.stop(resolve));
});

/**
 * The redirects a site sends before serving its content, each named in the
 * cases below. All stay on the requested site, so the extraction completes.
 */
add_task(async function test_headless_extraction_same_site_redirects() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  // HTTPS-First would upgrade the http requests before the server could.
  await SpecialPowers.pushPrefEnv({
    set: [["dom.security.https_first", false]],
  });

  const target = host => `https://${host}${TEST_DIR}redirect_target.html`;
  const redirect = (origin, to) => `${origin}${TEST_DIR}redirect_to.sjs?${to}`;

  const cases = [
    {
      name: "http to https upgrade",
      // eslint-disable-next-line sdl/no-insecure-url
      url: redirect("http://example.com", target("example.com")),
    },
    {
      name: "apex to www",
      url: redirect("https://example.com", target("www.example.com")),
    },
    {
      name: "www to apex",
      url: redirect("https://www.example.com", target("example.com")),
    },
    {
      name: "locale or mobile subdomain",
      url: redirect("https://example.com", target("test1.example.com")),
    },
    {
      name: "moved page on the same host",
      url: redirect("https://example.com", target("example.com")),
    },
    {
      name: "https to http downgrade on a non-anonymous fetch",
      url: redirect(
        "https://example.com",
        // eslint-disable-next-line sdl/no-insecure-url
        `http://www.example.com${TEST_DIR}redirect_target.html`
      ),
    },
    {
      name: "http apex to https www chain",
      url: redirect(
        // eslint-disable-next-line sdl/no-insecure-url
        "http://example.com",
        redirect("https://example.com", target("www.example.com"))
      ),
    },
  ];

  for (const { name, url } of cases) {
    const result = await PageExtractorParent.getHeadlessExtractor({
      urlString: url,
      callback: async pageExtractor => pageExtractor.getText(),
    });
    is(
      result.text,
      "This page was reached through a redirect.",
      `${name}: the redirect stays on the requested site and the extraction completes.`
    );
  }

  await SpecialPowers.popPrefEnv();
});

/**
 * A chain may leave the site and come back, the way a consent or sign-on host
 * hands the request on. Only where it finally lands matters, so example.com
 * to w3c-test.org and back is read.
 */
add_task(async function test_headless_extraction_offsite_bounce() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  const landing = `https://example.com${TEST_DIR}redirect_target.html`;
  const bounce = `https://w3c-test.org${TEST_DIR}redirect_to.sjs?${landing}`;

  const result = await PageExtractorParent.getHeadlessExtractor({
    urlString: `https://example.com${TEST_DIR}redirect_to.sjs?${bounce}`,
    callback: pageExtractor => pageExtractor.getText(),
  });
  is(
    result.text,
    "This page was reached through a redirect.",
    "A chain that bounces off-site and back is read from where it landed."
  );
});

/**
 * A redirect to another registrable domain is off the requested site even when
 * the name matches, because the public suffix list hands out suffixes such as
 * github.io: a same-name host can belong to anyone.
 */
add_task(async function test_headless_extraction_same_name_other_domain() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.pageExtractor.headlessTimeoutMs", 500]],
  });

  const target = `https://example.org${TEST_DIR}redirect_target.html`;
  await Assert.rejects(
    PageExtractorParent.getHeadlessExtractor({
      urlString: `https://example.com${TEST_DIR}redirect_to.sjs?${target}`,
      callback: () =>
        ok(false, "The callback must not run for another registrable domain."),
    }),
    error =>
      error.name === "BlockedError" && error.message.includes("example.org"),
    "example.com to example.org is a block, not the same site."
  );

  await SpecialPowers.popPrefEnv();
});

/**
 * An intranet host that redirects to a public domain reusing its name has left
 * the requested site: without a known public suffix on both sides, the name
 * alone proves nothing.
 */
add_task(async function test_headless_extraction_intranet_name_collision() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  // HTTPS-First would upgrade the http requests before the server could.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.pageExtractor.headlessTimeoutMs", 500],
      ["dom.security.https_first", false],
    ],
  });

  // eslint-disable-next-line sdl/no-insecure-url
  const target = `http://httpsfirst.com${TEST_DIR}redirect_target.html`;
  await Assert.rejects(
    PageExtractorParent.getHeadlessExtractor({
      // eslint-disable-next-line sdl/no-insecure-url
      urlString: `http://httpsfirst.local${TEST_DIR}redirect_to.sjs?${target}`,
      callback: () =>
        ok(
          false,
          "The callback must not run for a page that left the intranet host."
        ),
    }),
    error => error.name === "BlockedError",
    "The public domain reusing the intranet name is not the requested site."
  );

  await SpecialPowers.popPrefEnv();
});

/**
 * An anonymous fetch must stay on https: a same-site redirect down to http is
 * not handed to the callback.
 */
add_task(async function test_headless_extraction_anonymous_http_downgrade() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  // HTTPS-First would upgrade the http destination and hide the downgrade.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.pageExtractor.headlessTimeoutMs", 500],
      ["dom.security.https_first", false],
    ],
  });

  // eslint-disable-next-line sdl/no-insecure-url
  const target = `http://www.example.com${TEST_DIR}redirect_target.html`;
  await Assert.rejects(
    PageExtractorParent.getHeadlessExtractor({
      urlString: `https://example.com${TEST_DIR}redirect_to.sjs?${target}`,
      anonymousFetch: true,
      callback: () =>
        ok(false, "The callback must not run for a page downgraded to http."),
    }),
    error => error.name === "BlockedError",
    "The anonymous fetch refuses the http page."
  );

  await SpecialPowers.popPrefEnv();
});

/**
 * Test page extraction on a restricted page.
 */
add_task(async function test_headless_extraction_about_blank() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  await Assert.rejects(
    PageExtractorParent.getHeadlessExtractor({
      urlString: "about:blank",
      callback: () => {},
    }),
    /Only http: and https: URLs are supported/,
    "PageExtractor fails on about: pages."
  );
});

/**
 * Test page extraction on a file URL.
 */
add_task(async function test_headless_extraction_about_blank() {
  const { PageExtractorParent } = ChromeUtils.importESModule(
    "resource://gre/actors/PageExtractorParent.sys.mjs"
  );

  await Assert.rejects(
    PageExtractorParent.getHeadlessExtractor({
      urlString: "file:///NeverGonnaGiveYouUp.mp4",
      callback: () => {},
    }),
    /Only http: and https: URLs are supported/,
    "PageExtractor fails on file: URLs."
  );
});
