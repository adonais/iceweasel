// META: global=window,worker
// META: script=/common/get-host-info.sub.js
// META: script=/common/utils.js

for (const http1 of [false, true]) {
  promise_test(async t => {
    const destination = new URL("/fetch/api/resources/top.txt", location.href);
    if (http1) {
      destination.port = new URL(get_host_info().HTTPS_ORIGIN).port;
      destination.pathname = "/fetch/api/resources/preflight.py";
      destination.searchParams.set("token", token());
      destination.searchParams.set("allow_methods", "GET");
      t.add_cleanup(() => fetch(`${destination}&clear-stash=1`));
    }
    let target = destination;
    if (!http1) {
      target = new URL("/fetch/api/resources/redirect.h2.py", location.href);
      target.searchParams.set("redirect_status", "302");
      target.searchParams.set("location", destination.href);
    }
    const redirect = new URL("/fetch/api/resources/redirect.h2.py", location.href);
    redirect.searchParams.set("redirect_status", "303");
    redirect.searchParams.set("location", target.href);

    const response = await fetch(redirect, {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("upload"));
          controller.close();
        },
      }),
      duplex: "half",
    });
    assert_equals(response.status, 200);
    assert_equals(response.url, destination.href);
    assert_true(response.redirected);
  }, `A streaming upload can follow a 303 to ${http1 ? "an HTTP/1.1 destination" : "a subsequent 302 redirect"}`);
}
