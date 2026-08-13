"use strict";

// helper to create respective manifests for manifest_version 2 and 3
function createSandboxManifest({ manifest_version, csp, pages }) {
  const manifest = {
    manifest_version,
    sandbox: {
      pages,
    },
  };
  if (manifest_version < 3) {
    manifest.sandbox.content_security_policy = csp;
  } else {
    manifest.content_security_policy = { sandbox: csp };
  }
  return manifest;
}

add_task(async function test_default_sandbox_csp() {
  const defaultSandboxCSP = "sandbox allow-scripts; script-src 'self';";

  for (const manifest_version of [2, 3]) {
    info(
      `Testing default sandbox CSP for manifest version ${manifest_version}`
    );
    const extension = ExtensionTestUtils.loadExtension({});
    await extension.startup();
    const policy = WebExtensionPolicy.getByID(extension.id);
    equal(policy.sandboxPageCSP, defaultSandboxCSP, "sandboxCSP is correct.");
    await extension.unload();
  }
});

add_task(async function test_sandbox_null_origin() {
  const server = createHttpServer();
  server.registerPathHandler("/return_origin_header", (request, response) => {
    response.setHeader("Content-Type", "text/plain");
    response.setHeader("Access-Control-Allow-Origin", "*", false);
    response.write(request.getHeader("Origin"));
  });
  server.registerPathHandler("/message_origin.html", (request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.setHeader("Access-Control-Allow-Origin", "*", false);
    response.write(
      `<script>window.top.postMessage(window.origin, "*");</script>`
    );
  });

  const BASE_URL = `http://localhost:${server.identity.primaryPort}`;

  // required to load iframe
  allow_unsafe_parent_loads_when_extensions_not_remote();

  for (const manifest_version of [2, 3]) {
    info(
      `Testing sandbox "null" origin for manifest version ${manifest_version}`
    );
    const extension = ExtensionTestUtils.loadExtension({
      manifest: createSandboxManifest({
        manifest_version,
        pages: ["sandbox.html"],
      }),
      files: {
        "sandbox.html": `<!DOCTYPE html><title>x</title>`,
      },
    });
    await extension.startup();

    const contentPage = await ExtensionTestUtils.loadContentPage(
      extension.extension.getURL("sandbox.html")
    );

    const noExtensionAPI = await contentPage.spawn([], () => {
      const w = content.window.wrappedJSObject;
      return w.browser === undefined && w.chrome === undefined;
    });
    equal(noExtensionAPI, true, "Check that extension API is not exposed");

    const windowOrigin = await contentPage.spawn([], () => {
      return content.window.wrappedJSObject.origin;
    });
    equal(windowOrigin, "null", "Check window origin");

    const requestOrigin = await contentPage.spawn([BASE_URL], async base => {
      const response = await content.window.wrappedJSObject.fetch(
        `${base}/return_origin_header`
      );
      return response.text();
    });
    equal(requestOrigin, "null", "Check origin request header");

    const iframeOrigin = await contentPage.spawn([BASE_URL], base => {
      const { window, document } = content.window.wrappedJSObject;
      return new Promise((resolve, reject) => {
        window.addEventListener("message", event => resolve(event.data), {
          once: true,
        });
        const iframe = document.createElement("iframe");
        iframe.src = `${base}/message_origin.html`;
        iframe.onerror = reject;
        document.body.append(iframe);
      });
    });
    equal(
      iframeOrigin,
      "null",
      "Web page in iframe inherits CSP sandbox from sandboxed extension document"
    );

    await contentPage.close();
    await extension.unload();
  }

  revert_allow_unsafe_parent_loads_when_extensions_not_remote();
});

