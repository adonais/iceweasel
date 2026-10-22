(urlbar-testing)=

# Testing

This documentation discusses how to write a test for the address bar, or for a
search bar built on the address bar's architecture, such as the search bar in
the toolbar or the one on New Tab. It also describes the different test
utilities that are useful when writing such a test.

## Test Types

The address bar's tests are mostly of two types, browser chrome mochitests and
XPCShell tests. The sections below describe each type and when to write which,
and [Common Test Utilities](#common-test-utilities) lists the utilities
available and the test types they work in.

### Browser Chrome Mochitests

Some common tests for the address bar are the **mochitests**. The purpose of
a mochitest is to run the browser itself. Mochitests can be called
"browser tests", "mochitest-browser-chrome", or
"browser-chrome-mochitests". There are other types of mochitests that are not
for testing the browser and therefore can be ignored for the purpose of the
address bar. An example of a mochitest is
[tests/browser/browser_switchTab_currentTab.js](https://searchfox.org/mozilla-central/source/browser/components/urlbar/tests/browser/browser_switchTab_currentTab.js)

### XPCShell

[XPCShell Tests](https://firefox-source-docs.mozilla.org/testing/xpcshell/index.html) are another type of test relevant to the address bar. XPCShell tests
are often called unit tests because they tend to test specific modules or
components in isolation, as opposed the mochitest which have access to the full
browser chrome.

XPCShell tests do not use the browser UI and are completely separate from
browser chrome. XPCShell tests are executed in a JavaScript shell that is
outside of the browser. For historical context, the "XPC" naming convention is
from XPCOM (Cross Platform Component Model) which is an older framework that
allows programmers to write custom functions in one language, such as C++, and
connect it to other components in another language, such as JavaScript.

Each XPCShell test is executed in a new shell instance, therefore you will
see several Firefox icons pop up and close when XPCShell tests are executing.
These are two examples of XPCShell tests for the address bar
{searchfox}`test_providerHeuristicFallback <browser/components/urlbar/tests/unit/test_providerHeuristicFallback.js>`
and
{searchfox}`test_providerTabToSearch <browser/components/urlbar/tests/unit/test_providerTabToSearch.js>`.

### When To Write a XPCShell or Mochitest?

Always default to writing an XPCShell test if it is possible. XPCShell
tests are faster to execute than browser tests. Although, most of the time you
will write a browser test because you could be modifying something in the UI or
testing a specific component in the UI.

If you are writing a test for a urlbarProvider, you can test the Provider
through a XPCShell test. Providers do not modify the UI, instead what they do is
receive a url string query, search for the string and bring back the result. An
example is the {searchfox}`ProviderPlaces <browser/components/urlbar/UrlbarProviderPlaces.sys.mjs>`, which fetches
results from the Places database. Another component that’s good for writing
XPCShell test is the {searchfox}`urlbarMuxer <browser/components/urlbar/UrlbarMuxerStandard.sys.mjs>`.

There may be times where writing both an XPCShell test and browser test is
necessary. In these situations, you could be testing the result from a Provider
and also testing what appears in the UI is correct.

## How To Write a Test

### Test Boilerplate

This basic test boilerplate includes a license code at the top and this license
code is present at the top of every test file, the `"use strict"` string is
to enable strict mode in JavaScript, and `add_task` function adds tests to be
executed by the test harness.

```javascript
/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * This tests ensures that the urlbar ...
 */

"use strict";

add_task(async function testOne() {
  // testing code and assertions
});

add_task(async function testTwo() {
  // testing code and assertions
});
```

In order to run a test use the `./mach` command, for example, `./mach test <path to test
file>` to run test locally. Use the command with `--jsdebugger` argument at
the end to open the DevTools debugger to step through the test, `./mach test
<path to test> --jsdebugger`.

### Manifest

The manifest's purpose is to list all the test in the directory and dictate to
the test harness which files are test and how the test harness should run these
test. Anytime a test is created, the test file name needs to be added to the
manifest in alphabetical order.

Start in the manifest file and add your test name in alphabetical
order. The manifest file we should add our test in is
{searchfox}`browser.toml <browser/components/urlbar/tests/browser/browser.toml>`. The `urlbar/test/browser/` directory
is the main browser test directory for address bar, and the manifest file
linked above is the main browser test manifest.

### Manifest Metadata

The manifest file can define common keys/metadata to influence the test's
behavior. For example, the metadata `support-files` are a list of additional
files required to run a test. Any values assigned to the key `support-files`
only applies to the single file directly above the `support-files` key.
If more files require `support-files`, then `support-files` need to be
added directly under the other test file names. Another example of a manifest
metadata is `[DEFAULT]`. Anything under `[DEFAULT]` will be picked up by
all tests in the manifest file.

For information on all the manifest metadata available, please visit
{doc}`/build/buildsystem/test_manifests`.

## Common Test Utilities

This section describes common test utilities which may be useful when writing a
test for the address bar. Below are a description of common utils where you can
find helpful testing methods.

Many test utils modules end with `TestUtils.sys.mjs`. However not every testing
function will end with `TestUtils.sys.mjs`. For example, [PlacesUtils](https://searchfox.org/firefox-main/source/toolkit/components/places/PlacesUtils.sys.mjs) does not have “Test” within its name.

A critical function to remember is the `registerCleanupFunction` within
the `head.js` file mentioned below. This function's purpose may be to clean
up the history or any other clean ups that are necessary after your test is
complete. Cleaning up after a browser test is necessary because clean up
ensures what is done within one test will not affect subsequent tests.

### head.js and common-head.js

The {searchfox}`head.js <browser/components/urlbar/tests/browser/head.js>` file is executed at the beginning before each
test and contains imports to modules which are useful for each test.
Any tasks `head.js` adds (via add_task) will run first for each test, and
any variables and functions it defines will be available in the scope of
each test. This file is small because most of our Utils are actually in other
`.sys.mjs` files.

The `ChromeUtils.defineESModuleGetters` method within `head.js` sets up
modules names to where they can be found, their paths. `Lazy` means the files
are only imported if or when it is used. Any tests in this directory can use
these modules without importing it themselves in their own file.
The `head.js` provides a convenience for this purpose. The `head.js` file
imports {searchfox}`common-head.js <browser/components/urlbar/tests/browser/head-common.js>`
making everything within `head-common.js` available in `head.js` as well.

The `registerCleanupFunction` is an important function in browser mochi tests
and it is part of the test harness. This function registers a callback function
to be executed when your test is complete. The purpose may be to clean up the
history or any other clean ups that are necessary after your test is complete.
For example, browser mochi tests are executed one after the other in the same
window instance. The global object in each test is the browser `window`
object, for example, each test script runs in the browser window.
If the history is not cleaned up it will remain and may affect subsequent
browser tests. For most test outside of address bar, you may not need to clear
history. In addition to cleanup, `head.js` calls the
`registerCleanupFunction` to ensure the urlbar panel is closed after each
test.

### UrlbarTestUtils and SearchbarTestUtils

{searchfox}`UrlbarTestUtils.sys.mjs <browser/components/urlbar/tests/UrlbarTestUtils.sys.mjs>` is useful for url bar testing. This
file contains methods that can help with starting a new search in the url bar,
waiting for a new search to complete, returning the results in
the view, and etc.

The methods live on the `UrlbarInputBaseTestUtils` class, which drives any
input built on `UrlbarInputBase`. Its constructor takes a function that returns
the input for a window. The module exports two instances of it:
`UrlbarTestUtils` drives the address bar, and `SearchbarTestUtils` drives the
search bar in the toolbar. Both take a window as their first argument or as a
`window` option.

### NewtabSearchbarTestUtils and NewtabSearchbarContentTestUtils

These two modules drive the `<moz-urlbar>` on about:newtab, and a test uses
them together. The tests in
{searchfox}`tests/browser-newtab/ <browser/components/urlbar/tests/browser-newtab/>`
are the ones that use them. To run them:

```
./mach mochitest browser/components/urlbar/tests/browser-newtab/
```

The search bar lives in the page, in a privileged about content process, while
a browser-chrome test runs in the parent process. The suite therefore runs the
`UrlbarInputBaseTestUtils` methods in the content process, and reaches them
from the test in two layers:

- {searchfox}`NewtabSearchbarContentTestUtils.sys.mjs <browser/components/urlbar/tests/NewtabSearchbarContentTestUtils.sys.mjs>`
  subclasses `UrlbarInputBaseTestUtils` and runs in a `SpecialPowers.spawn`
  task in the page's process. Its methods take the task's `content` where the
  chrome methods take a window. The methods that only work in the parent
  process throw.
- {searchfox}`NewtabSearchbarTestUtils.sys.mjs <browser/components/urlbar/tests/NewtabSearchbarTestUtils.sys.mjs>`
  is what a test calls. Its methods take a `browser` where `UrlbarTestUtils`
  takes a window, and forward each call to the content side over one
  `SpecialPowers.spawn`. Arguments and return values are structured-cloned, so
  `getDetailsOfResultAt` rebuilds the result from its wire form and returns
  `element` as null.

{searchfox}`head.js <browser/components/urlbar/tests/browser-newtab/head.js>`
sets up `NewtabSearchbarTestUtils` and adds `add_telemetry_task`, which opens
about:newtab with telemetry, history and form history cleared and closes the
tab afterwards.

`forward(browser, method, args)` calls a content-side method that
`NewtabSearchbarTestUtils` does not list, as long as its arguments and its
result can be cloned. For several steps, one `spawn` task costs a single round
trip, and runs with `NewtabSearchbarContentTestUtils` bound to the task's own
`Assert` and `EventUtils`:

```javascript
await NewtabSearchbarTestUtils.spawn(browser, [], async () => {
  let bar = NewtabSearchbarContentTestUtils.getUrlbar(content);
  // ...
});
```

The tests reach the element through this test-only module pair rather than
through a hook on `UrlbarChild` or `window.UrlbarActorPort`. The port is the
only surface the actor gives the page, and it ships in release builds, so a
test hook there would widen what the page can reach.

about:newtab is preloaded, so a test that opens the tab without
`openNewTabPage()` can hang waiting for a load, or never see focus and blur
events in the page. `openNewTabPage()` waits for the search bar to exist and
for the tab to have focus.

### BrowserTestUtils

[BrowserTestUtils.sys.mjs](../../testing/browser-chrome/browsertestutils.md)
is useful for browser window testing. This file contains methods that can help
with opening tabs, waiting for certain events to happen in the window, opening
new or private windows, and etc.

### TestUtils

[TestUtils.sys.mjs](../../testing/testutils.md) is useful for general
purpose testing and does not depend on the browser window. This file contains
methods that are useful when waiting for a condition to return true, waiting for
a specific preference to change, and etc.

### PlacesTestUtils

{searchfox}`PlacesTestUtils.sys.mjs <toolkit/components/places/tests/PlacesTestUtils.sys.mjs>` is useful for adding visits, adding
bookmarks, waiting for notification of visited pages, and etc.

### EventUtils

{searchfox}`EventUtils.js <testing/mochitest/tests/SimpleTest/EventUtils.js>` is an older test file and does not
need to be imported because it is not a `.sys.mjs` file. `EventUtils` is only
used for browser tests, unlike the other TestUtils listed above which are
used for browser tests, XPCShell tests and other tests.

All the functions within `EventUtils.js` are automatically available in
browser tests. This file contains functions that are useful for synthesizing
mouse clicks and keypresses. Some commonly used functions are
`synthesizeMouseAtCenter` which places the mouse at the center of the DOM
element and `synthesizeKey` which can be used to navigate the view and start
a search by using keydown and keyenter arguments.

## Testing Over the Message Path

An address bar input reaches its parent controller either directly or over
the message path, as the
[overview](overview.md#direct-path-and-message-path) describes. The address
and search bars in the toolbar take the direct path by default, so an ordinary
test run says nothing about the message path. The New Tab search bar always
takes the message path.

### Running a Test Over the Message Path

The `browser.urlbar.ipc.chromeMessagePassing` pref puts the address bar and the
search bar in the toolbar on the message path. Set it for a test run:

```
./mach mochitest --setpref=browser.urlbar.ipc.chromeMessagePassing=true <test>
```

For `./mach run`, pass the same `--setpref`, or set the pref in `about:config`
and open a new window. Each input picks its path when it is created, so the
address bar and search bar in a window that is already open keep the path they
started with.

### The urlbar-ipc Variant

CI runs browser-chrome mochitests with the pref set in the `urlbar-ipc`
variant, defined in
{searchfox}`variants.yml <taskcluster/test_configs/variants.yml>`. The variant
runs only the manifests tagged `urlbar`: the browser tests in
`browser/components/urlbar/tests/` and `browser/components/search/test/`. Its
jobs run on opt builds on autoland and mozilla-central, and their labels end in
`-uipc`, or `-swr-uipc` on Linux, where the suite runs under software
WebRender.

A test that cannot run over the message path skips the variant in its
manifest:

```toml
["browser_example.js"]
skip-if = ["urlbar_ipc"]
```

To run the variant on try, select its jobs by label:

```
./mach try fuzzy -q "'uipc"
```

To run part of the suite, add its directory. The variant already selects the
`urlbar` tag, so it needs no `--tag`.

### Waiting for the Parent

On the message path, a controller notification or a provider's parent-side
work arrives a round trip after the action that caused it, while the direct
path delivers it synchronously. A test that asserts right after the action
passes on one path and fails on the other. `UrlbarTestUtils` has helpers that
wait correctly on both:

- `promiseControllerNotification(win, notification)` resolves with the
  arguments of the next controller notification of that name, such as
  `onQueryResultRemoved` after a dismissal.
- `promiseProviderEngagement(win)` resolves once the picked result's provider
  has run `onEngagement` in the parent.

Create either promise before the action that triggers it.

`assertPickedResult()` checks the result and element in an engagement's
details against what the view showed. On the message path the view's rows
hold copies of the parent's results, and the parent resolves the engagement's
result to the parent's original result object by `id`. So the result in the
details is not the object the view has access to, and the element is `null`,
because neither a result object nor a DOM node can cross the process boundary.
The helper handles this by comparing results by `id`.

### Forcing a Race

Some orderings go wrong only on a slow machine. To reproduce a race anywhere,
stub the parent method so it waits on a promise the test holds, act, then
resolve the promise. Apply the stub only on the message path, so the test
still holds on the direct path:

```javascript
let { promise, resolve } = Promise.withResolvers();
if (UrlbarPrefs.get("ipc.chromeMessagePassing")) {
  let proto = UrlbarParentController.prototype;
  let initEngineStore = proto.initEngineStore;
  sandbox.stub(proto, "initEngineStore").callsFake(async function (...args) {
    await promise;
    return initEngineStore.apply(this, args);
  });
}
// Open a window and change the default engine, then:
resolve();
```
