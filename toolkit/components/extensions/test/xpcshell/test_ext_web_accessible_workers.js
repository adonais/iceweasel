"use strict";

Services.prefs.setBoolPref("dom.serviceWorkers.testing.enabled", true);

add_setup(() => {
  // This test expects the deprecated legacy behaviors on web_accessible worker scripts
  // to be disabled.
  //
  // TODO(Bug 2074192): remove this part along with removing the emergency rollback pref.
  const DEPRECATED_WEBACCESSIBLE_WORKERS_PREF =
    "extensions.web_accessible_workers.deprecated_behavior";
  if (
    Services.prefs.getBoolPref(DEPRECATED_WEBACCESSIBLE_WORKERS_PREF, false)
  ) {
    info(
      "WARNING: Force disabling deprecated web_accessible workers behaviors enabled through prefs."
    );
    Services.prefs.setBoolPref(DEPRECATED_WEBACCESSIBLE_WORKERS_PREF, false);
  }

  const swm = Cc["@mozilla.org/serviceworkers/manager;1"].getService(
    Ci.nsIServiceWorkerManager
  );
  // Make sure the ServiceWorkerRegistrar data is loaded, otherwise
  // the test task related to the service worker would hit an assertion
  // failure on the successfully registered service worker part of
  // that test case sanity checks.
  swm.reloadRegistrationsForTest();
});

const server = createHttpServer({ hosts: ["example.com"] });
server.registerPathHandler("/worker-redirected.js", (request, response) => {
  response.setHeader("Content-Type", "application/javascript");
  response.write(
    `dump('Loading worker from url "' + self.location.href + '"\\n');`
  );
});

server.registerPathHandler("/test-nested-webworker.js", (request, response) => {
  response.setHeader("Content-Type", "application/javascript");
  response.write(`
    const workerType = ("onconnect" in self) ? "SharedWorker" : "Worker";
    dump('Loading worker from url "' + self.location.href + '"\\n');
    let port;
    const reply = (res) => {
      if (port) {
        port.postMessage(res);
      } else {
        postMessage(res);
      }
    }
    const unexpectedCallback = (evt) => {
      dump('Nested Worker unexpected event ' + evt.type + '\\n');
      reply(false)
    };
    const onmessage = evt => {
      dump('Worker from url "' + self.location.href + '" is handling postMessage\\n');
      const { workerURL } = evt.data;
      dump('Worker from url "' + self.location.href + '" creating nested worker with url "' + evt.data.workerURL + '"\\n');
      const nestedWorker = new Worker(workerURL);
      nestedWorker.onerror = () => reply(true);
      nestedWorker.onmessage = unexpectedCallback;
      nestedWorker.onmessageerror = unexpectedCallback;
    }

    if (workerType === "SharedWorker") {
      this.onconnect = (evt) => {
        port = evt.ports[0];
        port.onmessage = onmessage;
      };
      dump('SharedWorker onconnect registered\\n');
    } else {
      self.onmessage = onmessage;
      dump('Worker onmessage registered\\n');
    }
  `);
});

async function contentScriptForWebPageWorkerTest() {
  const testCreateWorker = async (workerConstructor, workerURL) => ({
    // eslint-disable-next-line no-eval
    hasEmittedErrorEvent: await window.eval(`
        new Promise(resolve => {
          dump("${workerConstructor} constructor is being called\\n");
          let w;
          try {
            w = new ${workerConstructor}("${workerURL}");
          } catch (err) {
            resolve({ errorOnConstructorCall: err.name });
            return;
          }
          w.onerror = (evt) => {
            dump("${workerConstructor} expected event: " + evt.type + "\\n");
            resolve(true);
          };
          const unexpectedCallback = (evt) => {
            dump("${workerConstructor} unexpected event: " + evt.type + "\\n");
            resolve(false)
          };
          w.onmessage = unexpectedCallback;
          w.onmessageerror = unexpectedCallback;
          // Make sure the test fails right away if SharedWorker isn't erroring
          // on load and an unexpected port message is emitted instead.
          if (${workerConstructor}.name === "SharedWorker") {
            w.port.onmessage = unexpectedCallback;
            w.port.onmessageerror = unexpectedCallback;
          }
        });
      `),
  });

  browser.test.onMessage.addListener(async (msg, args) => {
    if (msg !== "worker-from-webpage") {
      browser.test.fail(`Received unexpected test extension message: ${msg}`);
      return;
    }
    browser.test.log(`Create new test workers with url ${args.workerURL}`);
    browser.test.sendMessage("worker-from-webpage:done", {
      Worker: await testCreateWorker("Worker", args.workerURL),
      SharedWorker: args.skipSharedWorkerTest
        ? { skipped: true }
        : await testCreateWorker("SharedWorker", args.workerURL),
    });
  });

  browser.test.sendMessage("contentscript:ready");
}

