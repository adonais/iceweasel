"use strict";

add_task(async function srcdoc_blocked_in_parent_process() {
  const iframe = document.createElement("iframe");
  iframe.srcdoc = "<script>throw new Error();</script>";
  document.documentElement.append(iframe);

  const iframe2 = document.createElement("iframe");
  document.documentElement.append(iframe2);
  const load2Promise = BrowserTestUtils.waitForEvent(iframe2, "load", true);
  iframe2.src = "chrome://browser/content/aboutRobots.xhtml";

  registerCleanupFunction(() => {
    iframe.remove();
    iframe2.remove();
  });

  // We don't get load or error events for the srcdoc iframe,
  // so we assume it would finish loading before iframe2.
  await load2Promise;

  is(
    iframe.contentDocument.documentURI,
    "about:blank",
    "srcdoc frame should still be at about:blank"
  );
  is(
    iframe.contentDocument.documentElement.innerHTML,
    "<head></head><body></body>",
    "srcdoc markup should not have been parsed"
  );
});
