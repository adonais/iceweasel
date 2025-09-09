/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  MockRegistrar: "resource://testing-common/MockRegistrar.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  TaskbarTabsUtils: "resource:///modules/taskbartabs/TaskbarTabsUtils.sys.mjs",
});

const kPngFile = do_get_file("favicon-normal16.png");
const kSvgFile = do_get_file("icon.svg");
const kSvgUri = Services.io.newFileURI(kSvgFile);

let gDefaultFaviconUri = kSvgUri;

let gMockFaviconService = {
  QueryInterface: ChromeUtils.generateQI(["nsIFaviconService"]),
  getFaviconForPage: sinon.stub(),
  get defaultFavicon() {
    return gDefaultFaviconUri;
  },
};
let gDefaultFaviconSpy = sinon.spy(gMockFaviconService, "defaultFavicon", [
  "get",
]);

MockRegistrar.register(
  "@mozilla.org/browser/favicon-service;1",
  gMockFaviconService
);

let gPngBytes;

add_setup(async () => {
  const pngArray = await IOUtils.read(kPngFile.path);
  gPngBytes = pngArray.buffer;
});

add_task(async function test_favicon_default_fallback() {
  const uri = Services.io.newURI("https://www.example.com");

  gMockFaviconService.getFaviconForPage.callsFake(async () => {
    return { rawData: gPngBytes, mimeType: "image/png" };
  });
  await TaskbarTabsUtils.getFavicon(uri);
  ok(
    gDefaultFaviconSpy.get.notCalled,
    "Fallback to default favicon should not occur for valid raster favicon data."
  );

  gMockFaviconService.getFaviconForPage.callsFake(async () => {
    return {
      dataURI: Services.io.newFileURI(kSvgFile),
      mimeType: "image/svg+xml",
    };
  });
  await TaskbarTabsUtils.getFavicon(uri);
  ok(
    gDefaultFaviconSpy.get.notCalled,
    "Fallback to default favicon should not occur for valid vector favicon data."
  );

  gMockFaviconService.getFaviconForPage.callsFake(async () => {
    return { rawData: null, mimeType: "image/png" };
  });
  await TaskbarTabsUtils.getFavicon(uri);
  ok(
    gDefaultFaviconSpy.get.called,
    "Fallback to default favicon should occur for invalid favicon data."
  );

  gMockFaviconService.getFaviconForPage.callsFake(async () => {
    return null;
  });
  gDefaultFaviconUri = Services.io.newURI("https://www.example.com");
  await rejects(
    TaskbarTabsUtils.getFavicon(uri),
    /Scheme "https" is not supported for creating a Taskbar Tab icon, URI should be local/,
    "Network URI for the default favicon should have thrown."
  );
});
