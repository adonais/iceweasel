// META: global=window,worker

// dom.fetch.streaming_upload is forced off for this file; see the .ini next to
// it. ReadableStream is a member of the BodyInit union unconditionally, because
// WebIDL typedefs cannot be pref-gated, so with the feature off a stream body
// converts to a USVString the way the union did before streaming upload was
// implemented.

function newStream() {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("hello"));
      c.close();
    },
  });
}

test(() => {
  assert_false(
    "duplex" in Request.prototype,
    "the pref is off, so Request.duplex must not be exposed"
  );
}, "The streaming upload pref is off for this file");

promise_test(async () => {
  const request = new Request("/", { method: "POST", body: newStream() });
  assert_equals(
    request.headers.get("content-type"),
    "text/plain;charset=UTF-8",
    "a stringified body is sent as text/plain"
  );
  assert_equals(
    await request.text(),
    "[object ReadableStream]",
    "the stream is stringified rather than read"
  );
}, "With streaming upload disabled a ReadableStream body is stringified");

promise_test(async () => {
  const stream = newStream();
  new Request("/", { method: "POST", body: stream });
  assert_false(stream.locked, "the stream must not be locked");
  // Never consumed, so it is still fully readable.
  const { value } = await stream.getReader().read();
  assert_equals(new TextDecoder().decode(value), "hello");
}, "With streaming upload disabled a ReadableStream body is left untouched");
