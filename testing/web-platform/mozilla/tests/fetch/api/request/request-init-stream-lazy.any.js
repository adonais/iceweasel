// META: global=window,worker

function streamWithText(text) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

promise_test(async () => {
  const stream = streamWithText("hello");
  const request = new Request("/", {
    method: "POST", body: stream, duplex: "half",
  });
  assert_equals(request.body, stream);
  assert_false(stream.locked);
  assert_false(request.bodyUsed);
  const reader = request.body.getReader();
  assert_equals(new TextDecoder().decode((await reader.read()).value), "hello");
  assert_true((await reader.read()).done);
  assert_true(request.bodyUsed);
}, "Constructing a Request leaves its supplied stream available to a reader");

promise_test(async t => {
  let pulls = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulls++;
      controller.enqueue(new TextEncoder().encode("hello"));
      controller.close();
    },
  }, { highWaterMark: 0 });
  const request = new Request("/", {
    method: "POST", body: stream, duplex: "half",
  });
  await new Promise(resolve => t.step_timeout(resolve, 0));
  assert_equals(pulls, 0);
  assert_false(stream.locked);
  assert_false(request.bodyUsed);
  assert_equals(await request.text(), "hello");
  assert_equals(pulls, 1);
}, "An unused Request does not pull from its supplied stream");

promise_test(async () => {
  const request = new Request("/", {
    method: "POST", body: streamWithText("hello"), duplex: "half",
  });
  const clone = request.clone();
  assert_false(request.bodyUsed);
  assert_false(clone.bodyUsed);
  assert_array_equals(await Promise.all([request.text(), clone.text()]),
                      ["hello", "hello"]);
}, "Cloning an unconsumed streaming Request leaves both bodies readable");

promise_test(async () => {
  const request = new Request("/", {
    method: "POST", body: streamWithText("hello"), duplex: "half",
  });
  const clone = request.clone();
  assert_throws_js(TypeError, () => new Request(clone, { mode: "no-cors" }));
  assert_false(clone.bodyUsed);
  assert_array_equals(await Promise.all([request.text(), clone.text()]),
                      ["hello", "hello"]);
}, "A cloned streaming Request retains the no-cors restriction");

promise_test(async t => {
  let pulls = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulls++;
      controller.enqueue(new TextEncoder().encode("hello"));
    },
  }, { highWaterMark: 0 });
  const input = new Request("/", {
    method: "POST", body: stream, duplex: "half",
  });
  const request = new Request(input);
  assert_true(input.bodyUsed);
  assert_false(request.bodyUsed);
  assert_false(request.body.locked);
  await new Promise(resolve => t.step_timeout(resolve, 0));
  assert_less_than_equal(pulls, 1, "an unread proxy must preserve backpressure");
  const reader = request.body.getReader();
  assert_equals(new TextDecoder().decode((await reader.read()).value), "hello");
  await reader.cancel();
}, "Constructing from a streaming Request uses a proxy with backpressure");

promise_test(async () => {
  const controller = new AbortController();
  const request = new Request("/", {
    method: "POST", body: streamWithText("hello"), duplex: "half",
    signal: controller.signal,
  });
  controller.abort("unused");
  assert_equals(await request.text(), "hello");
}, "Aborting an unused Request's signal does not consume or cancel its body");
