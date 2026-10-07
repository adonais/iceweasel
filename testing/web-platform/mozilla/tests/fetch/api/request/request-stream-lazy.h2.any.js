// META: global=window,worker

promise_test(async () => {
  const request = new Request("/fetch/api/resources/echo-content.h2.py", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello"));
        controller.close();
      },
    }),
    duplex: "half",
  });
  const clone = request.clone();
  const responses = await Promise.all([fetch(request), fetch(clone)]);
  assert_array_equals(await Promise.all(responses.map(r => r.text())),
                      ["hello", "hello"]);
}, "A cloned streaming Request sends its body over HTTP/2");

promise_test(async t => {
  const request = new Request("/fetch/api/resources/echo-content.h2.py", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello"));
        controller.close();
      },
    }),
    duplex: "half",
  });
  await new Promise(resolve => t.step_timeout(resolve, 0));
  assert_false(request.bodyUsed);
  const response = await fetch(request);
  assert_equals(await response.text(), "hello");
}, "A streaming Request can be fetched after a task boundary");

for (const abortBeforeFetch of [false, true]) {
  promise_test(async t => {
    const controller = new AbortController();
    const reason = { message: "cancel upload" };
    let cancel;
    const canceled = new Promise(resolve => { cancel = resolve; });
    const request = new Request("/fetch/api/resources/echo-content.h2.py", {
      method: "POST",
      body: new ReadableStream({ cancel }),
      duplex: "half",
    });
    if (abortBeforeFetch) {
      controller.abort(reason);
    }
    const fetched = fetch(request, { signal: controller.signal });
    if (!abortBeforeFetch) {
      controller.abort(reason);
    }
    await promise_rejects_exactly(t, reason, fetched);
    assert_equals(await canceled, reason);
  }, `Fetching an existing Request cancels its source with the ${abortBeforeFetch ? "already aborted" : "overridden"} signal's reason`);
}
