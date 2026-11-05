// META: global=window,worker
// META: script=/common/get-host-info.sub.js
// META: script=/webtransport/resources/webtransport-test-helpers.sub.js

// The maximum outputLength for exportKeyingMaterial is implementation-defined;
// the spec only requires it to be at least 4096. Firefox's maximum is exactly
// 4096, so rejecting larger values is not web-compatible and is tested here
// under /_mozilla/ rather than in the shared WebTransport WPTs.
promise_test(async t => {
  const wt = new WebTransport(webtransport_url('echo.py'));
  await wt.ready;

  t.add_cleanup(() => wt.close());
  wt.closed.catch(() => {});

  const label = new TextEncoder().encode('EXPORTER-test');
  await promise_rejects_js(t, RangeError,
    wt.exportKeyingMaterial(label, new Uint8Array(0), 4097),
    'exportKeyingMaterial should throw RangeError for outputLength above the maximum');
}, 'exportKeyingMaterial throws RangeError when outputLength exceeds Firefox\'s maximum');
