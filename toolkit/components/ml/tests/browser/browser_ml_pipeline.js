/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const { BackendError } = ChromeUtils.importESModule(
  "chrome://global/content/ml/backends/Pipeline.mjs"
);

add_task(async function test_backend_error() {
  const error = new BackendError("onnx", 12346);
  Assert.equal(error.name, "OnnxBackendError");
  Assert.equal(error.message, "Backend error: 12346");
  Assert.deepEqual(
    error.toMsg(),
    {
      exn: "BackendError",
      name: "OnnxBackendError",
      message: "Backend error: 12346",
      backendName: "onnx",
      stack: error.stack,
    },
    "A backend error without a service response serializes without status"
  );
});

add_task(async function test_backend_error_keeps_service_response() {
  // Built in the module's realm so it passes the module's instanceof check,
  // as an error thrown by the API client inside the worker would.
  const { Error: ModuleError } = Cu.getGlobalForObject(BackendError);
  const apiError = Object.assign(new ModuleError("429 1"), {
    status: 429,
    error: 1,
  });
  const error = new BackendError("openai", apiError);
  Assert.equal(error.name, "OpenaiBackendError");
  Assert.equal(error.message, "429 1");
  Assert.equal(error.status, 429, "The HTTP status is copied onto the error");
  Assert.equal(error.error, 1, "The body error code is copied onto the error");
  const msg = error.toMsg();
  Assert.equal(msg.status, 429, "toMsg carries the status");
  Assert.equal(msg.error, 1, "toMsg carries the error code");
});
