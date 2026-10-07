// META: global=window,worker

for (const method of ["POST", "PUT", "PATCH", "DELETE", "CUSTOM"]) {
  for (const empty of [false, true]) {
    promise_test(async t => {
      const body = empty ? "" : "streamed request body";
      const response = await fetch("/fetch/api/resources/echo-content.h2.py", {
        method,
        body: new ReadableStream({
          async start(controller) {
            await new Promise(resolve => t.step_timeout(resolve, 0));
            if (!empty) {
              controller.enqueue(new TextEncoder().encode(body));
            }
            controller.close();
          },
        }),
        duplex: "half",
      });
      assert_equals(response.status, 200);
      assert_equals(await response.text(), body);
    }, `HTTP/2 ${method} with an ${empty ? "empty" : "asynchronously produced"} streaming body`);
  }
}
