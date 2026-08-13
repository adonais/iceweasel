# Layout Debugger

## Overview

The layout debugger can dump a variety of things including:

- Matched CSS Rules
- Style Sheets
- Content (DOM) tree
- Text Runs
- Frames
- Retained display list

## Usage

- Use a debug build or add `ac_add_options --enable-layout-debugger` to your mozconfig.
- Run with `./mach run --layoutdebug [filename]`. Dump information via Menu -> Dump.

## Command-line options

- Example `./mach run --layoutdebug [filename] --dump-frames`

| Option | Description |
| --- | --- |
| `--layoutdebug [<url>]` | Start with the Layout Debugger. |
| `--autoclose [<seconds>]` | Automatically close the Layout Debugger once the page has loaded, after delaying the specified number of seconds (defaults to 0). |
| `--capture-profile [<filename>]` | Capture a profile of the Layout Debugger using the Gecko Profiler, and save it to the specified file (defaults to `profile.json`). |
| `--paged` | Layout the page in paginated mode. |
| `--anonymous-subtree-dumping` | Toggle option to include anonymous subtrees in content dumps. |
| `--deterministic-frame-dumping` | Toggle option to only include deterministic information in frame dumps, for ease of diffing. |
| `--dump-content` | Dump the content tree after page load. |
| `--dump-frames` | Dump the frame tree (in app units) after page load. |
| `--dump-frames-css-pixels` | Dump the frame tree (in CSS pixels) after page load. |
| `--dump-retained-display-list` | Dump the retained display list after page load. |
