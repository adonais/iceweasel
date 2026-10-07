// META: global=window,worker
// META: script=/common/get-host-info.sub.js
// META: script=/common/utils.js

promise_test(async t => {
  const url = new URL("/fetch/api/resources/preflight.py", location.href);
  url.hostname = get_host_info().REMOTE_HOST;
  url.searchParams.set("token", token());
  url.searchParams.set("allow_methods", "POST");
  t.add_cleanup(() => fetch(`${url}&clear-stash=1`));

  const request = new Request(url, {
    method: "POST",
    body: new ReadableStream({ start: controller => controller.close() }),
    duplex: "half",
  });
  const response = await fetch(request, { body: "replacement" });
  assert_equals(response.status, 200);
  assert_equals(response.headers.get("x-did-preflight"), "0");
}, "Replacing a streaming body with a string does not force a CORS preflight");

for (const crossOrigin of [false, true]) {
  promise_test(async t => {
    const url = new URL("/fetch/api/resources/preflight.py", location.href);
    if (crossOrigin) {
      url.hostname = get_host_info().REMOTE_HOST;
    }
    url.searchParams.set("token", token());
    url.searchParams.set("allow_methods", "POST");
    t.add_cleanup(() => fetch(`${url}&clear-stash=1`));

    const response = await fetch(url, {
      method: "POST",
      body: new ReadableStream({ start: controller => controller.close() }),
      duplex: "half",
    });
    assert_equals(response.status, 200);
    assert_equals(response.headers.get("x-did-preflight"), crossOrigin ? "1" : "0");
  }, `Streaming POST ${crossOrigin ? "requires a cross-origin preflight" : "does not preflight same-origin requests"}`);
}
