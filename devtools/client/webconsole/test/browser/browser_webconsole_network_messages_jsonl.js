/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests that a JSON Lines response is displayed as a tree, with a localized
 * label, when expanding a network message in the Console panel.
 */

const httpServer = createTestHTTPServer();
httpServer.registerContentType("html", "text/html");

const BASE_URL = `http://localhost:${httpServer.identity.primaryPort}/`;
const TEST_URL = BASE_URL + "doc-jsonl.html";
const JSONL_URL = BASE_URL + "data.jsonl";

const JSONL_LABEL = "JSON Lines";

httpServer.registerPathHandler("/doc-jsonl.html", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);
  response.write(`<!DOCTYPE html><meta charset=utf8>JSON Lines test`);
});
httpServer.registerPathHandler("/data.jsonl", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "application/jsonl; charset=utf-8", false);
  response.write(
    '{ "greeting": "Hello JSON Lines!" }\n' +
      '{ "greeting": "Hello again!" }\n' +
      '{ "greeting": "And once more!" }\n'
  );
});

add_task(async function () {
  await pushPref("devtools.webconsole.filter.net", false);
  await pushPref("devtools.webconsole.filter.netxhr", true);
  await pushPref("devtools.netmonitor.ui.default-raw-response", false);

  const hud = await openNewTabAndConsole(TEST_URL);

  const onMessage = waitForMessageByType(hud, JSONL_URL, ".network");
  await SpecialPowers.spawn(
    gBrowser.selectedBrowser,
    [JSONL_URL],
    async url => {
      await content.fetch(url);
    }
  );
  const { node } = await onMessage;

  info("Expand the message and open the response tab");
  const onPayloadReady = hud.ui.once("network-request-payload-ready");
  node.querySelector(".url").click();
  await waitFor(
    () => node.querySelector(".network-info"),
    "Wait for .network-info to be rendered"
  );
  await onPayloadReady;
  node.querySelector("#response-tab").click();

  const responsePanel = node.querySelector("#response-panel");
  await waitFor(
    () => responsePanel.querySelectorAll(".treeRow").length === 3,
    "Wait for the JSON Lines entries to be rendered"
  );

  is(
    responsePanel.querySelector(".data-label").textContent,
    JSONL_LABEL,
    "The response payload should be labelled as JSON Lines."
  );
  Assert.deepEqual(
    Array.from(
      responsePanel.querySelectorAll("tr .treeLabelCell .treeLabel"),
      element => element.textContent
    ),
    ["0", "1", "2"],
    "Entries should be labelled with their index, in document order."
  );

  await closeToolboxIfOpen();
});