async function contentScriptForNestedWebPageWorkerTest() {
  const testCreateWorker = async (workerConstructor, nestedWorkerURL) => ({
    // eslint-disable-next-line no-eval
    hasEmittedErrorEvent: await window.eval(`
      new Promise(resolve => {
        dump("${workerConstructor} constructor is being called\\n");
        const w = new ${workerConstructor}("/test-nested-webworker.js");
        const unexpectedCallback = (evt) => {
          dump("${workerConstructor} unexpected event: " + evt.type + "\\n");
          resolve(false)
        };
        w.onerror = unexpectedCallback;
        w.onmessageerror = unexpectedCallback;
        if ("${workerConstructor}" === "SharedWorker") {
          w.port.onmessage = (evt) => resolve(evt.data);
          w.port.postMessage({
            workerURL: "${nestedWorkerURL}",
          });
        } else {
          w.onmessage = (evt) => resolve(evt.data);
          w.postMessage({
            workerURL: "${nestedWorkerURL}",
          });
        }
      });
    `),
  });

  browser.test.onMessage.addListener(async (msg, args) => {
    if (msg !== "worker-from-webpage") {
      browser.test.fail(`Received unexpected test extension message: ${msg}`);
      return;
    }
    browser.test.log(
      `Create new nested test workers with url ${args.workerURL}`
    );
    browser.test.sendMessage("worker-from-webpage:done", {
      Worker: await testCreateWorker("Worker", args.workerURL),
      SharedWorker: args.skipSharedWorkerTest
        ? { skipped: true }
        : await testCreateWorker("SharedWorker", args.workerURL),
    });
  });

  browser.test.sendMessage("contentscript:ready");
}

function createTestExtension({
  files = {},
  manifest = {},
  background = null,
} = {}) {
  if (!files["contentscript.js"]) {
    throw new Error(
      "test extension contentscript.js expected to be overridden by test case"
    );
  }

  return ExtensionTestUtils.loadExtension({
    manifest: {
      content_scripts: [
        {
          matches: ["*://example.com/*"],
          js: ["contentscript.js"],
        },
      ],
      web_accessible_resources: ["worker.js"],
      // NOTE: protocol_handlers isn't currently supported on
      // Android builds.
      protocol_handlers:
        AppConstants.platform == "android"
          ? []
          : [
              {
                protocol: "ext+foo",
                name: "test extension ext+foo protocol handler",
                uriTemplate: "/worker.js",
              },
              {
                protocol: "web+bar",
                name: "test extension web+bar protocol handler",
                uriTemplate: "/worker.js",
              },
              {
                protocol: "ftp",
                name: "test extension ftp protocol handler",
                uriTemplate: "/worker.js",
              },
            ],
      ...manifest,
    },
    background,
    files: {
      "worker.js": function () {
        const workerType = "onconnect" in self ? "SharedWorker" : "Worker";
        dump(`Loading ${workerType} from url "${self.location.href}"\n`);
        if (workerType === "SharedWorker") {
          self.onconnect = evt => {
            const port = evt.ports[0];
            port.postMessage("");
          };
        } else {
          self.postMessage("");
        }
      },
      ...files,
    },
  });
}

