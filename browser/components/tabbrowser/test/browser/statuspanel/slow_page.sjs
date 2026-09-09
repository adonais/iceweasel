/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const HTML = `<!DOCTYPE HTML><html><body>hi</body></html>`;

async function handleRequest(req, resp) {
  resp.processAsync();
  resp.setHeader("Cache-Control", "no-cache", false);
  resp.setHeader("Content-Type", "text/html;charset=utf-8", false);

  await new Promise(r => setTimeout(r, 20000));

  resp.write(HTML);
  resp.finish();
}