add_task(async function test_sandbox_csp() {
  const server = createHttpServer();
  server.registerPathHandler("/script_sets_var.js", (request, response) => {
    response.setHeader("Content-Type", "text/javascript");
    response.setHeader("Access-Control-Allow-Origin", "*", false);
    response.write(`window.testRemoteScript = true;`);
  });

  const BASE_URL = `http://localhost:${server.identity.primaryPort}`;

  const sandboxCSP = "sandbox allow-scripts; script-src 'self'";

  const TESTS = [
    {
      description: "Test eval.",
      relaxedPageCSP: `${sandboxCSP} 'unsafe-eval';`,
      restrictedPageCSP: sandboxCSP,
      violatedDirective: "script-src",
      injectInto: contentPage =>
        contentPage.spawn([], () => {
          const { window } = content.window.wrappedJSObject;
          try {
            // eslint-disable-next-line no-eval
            return window.eval("true");
          } catch (e) {
            return false;
          }
        }),
    },
    {
      description: "Test inline script injection.",
      relaxedPageCSP: `${sandboxCSP} 'unsafe-inline';`,
      restrictedPageCSP: sandboxCSP,
      violatedDirective: "script-src-elem",
      injectInto: contentPage =>
        contentPage.spawn([], () => {
          const { window, document } = content.window.wrappedJSObject;
          const script = document.createElement("script");
          script.textContent = "window.testInlineScript = true;";
          document.body.append(script);
          return window.testInlineScript ?? false;
        }),
    },
    {
      description: "Test data URL script injection.",
      relaxedPageCSP: `${sandboxCSP} data:;`,
      restrictedPageCSP: sandboxCSP,
      violatedDirective: "script-src-elem",
      injectInto: contentPage =>
        contentPage.spawn([], () => {
          const { window, document } = content.window.wrappedJSObject;
          return new Promise(resolve => {
            const script = document.createElement("script");
            script.src =
              "data:text/javascript;base64," +
              window.btoa("window.testDataURLScript = true;");
            script.onload = () => {
              resolve(window.testDataURLScript ?? false);
            };
            script.onerror = () => resolve(false);
            document.body.append(script);
          });
        }),
    },
    {
      description: " Test remote script injection.",
      relaxedPageCSP: `${sandboxCSP} http://localhost:*;`,
      restrictedPageCSP: sandboxCSP,
      violatedDirective: "script-src-elem",
      injectInto: contentPage =>
        contentPage.spawn([`${BASE_URL}/script_sets_var.js`], url => {
          const { window, document } = content.window.wrappedJSObject;
          return new Promise(resolve => {
            const script = document.createElement("script");
            script.src = url;
            script.onload = () => {
              resolve(window.testRemoteScript ?? false);
            };
            script.onerror = () => resolve(false);
            document.body.append(script);
          });
        }),
    },
  ];

  async function runWithRelaxedCSP(test, manifest_version) {
    const extension = ExtensionTestUtils.loadExtension({
      manifest: {
        ...createSandboxManifest({
          manifest_version,
          pages: ["sandbox.html"],
          csp: test.relaxedPageCSP,
        }),
        host_permissions: ["http://localhost/*"],
      },
      files: {
        "sandbox.html": `<!DOCTYPE html><title>x</title>`,
      },
    });
    await extension.startup();
    const contentPage = await ExtensionTestUtils.loadContentPage(
      extension.extension.getURL("sandbox.html")
    );
    const result = await test.injectInto(contentPage);
    equal(result, true, test.description);

    await contentPage.close();
    await extension.unload();
  }

  async function runWithRestrictedCSP(test, manifest_version) {
    const extension = ExtensionTestUtils.loadExtension({
      manifest: {
        ...createSandboxManifest({
          manifest_version,
          pages: ["sandbox.html"],
          csp: test.restrictedPageCSP,
        }),
        host_permissions: ["http://localhost/*"],
      },
      files: {
        "sandbox.html": `<!DOCTYPE html><title>x</title>`,
      },
    });
    await extension.startup();
    const contentPage = await ExtensionTestUtils.loadContentPage(
      extension.extension.getURL("sandbox.html")
    );
    const awaitViolation = contentPage.spawn([], () => {
      return new Promise(resolve => {
        content.document.addEventListener(
          "securitypolicyviolation",
          e => {
            resolve(e.violatedDirective);
          },
          { once: true }
        );
      });
    });

    const result = await test.injectInto(contentPage);
    equal(result, false, test.description);

    equal(
      await awaitViolation,
      test.violatedDirective,
      "violation in correct directive"
    );

    await contentPage.close();
    await extension.unload();
  }

  for (const test of TESTS) {
    info(`Running: ${test.description}`);
    for (const manifest_version of [2, 3]) {
      info(`Testing with manifest version ${manifest_version}`);
      info(`Testing with relaxed CSP: ${test.relaxedPageCSP}`);
      await runWithRelaxedCSP(test, manifest_version);
      info(`Testing with restricted CSP: ${test.restrictedPageCSP}`);
      await runWithRestrictedCSP(test, manifest_version);
    }
  }
});