async function test_extension_webaccessible_url_as_webpage_worker({
  testNestedWorker,
}) {
  const extension = createTestExtension({
    files: {
      "contentscript.js": testNestedWorker
        ? contentScriptForNestedWebPageWorkerTest
        : contentScriptForWebPageWorkerTest,
    },
  });

  await extension.startup();

  let page = await ExtensionTestUtils.loadContentPage("http://example.com/");

  await extension.awaitMessage("contentscript:ready");

  extension.sendMessage("worker-from-webpage", {
    workerURL: extension.extension.baseURI.resolve("worker.js"),
  });

  Assert.deepEqual(
    await extension.awaitMessage("worker-from-webpage:done"),
    {
      Worker: { hasEmittedErrorEvent: true },
      SharedWorker: { hasEmittedErrorEvent: true },
    },
    "Expect new Worker to have emitted DOM event 'error'"
  );

  await page.close();
  await extension.unload();
}

async function test_webpage_worker_redirected_to_ext_webaccessible({
  testNestedWorker,
}) {
  const extension = createTestExtension({
    manifest: {
      permissions: ["webRequest", "webRequestBlocking", "*://example.com/*"],
    },
    background() {
      const redirectUrl = browser.runtime.getURL("worker.js");
      browser.webRequest.onBeforeRequest.addListener(
        () => {
          browser.test.log(
            `Extension redirecting worker script to extension url: ${redirectUrl}`
          );
          return { redirectUrl };
        },
        { urls: ["*://example.com/worker-redirected.js"] },
        ["blocking"]
      );
    },
    files: {
      "contentscript.js": testNestedWorker
        ? contentScriptForNestedWebPageWorkerTest
        : contentScriptForWebPageWorkerTest,
    },
  });

  await extension.startup();

  let page = await ExtensionTestUtils.loadContentPage("http://example.com/");

  await extension.awaitMessage("contentscript:ready");

  extension.sendMessage("worker-from-webpage", {
    workerURL: "http://example.com/worker-redirected.js",
  });

  Assert.deepEqual(
    await extension.awaitMessage("worker-from-webpage:done"),
    {
      Worker: { hasEmittedErrorEvent: true },
      SharedWorker: { hasEmittedErrorEvent: true },
    },
    "Expect new Worker to have emitted DOM event 'error'"
  );

  await page.close();

  // NOTE: custom protocol handlers are not supported on Android builds.
  const customProtocolsHandlerUrls =
    AppConstants.platform == "android"
      ? []
      : [
          "ext+foo://from-ext-protocol-handler/some-path.js",
          "web+bar://from-ext-protocol-handler/some-path.js",
          "ftp://from-ext-protocol-handler/some-path.js",
        ];

  for (const workerURL of customProtocolsHandlerUrls) {
    info(`Test behavior on ${workerURL} to web_accessible moz-extension url`);

    page = await ExtensionTestUtils.loadContentPage("http://example.com/");

    await extension.awaitMessage("contentscript:ready");

    extension.sendMessage("worker-from-webpage", {
      skipSharedWorkerTest:
        !testNestedWorker && AppConstants.MOZ_DIAGNOSTIC_ASSERT_ENABLED,
      workerURL,
    });

    let expectedSharedWorkerResult = { hasEmittedErrorEvent: true };
    let assertMessage = "Expect new Worker to have emitted DOM event 'error'";

    if (!testNestedWorker && AppConstants.MOZ_DIAGNOSTIC_ASSERT_ENABLED) {
      expectedSharedWorkerResult = { skipped: true };
      assertMessage +=
        " and SharedWorker test be skipped due to MOZ_DIAGNOSTIC_ASSERT_ENABLED set to true";
    }

    Assert.deepEqual(
      await extension.awaitMessage("worker-from-webpage:done"),
      {
        Worker: { hasEmittedErrorEvent: true },
        SharedWorker: expectedSharedWorkerResult,
      },
      assertMessage
    );

    await page.close();
  }

  await extension.unload();
}

