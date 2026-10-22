/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Serves a page that redirects itself, without the server answering with a
// 302. The query string is `<mode>|<absolute target URL>`.
function handleRequest(request, response) {
  const separator = request.queryString.indexOf("|");
  const mode = request.queryString.slice(0, separator);
  const target = decodeURIComponent(request.queryString.slice(separator + 1));
  const quoted = JSON.stringify(target);

  const redirects = {
    meta: `<meta http-equiv="refresh" content="0; url=${target}">`,
    replace: `<script>location.replace(${quoted});</script>`,
    assign: `<script>location.assign(${quoted});</script>`,
    href: `<script>location.href = ${quoted};</script>`,
    // The History API cannot leave the document's own origin, so these only
    // rewrite the address of the page being read.
    pushstate: `<script>history.pushState({}, "", "/pushed-by-the-page");</script>`,
    replacestate: `<script>history.replaceState({}, "", "/replaced-by-the-page");</script>`,
    hash: `<script>location.hash = "#moved-by-the-page";</script>`,
    // Reloads itself long after any read would have given up.
    longrefresh: `<meta http-equiv="refresh" content="300">`,
    longrefreshheader: "",
    // Declarations the docshell drops, beside the long Refresh header below.
    malformedrefresh: `<meta http-equiv="refresh" content="0x">`,
    unparsableurlrefresh: `<meta http-equiv="refresh" content="0; url=https://[">`,
  };

  if (
    ["longrefreshheader", "malformedrefresh", "unparsableurlrefresh"].includes(
      mode
    )
  ) {
    response.setHeader("Refresh", "300", false);
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8", false);
  response.write(
    `<!DOCTYPE html><html><body><p>This page redirects itself.</p>${redirects[mode]}</body></html>`
  );
}
