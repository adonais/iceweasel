## WRShell - Remote debugging for WebRender

### Overview

WRShell is a client for accessing the remote debugging functionality in WebRender.

It doesn't contain many features yet, but the intent is to provide a foundation that is easy to add new debugging and profiling functionality to over time, as needed.

WRShell can run in either CLI or GUI mode. In CLI mode, it runs inside a terminal, providing a simple way to query and adjust parameters of a connected WR instance. In GUI mode, a similar interface is provided to run commands, along with a richer way to view and inspect WR state, as well as viewing realtime data streamed from a WR instance, such as profile counters and graphs.

### Architecture

When a WR instance starts up with remote debugger enabled, it opens a HTTP server listener on socket 3583.

WRShell connects to a running WR instance (e.g. Firefox or Wrench) via HTTP for simple operations, and can optionally open a WebSocket stream for streaming realtime updates, such as profile counters and changes to WR state.

WRShell can connect to either a local instance of WR (default), or an instance running on the same network, such as an Android device, by specifying a target IP address.

### Current Features

 * Query connected status
 * Get or set debug flags
 * Query and display the current spatial tree (basic only, needs additional functionality)
 * Inspect the built scene's picture / primitive tree, highlight the hovered primitive in the rendered frame and disable primitives (see below)
 * Display profile counter graphs (basic only, needs to be extended)
 * Capture the current frame as a RenderDoc trace and open it in RenderDoc

### Building

#### WRShell

Ensure you have `libSDL3` development packages installed on your host machine.

```
cd wrshell
cargo build --release
```

#### Enabling remote debugger in WR

* Enable the `debugger` cargo feature (e.g. in `webrender_bindings` or `wrench`).
* Ensure `enable_debugger` is `true` in the `WebrenderOptions` struct when WR is created.
* If building in Firefox, you will need to locally vendor the remote debugger dependencies - `./mach vendor rust`. We may vendor these in m-c in future.
* When running an application, you should see `Start debug server on [host]` in the output log when starting if the debugger is enabled.

### Running

To run in CLI mode (defaults to local host connection if no IP specified):

`cargo run --release [target IP]`

To run in GUI mode (defaults to local host connection if no IP specified):

`cargo run --release -- gui [target IP]`

### RenderDoc capture

WRShell can capture the current WebRender frame as a RenderDoc `.rdc` trace and open it for inspection.

RenderDoc hooks OpenGL at library-load time, so `librenderdoc` must be loaded into the rendering process *before* its GL context is created (i.e. via `LD_PRELOAD`); a later load cannot capture.

The easiest way is the `mach wrshell` helper:

```
./mach wrshell [url]        # CLI mode
./mach wrshell --gui [url]  # GUI mode
```

This downloads RenderDoc into `~/.mozbuild/renderdoc` if needed, launches Firefox with `librenderdoc` preloaded (and the GPU process disabled, so WebRender renders in the parent process), and starts WRShell connected to it.

To trigger a capture:

* CLI: run `rd` (alias for `renderdoc-capture`).
* GUI: click the **Capture (RenderDoc)** button in the menu bar.

The `.rdc` is written under `<objdir>/tmp/renderdoc-captures/` and opened in `qrenderdoc` automatically. WRShell locates `qrenderdoc` via `$WR_RENDERDOC_DIR`, then `$PATH`, then the `~/.mozbuild/renderdoc` cache.

To capture against a manually-launched instance, run it with `LD_PRELOAD=.../librenderdoc.so` and set `WR_RENDERDOC_CAPTURE_PATH` to the desired capture-file template.

Capturing forces a full picture-cache invalidation for the captured frame, so all tiles are re-rasterized within the capture — a single-frame capture cannot replay WebRender's persistent cached tile textures.

### Scene inspector

The **Scene** panel (GUI) and the `get-scene` command (CLI) show the tree of pictures and primitive instances of the built scene currently held by the render backend, that is, what WebRender actually renders after scene building rather than the display list as sent by the content process. Each node shows the primitive index, kind, a kind-specific summary (composite mode, glyph count, ...) and, for rectangles, box shadows and text runs, a swatch of the primitive color.

In the GUI:

* Clicking a primitive selects it. The panel on the right shows its details (local rect, approximate device rect, spatial node, outcome of the last visibility pass, ...) along with its ancestors and children, which can be clicked to navigate.
* Hovering a primitive highlights it in the rendered frame. **Replace** swaps the primitive for an opaque pink quad (honoring its clips, transform and z-order), **Overlay** outlines its device rect in pink on top of the composited frame, leaving its content visible, so that it can be located even when occluded. Moving the pointer away clears the highlight.
* The checkbox next to each primitive disables it; a disabled picture hides its whole subtree. **Enable all** clears the disabled set.
* Right-clicking a node opens a menu of bulk actions. **Focus on this node** disables every other primitive, except the node's ancestors (disabling them would hide the node too) and, for pictures and tile caches, its descendants. **Disable children** / **Enable children** act on the subtree of a picture.

Both take effect at frame building time without rebuilding the scene. Primitive indices are only valid for one built scene: when a new display list arrives, WebRender drops the override, and the panel reports an error if a stale selection is pushed. Click **Refresh** to fetch the new scene.

Highlighting a pass-through picture (one without its own surface) in Replace mode hides it instead, as it has no rect of its own.

### Extending

### Adding commands

First, add functionality to WR for a new operation by adding a new endpoint in the `src/webrender/debugger.rs` in the `start` function.

Next, add a new command to the shell in `wrshell/src/debug_commands.rs`, and register it in `debug_commands::register`.
