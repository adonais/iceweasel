# Capturing WebRender screenshots for debugging

When investigating a WebRender-specific rendering artifact (pixel snapping,
blending, compositing, tiling), the usual automated screenshot paths are not
useful: WebDriver, Marionette and the DevTools screenshot commands all capture
pixels by re-rendering the document through the software `drawSnapshot`
(`CrossProcessPaint`) path, which does **not** go through the WebRender
compositor. A screenshot taken that way can look correct even when the real
on-screen output is wrong.

The `remote.screenshot.use_readback` preference makes automated
screenshots read back the **actual WebRender composited framebuffer** instead, so
captured pixels match what is really on screen (including out-of-process
content).

## Usage

1. Set `remote.screenshot.use_readback` to `true` (documented under the
   Remote Agent "Preferences" page).
2. Take a screenshot the usual way:
   - WebDriver BiDi `browsingContext.captureScreenshot`
   - Marionette / WebDriver classic *Take Screenshot*
   - The `firefox-devtools` MCP `screenshot_page` tool (which drives BiDi)

The returned image now reflects WebRender output. No other change to the client
is required.

## How it works

With the preference enabled, `capture.canvas` (`remote/shared/Capture.sys.mjs`)
draws the content area's on-screen rectangle with
`CanvasRenderingContext2D.drawWindow(..., DRAWWINDOW_USE_WIDGET_LAYERS)` instead
of taking a `drawSnapshot`. In the parent process that flag drives a real
compositor readback (`WebRenderLayerManager::MakeSnapshotIfRequired` ->
`WebRenderBridgeParent::RecvGetSnapshot` -> `WebRenderAPI::Readback` ->
`wr_renderer_readback`), i.e. a `glReadPixels` of the composited framebuffer.

## Limitations

Compositor readback can only return the pixels currently composited on screen,
so this is a debugging aid, not a general-purpose screenshot mode:

- Every capture degrades to the **full content area** of the **foreground tab**.
  Full-document (`origin: "document"`) screenshots, clip regions and element
  screenshots all return the viewport instead of the requested region.
- The target must be a **content** browsing context: drive the WebDriver session
  in content scope. A capture with no content area to read back, such as one
  taken while the session is in chrome (privileged) scope, keeps using the
  non-WebRender `drawSnapshot` path.
- **Not supported on macOS.** There the compositor runs in the GPU process and
  cannot read back the composited window itself, so it asks the parent process
  over `PNativeLayerRemote::RequestReadback`. The parent only honours that
  request in automation (see `NativeLayerRootRemoteMacParent::RecvRequestReadback`),
  and rejects it with `IPC_FAIL`, which crashes the parent process in a debug
  build and kills the GPU process in a release build.
- The capture reflects **whatever is currently composited**, so apply any zoom,
  scroll, or DOM change *before* capturing. Note that browser full-zoom is a
  chrome-scope operation and cannot be combined with a content-scope capture in a
  single step; CSS `zoom` is content-drivable and exercises the same
  effective-zoom rendering path.
- Leave the preference at its default (`false`) for normal automation.