// Tests that if a webpage tries to load a webaccessible moz-extension url
// as a webpage worker, then it would fail (like it does when the moz-extension
// url isn't web accessible).
//
// Test that the same is also the case when a webpage worker creates a nested worker
// with a webaccessible moz-extension url.
add_task(async function test_webaccessible_url_as_webpage_worker() {
  info("Test in webpage workers");
  await test_extension_webaccessible_url_as_webpage_worker({
    testNestedWorker: false,
  });
  info("Test in nested webpage workers");
  await test_extension_webaccessible_url_as_webpage_worker({
    testNestedWorker: true,
  });
});

// Tests that the same expectations from the previous test task are also met
// when the webpage creates a worker with a same origin url and it is the
// extension that redirects it to a webaccessible url.
add_task(
  {
    // The webRequest API isn't exposed to background service workers.
    skip_if: () => ExtensionTestUtils.isInBackgroundServiceWorkerTests(),
  },
  async function test_worker_redirected_to_ext_webaccessible() {
    info("Test in webpage workers");
    await test_webpage_worker_redirected_to_ext_webaccessible({
      testNestedWorker: false,
    });
    info("Test in nested webpage workers");
    await test_webpage_worker_redirected_to_ext_webaccessible({
      testNestedWorker: true,
    });
  }
);

// This test confirms that:
// - if a content script creates a webpage Worker instance with a moz-extension url
//   it fails like it would if the webpage was trying to do the same.
// - if the content script creates a extension subframe, then the subframe will be
//   able to successfully create a worker instance with a moz-extension url.
add_task(async function test_create_extension_worker_from_contentscript() {
  const extension = createTestExtension({
    files: {
      "contentscript.js": `(${async function contentScript() {
        function testFromContentScript(workerConstructor) {
          browser.test.log(`Create ${workerConstructor} from content script`);
          return new Promise(resolve => {
            const extWorker = new this[workerConstructor](
              browser.runtime.getURL("/worker.js")
            );
            const unexpectedCallback = evt => {
              browser.test.fail(
                `${workerConstructor} unexpected event: ${evt.type}`
              );
              resolve();
            };
            extWorker.onerror = resolve;
            if (workerConstructor === "SharedWorker") {
              // SharedWorker delivers messages on its port, not on the
              // SharedWorker object itself, otherwise an unexpected message
              // would go unnoticed and the test would hang until timeout
              // instead of failing.
              extWorker.port.onmessage = unexpectedCallback;
              extWorker.port.onmessageerror = unexpectedCallback;
            } else {
              extWorker.onmessage = unexpectedCallback;
              extWorker.onmessageerror = unexpectedCallback;
            }
          });
        }

        await testFromContentScript("Worker");
        await testFromContentScript("SharedWorker");
        const frame = document.createElement("iframe");
        frame.setAttribute("src", browser.runtime.getURL("/extpage.html"));
        document.body.appendChild(frame);
        browser.test.sendMessage("contentscript-create-worker:done");
      }})()`,
      "extpage.html": `<!DOCTYPE html><script src="extpage.js"></script>`,
      "extpage.js": `(${async function extPage() {
        function testFromExtensionSubframe(workerConstructor) {
          browser.test.log(
            `Create ${workerConstructor} from extension subframe`
          );
          return new Promise(resolve => {
            const extWorker = new this[workerConstructor](
              browser.runtime.getURL("/worker.js")
            );
            const unexpectedCallback = evt => {
              browser.test.fail(
                `${workerConstructor} unexpected event: ${evt.type}`
              );
              resolve();
            };
            extWorker.onerror = unexpectedCallback;
            if (workerConstructor === "SharedWorker") {
              extWorker.port.onmessageerror = unexpectedCallback;
              extWorker.port.onmessage = resolve;
              // No need to post a message, port.onmessage implicitly
              // calls port.start() and will trigger the onconnect
              // listener of the SharedWorker side.
            } else {
              extWorker.onmessageerror = unexpectedCallback;
              extWorker.onmessage = resolve;
            }
          });
        }

        await testFromExtensionSubframe("Worker");
        await testFromExtensionSubframe("SharedWorker");
        browser.test.sendMessage("extsubframe-create-worker:done");
      }})()`,
    },
  });

  await extension.startup();

  let page = await ExtensionTestUtils.loadContentPage("http://example.com/");

  await extension.awaitMessage("contentscript-create-worker:done");
  ok(
    true,
    "Create Extension worker from content script disallowed as expected"
  );
  await extension.awaitMessage("extsubframe-create-worker:done");
  ok(
    true,
    "Create Extension worker from extension subframe allowed as expected"
  );

  await page.close();
  await extension.unload();
});