async function embedExtensionPageFromSandbox({
  manifest_version,
  isWebAccessible = false,
}) {
  const manifest = createSandboxManifest({
    manifest_version,
    pages: ["sandbox.html"],
  });
  if (isWebAccessible) {
    manifest.web_accessible_resources =
      manifest_version < 3
        ? ["privileged.html"]
        : [
            {
              resources: ["privileged.html"],
              // TODO bug 2052564: Stop requiring <all_urls> for exposing to a sandboxed document.
              matches: ["<all_urls>"],
            },
          ];
  }

  const extension = ExtensionTestUtils.loadExtension({
    manifest,
    files: {
      "sandbox.html": `<!DOCTYPE html><html>
        <head><meta charset="UTF-8"></head>
        <body></body>
      `,
      // Cannot use browser.test here due to bug 1896824
      "privileged.html": `<script src='privileged.js'><\/script>`,
      "privileged.js": function () {
        window.top.postMessage(typeof browser != "undefined", "*");
      },
    },
  });
  await extension.startup();

  const sandboxURL = extension.extension.getURL("sandbox.html");
  const sandboxPage = await ExtensionTestUtils.loadContentPage(sandboxURL);

  const isPrivileged = await sandboxPage.spawn([], () => {
    return new Promise(resolve => {
      const { window, document } = content;
      window.addEventListener("message", event => resolve(event.data), {
        once: true,
      });
      const iframe = document.createElement("iframe");
      iframe.src = "privileged.html";
      iframe.onerror = () => resolve(null);
      document.body.append(iframe);
    });
  });

  if (isWebAccessible) {
    equal(
      isPrivileged,
      false,
      "Privileged page was loaded without extension API access."
    );
  } else {
    equal(isPrivileged, null, "Privileged page loading was blocked.");
  }

  await sandboxPage.close();
  await extension.unload();
}

add_task(async function test_sandbox_embedding_privileged_page_mv2() {
  await embedExtensionPageFromSandbox({ manifest_version: 2 });
});

add_task(async function test_sandbox_embedding_privileged_page_mv3() {
  await embedExtensionPageFromSandbox({ manifest_version: 3 });
});

add_task(async function test_sandbox_embedding_web_accessible_page_mv2() {
  await embedExtensionPageFromSandbox({
    manifest_version: 2,
    isWebAccessible: true,
  });
});

add_task(async function test_sandbox_embedding_web_accessible_page_mv3() {
  await embedExtensionPageFromSandbox({
    manifest_version: 3,
    isWebAccessible: true,
  });
});

add_task(async function test_sandbox_pages() {
  const TESTS = [
    {
      pages: [],
      isSandboxed: {
        page01: false,
        page02: false,
      },
    },
    {
      pages: ["page01.html"],
      isSandboxed: {
        page01: true,
        page02: false,
      },
    },
    {
      pages: ["/page01.html"],
      isSandboxed: {
        page01: true,
        page02: false,
      },
    },
    {
      pages: ["/page01.html", "/page02.html"],
      isSandboxed: {
        page01: true,
        page02: true,
      },
    },
    {
      pages: ["/page*.html"],
      isSandboxed: {
        page01: true,
        page02: true,
      },
    },
    {
      pages: ["*"],
      isSandboxed: {
        page01: true,
        page02: true,
      },
    },
    {
      pages: ["/page??.html"],
      isSandboxed: {
        page01: false,
        page02: false,
      },
    },
  ];

  for (const test of TESTS) {
    for (const manifest_version of [2, 3]) {
      info(
        `Testing sandbox pages: ${test.pages.join(", ")} for manifest version ${manifest_version}`
      );
      const extension = ExtensionTestUtils.loadExtension({
        manifest: createSandboxManifest({
          manifest_version,
          pages: test.pages,
        }),
        files: {
          "page01.html": `<!DOCTYPE html><title>01</title>`,
          "page02.html": `<!DOCTYPE html><title>02</title>`,
        },
      });
      await extension.startup();

      const contentPage01 = await ExtensionTestUtils.loadContentPage(
        extension.extension.getURL("page01.html")
      );
      const page01IsSandboxed = await contentPage01.spawn(
        [],
        () => content.window.wrappedJSObject.origin === "null"
      );
      equal(
        page01IsSandboxed,
        test.isSandboxed.page01,
        "page01.html is sandboxed"
      );

      const contentPage02 = await ExtensionTestUtils.loadContentPage(
        extension.extension.getURL("page02.html?test=param#testHash")
      );
      const page02IsSandboxed = await contentPage02.spawn(
        [],
        () => content.window.wrappedJSObject.origin === "null"
      );
      equal(
        page02IsSandboxed,
        test.isSandboxed.page02,
        "page02.html is sandboxed"
      );

      await contentPage01.close();
      await contentPage02.close();
      await extension.unload();
    }
  }
});
