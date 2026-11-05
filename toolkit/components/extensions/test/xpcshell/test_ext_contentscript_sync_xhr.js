"use strict";

const server = createHttpServer({ hosts: ["example.com"] });
server.registerPathHandler("/page.html", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html");
  response.write("<!DOCTYPE html><head></head><body></body>");
});

let scriptServed = Promise.withResolvers();
server.registerPathHandler("/script.js", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/javascript");
  response.setHeader("Cache-Control", "no-cache");
  response.write("window.scriptRan = true;");
  scriptServed.resolve();
});

// Hold the sync XHR response until the page script has been sent.
server.registerPathHandler("/sync_xhr", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/plain");
  response.setHeader("Cache-Control", "no-cache");
  response.processAsync();
  scriptServed.promise.then(() => {
    response.write("ok");
    response.finish();
  });
});

// Regression test for bug 2077634. When a page inserts an about:blank iframe,
// cached document_start content scripts run synchronously inside the
// appendChild() call. A sync XHR from such a content script spins a nested
// event loop. Like for a sync XHR from the page itself, script execution in
// the page must be blocked during that loop, otherwise a pending page script
// can run in the middle of the page script that inserted the iframe.
add_task(async function test_sync_xhr_in_frame_content_script() {
  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      content_scripts: [
        {
          matches: ["*://example.com/*"],
          match_about_blank: true,
          all_frames: true,
          run_at: "document_start",
          js: ["content.js"],
        },
      ],
    },
    files: {
      "content.js": function () {
        if (window === window.top) {
          return;
        }
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "http://example.com/sync_xhr", false);
        xhr.send();
        window.wrappedJSObject.contentScriptRan = true;
        window.wrappedJSObject.scriptRanDuringXHR =
          !!window.top.wrappedJSObject.scriptRan;
      },
    },
  });
  await extension.startup();

  // Loading the top-level document compiles and caches the content script, so
  // that it runs synchronously during the iframe insertion below.
  const contentPage = await ExtensionTestUtils.loadContentPage(
    "http://example.com/page.html"
  );

  // This task plays the role of the page script that inserts the iframe. The
  // content script in the iframe blocks in a sync XHR until script.js has been
  // served, so script.js finishes loading while this task is still running.
  const result = await contentPage.spawn([], async () => {
    const win = this.content.wrappedJSObject;
    const doc = win.document;

    const script = doc.createElement("script");
    script.src = "/script.js";
    // Script-inserted scripts are async by default; this queues it for in-order
    // execution instead, like the repro attached to bug 2077634.
    script.async = false;
    const scriptLoaded = new Promise(resolve => {
      script.onload = resolve;
    });
    doc.head.appendChild(script);

    const iframe = doc.createElement("iframe");
    // Runs content.js, including its sync XHR, before returning.
    doc.body.appendChild(iframe);

    const frameWin = iframe.contentWindow;
    const res = {
      contentScriptRan: !!frameWin.contentScriptRan,
      scriptRanDuringXHR: !!frameWin.scriptRanDuringXHR,
      scriptRanDuringInsertion: !!win.scriptRan,
    };
    await scriptLoaded;
    res.scriptRanEventually = !!win.scriptRan;
    return res;
  });

  Assert.deepEqual(
    result,
    {
      contentScriptRan: true,
      scriptRanDuringXHR: false,
      scriptRanDuringInsertion: false,
      scriptRanEventually: true,
    },
    "Page script runs only after the inserting script returns"
  );

  await contentPage.close();
  await extension.unload();
});