// NOTE: behavior expected when an extension tries to redirect a service worker main script is
// covered by an existing test (dom/workers/test/xpcshell/test_ext_redirects_sw_scripts.js),
// as part of that test we explicitly cover the following additional expectations:
//
// - on a service worker main script, webRequest behaviors are stricter:
//   - redirecting the main script is always prevented and an error logged in the browser console
//     for the redirect being ignored as invalid (the motivation for that choice was due to the fact
//     that any redirect of the original service worker main script request would break, by hitting
//     an NS_ERROR_REDIRECT_LOOP raised from SetupReplacementChannel call to CheckRedirectLimit on
//     the origin service worker main script request being redirected, which would then be turned into
//     a NS_ERROR_DOM_SECURITY_ERR by serviceWorkerScriptCache::CompareNetwork::OnStreamComplete).
//   - replacing the response of the actual service worker main script request using webRequest.filterResponseData
//     is allowed when an additional permission (webRequestFilterResponse.serviceWorkerScript) is being requested
//     and granted (but in that case the url would stay the same and so the resulting service worker would still
//     belong to the web origin related to the service worker main script url as expected).
add_task(async function test_webcontent_sw_register_webaccessible_url() {
  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      web_accessible_resources: ["worker.js"],
    },
    files: {
      "worker.js": function () {
        dump(`Loading ServiceWorker from url "${self.location.href}"\n`);
      },
    },
  });

  await extension.startup();

  function registerAsServiceWorker(workerUrl) {
    return this.content.navigator.serviceWorker.register(workerUrl).then(
      async function success(reg) {
        await reg.unregister();
        return { registeredSuccessfully: true };
      },
      function error(err) {
        return { error: `${err}` };
      }
    );
  }

  // Sanity check: confirm we got the expected behavior on successfully
  // registered service worker.
  info("Try to register a script from the same origin as the webpage");

  let page = await ExtensionTestUtils.loadContentPage("http://example.com");
  const resultSameOriginUrl = await page.spawn(
    ["http://example.com/worker-redirected.js"],
    registerAsServiceWorker
  );
  Assert.deepEqual(
    resultSameOriginUrl,
    { registeredSuccessfully: true },
    "Got the expected success on serviceWorker.register called with a same-origin url"
  );
  await page.close();

  const webAccessibleUrl = extension.extension.baseURI.resolve("worker.js");
  info(`Try to register web_accessible ${webAccessibleUrl}`);
  page = await ExtensionTestUtils.loadContentPage("http://example.com");
  const resultWebAccessibleUrl = await page.spawn(
    [webAccessibleUrl],
    registerAsServiceWorker
  );

  const expectedError = !ExtensionTestUtils.getBackgroundServiceWorkerEnabled()
    ? // This error is currently the one raised when a webpage tries to register a web_accessible url
      // as a service worker from a webpage global when extensions.backgroundServiceWorker.enabled
      // is false.
      { error: "SecurityError: The operation is insecure." }
    : // The error raised by ServiceWorkerContainer::Register call to ServiceWorkerScopeAndScriptAreValid
      // when a webpage tried to register a service worker from a non http/https url.
      // https://searchfox.org/firefox-main/rev/9de2c06fb8/dom/serviceworkers/ServiceWorkerContainer.cpp#265
      {
        error:
          "TypeError: ServiceWorkerContainer.register: Script URL's scheme is not 'http' or 'https'",
      };
  Assert.deepEqual(
    resultWebAccessibleUrl,
    expectedError,
    "Got the expected error on serviceWorker.register called with a web_accessible extension url"
  );
  await page.close();

  await extension.unload();
});
