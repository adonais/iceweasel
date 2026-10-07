// META: global=window,worker

// https://fetch.spec.whatwg.org/#concept-bodyinit-extract does not read a
// ReadableStream, so a Request constructor that throws must leave the stream
// untouched.

function newStream() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hello"));
      controller.close();
    },
  });
}

async function readAll(stream) {
  const reader = stream.getReader();
  let out = "";
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return out;
    }
    out += decoder.decode(value, { stream: true });
  }
}

test(() => {
  const stream = newStream();
  assert_throws_js(
    TypeError,
    () => new Request("/", { method: "POST", body: stream }),
    "omitting duplex must throw"
  );
  assert_false(stream.locked, "stream must not be left locked");
}, "A Request constructor that throws for a missing duplex leaves the stream unlocked");

promise_test(async () => {
  const stream = newStream();
  assert_throws_js(TypeError, () =>
    new Request("/", { method: "POST", body: stream })
  );
  // Not disturbed either, so the stream is still fully readable.
  assert_equals(await readAll(stream), "hello", "stream must still be readable");
}, "A Request constructor that throws for a missing duplex leaves the stream readable");

test(() => {
  const stream = newStream();
  assert_throws_js(
    TypeError,
    () => new Request("/", { method: "POST", body: stream, keepalive: true, duplex: "half" }),
    "keepalive with a stream body must throw"
  );
  assert_false(stream.locked, "stream must not be left locked");
}, "A Request constructor that throws for keepalive leaves the stream unlocked");

test(() => {
  const stream = newStream();
  assert_throws_js(TypeError, () => new Request("/", {
    method: "POST", body: stream, duplex: "half", mode: "no-cors"
  }));
  assert_false(stream.locked, "stream must not be left locked");
}, "A Request constructor that throws for no-cors leaves the stream unlocked");

for (const body of [undefined, null]) {
  test(() => {
    const request = new Request("/", {
      method: "POST", body: newStream(), duplex: "half"
    });
    assert_throws_js(TypeError, () =>
      new Request(request, { mode: "no-cors", body })
    );
    assert_false(request.bodyUsed, "input request must not be disturbed");
  }, `An inherited streaming body rejects no-cors with init.body ${body}`);
}

test(() => {
  const request = new Request("/", {
    method: "POST", body: newStream(), duplex: "half"
  });
  const replacement = new Request(request, {
    mode: "no-cors", body: "replacement"
  });
  assert_equals(replacement.mode, "no-cors");
  const copied = new Request(replacement, { mode: "no-cors" });
  assert_equals(copied.mode, "no-cors");
}, "Replacing a streaming body with a string permits no-cors");
