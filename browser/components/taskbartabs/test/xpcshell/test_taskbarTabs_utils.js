/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  MockRegistrar: "resource://testing-common/MockRegistrar.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  TaskbarTabsUtils: "resource:///modules/taskbartabs/TaskbarTabsUtils.sys.mjs",
});

let faviconUri;
let defaultFavicon = Services.io.newFileURI(
  do_get_file("favicon-normal16.png")
);

let mockFaviconService = {
  QueryInterface: ChromeUtils.generateQI(["nsIFaviconService"]),
  getFaviconForPage: sinon.stub().callsFake(async () => {
    return { dataURI: faviconUri };
  }),
  get defaultFavicon() {
    return defaultFavicon;
  },
};
let defaultFaviconSpy = sinon.spy(mockFaviconService, "defaultFavicon", [
  "get",
]);

MockRegistrar.register(
  "@mozilla.org/browser/favicon-service;1",
  mockFaviconService
);

add_task(async function test_favicon_local_only() {
  const uri = Services.io.newURI("https://www.example.com");

  faviconUri = Services.io.newFileURI(do_get_file("favicon-normal16.png"));
  await TaskbarTabsUtils.getFavicon(uri);
  ok(
    defaultFaviconSpy.get.notCalled,
    "Fallback to default favicon should not occur for local URIs."
  );

  faviconUri = Services.io.newURI("https://www.example.com");
  await TaskbarTabsUtils.getFavicon(uri);
  ok(
    defaultFaviconSpy.get.called,
    "Favicon provided as a network URI should have triggered a fallback to the default favicon."
  );

  defaultFavicon = Services.io.newURI("https://www.example.com");
  await rejects(
    TaskbarTabsUtils.getFavicon(uri),
    /Scheme "https" is not supported for creating a Taskbar Tab icon, URI should be local/,
    "Network URI for the default favicon should have thrown."
  );
});
