/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { HttpServer, HTTP_404 } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { GuardianClient } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/GuardianClient.sys.mjs"
);

function makeGuardianServer(
  arg = {
    enroll: (_request, _response) => {},
    token: (_request, _response) => {},
    status: (_request, _response) => {},
  }
) {
  const callbacks = {
    enroll: (_request, _response) => {},
    token: (_request, _response) => {},
    status: (_request, _response) => {},
    ...arg,
  };
  const server = new HttpServer();

  server.registerPathHandler("/api/v1/fpn/token", callbacks.token);
  server.registerPathHandler("/api/v1/fpn/status", callbacks.status);
  server.registerPathHandler("/api/v1/fpn/auth", callbacks.enroll);
  server.start(-1);
  return server;
}

const testGuardianConfig = server => ({
  withToken: async cb => cb("test-token"),
  guardianEndpoint: `http://localhost:${server.identity.primaryPort}`,
  fxaOrigin: `http://localhost:${server.identity.primaryPort}`,
});

add_task(async function test_fetchUserInfo() {
  const ok = data => {
    return (request, r) => {
      r.setStatusLine(request.httpVersion, 200, "OK");
      r.write(JSON.stringify(data));
    };
  };
  const fail = status => () => {
    throw status;
  };
  const testcases = [
    {
      name: "It should parse a valid response",
      sends: ok({
        subscribed: true,
        uid: 42,
        created_at: "2023-01-01T12:00:00.000Z",
      }),
      expects: {
        status: 200,
        error: null,
        validEntitlement: true,
        entitlement: {
          subscribed: true,
          uid: 42,
          created_at: "2023-01-01T12:00:00.000Z",
        },
      },
    },
    {
      name: "It should handle a 404 response",
      sends: fail(HTTP_404),
      expects: {
        status: 404,
        error: "invalid_response",
        validEntitlement: false,
      },
    },
    {
      name: "It should handle an empty response",
      sends: ok({}),
      expects: {
        status: 200,
        error: "parse_error",
        validEntitlement: false,
      },
    },
    {
      name: "It should handle a 200 response with incorrect types",
      sends: ok({
        subscribed: "true", // Incorrect type: should be boolean
        uid: "42", // Incorrect type: should be number
        created_at: 1234567890, // Incorrect type: should be string
      }),
      expects: {
        status: 200,
        error: "parse_error",
        validEntitlement: false, // Should fail validation due to incorrect types
      },
    },
  ];
  testcases
    .map(({ name, sends, expects }) => {
      return async () => {
        const server = makeGuardianServer({ status: sends });
        const client = new GuardianClient(testGuardianConfig(server));

        const { status, entitlement, error } = await client.fetchUserInfo();

        if (expects.status !== undefined) {
          Assert.equal(status, expects.status, `${name}: status should match`);
        }

        // Check error message if it's expected
        if (expects.error !== null) {
          Assert.equal(
            error,
            expects.error,
            `${name}: error should match expected`
          );
        } else {
          Assert.equal(error, undefined, `${name}: error should be undefined`);
        }

        if (expects.validEntitlement) {
          Assert.notEqual(
            entitlement,
            null,
            `${name}: entitlement should not be null`
          );
          Assert.equal(
            entitlement.subscribed,
            expects.entitlement.subscribed,
            `${name}: entitlement.subscribed should match`
          );
          Assert.equal(
            entitlement.uid,
            expects.entitlement.uid,
            `${name}: entitlement.uid should match`
          );
          // Compare date objects using getTime() for accurate comparison
          Assert.equal(
            new Date(entitlement.created_at).toISOString(),
            new Date(Date.parse(expects.entitlement.created_at)).toISOString(),
            `${name}: entitlement.created_at should match`
          );
        } else {
          Assert.equal(
            entitlement,
            null,
            `${name}: entitlement should be null`
          );
        }

        server.stop();
      };
    })
    .forEach(test => add_task(test));
});

add_task(async function test_fetchProxyPass() {
  const ok = (data, headers = {}) => {
    return (request, r) => {
      r.setStatusLine(request.httpVersion, 200, "OK");
      // Set default Cache-Control header (needed for ProxyPass)
      if (!headers["Cache-Control"]) {
        r.setHeader("Cache-Control", "max-age=3600", false);
      }
      // Set any custom headers
      for (const [name, value] of Object.entries(headers)) {
        r.setHeader(name, value, false);
      }
      r.write(JSON.stringify(data));
    };
  };
  const fail = status => () => {
    throw status;
  };
  const testcases = [
    {
      name: "It should parse a valid response",
      sends: ok({ token: "header.payload.signature" }),
      expects: {
        status: 200,
        error: null,
        validPass: true,
      },
    },
    {
      name: "It should handle a 404 response",
      sends: fail(HTTP_404),
      expects: {
        status: 404,
        error: "invalid_response",
        validPass: false,
      },
    },
    {
      name: "It should handle an empty response",
      sends: ok({}),
      expects: {
        status: 200,
        error: "invalid_response",
        validPass: false,
      },
    },
    {
      name: "It should handle a missing Cache-Control header",
      sends: ok({ token: "header.payload.signature" }, { "Cache-Control": "" }),
      expects: {
        status: 200,
        error: "invalid_response",
        validPass: false,
      },
    },
    {
      name: "It should handle an invalid token format",
      sends: ok({ token: "invalid-token-format" }),
      expects: {
        status: 200,
        error: "invalid_response",
        validPass: false,
      },
    },
  ];
  testcases
    .map(({ name, sends, expects }) => {
      return async () => {
        const server = makeGuardianServer({ token: sends });
        const client = new GuardianClient(testGuardianConfig(server));

        const { status, pass, error } = await client.fetchProxyPass();

        if (expects.status !== undefined) {
          Assert.equal(status, expects.status, `${name}: status should match`);
        }

        // Check error message if it's expected
        if (expects.error !== null) {
          Assert.equal(
            error,
            expects.error,
            `${name}: error should match expected`
          );
        } else {
          Assert.equal(error, undefined, `${name}: error should be undefined`);
        }

        if (expects.validPass) {
          Assert.notEqual(pass, null, `${name}: pass should not be null`);
          Assert.strictEqual(
            typeof pass.token,
            "string",
            `${name}: pass.token should be a string`
          );
          Assert.strictEqual(
            typeof pass.until,
            "number",
            `${name}: pass.until should be a number`
          );
          Assert.greater(
            pass.until,
            Date.now(),
            `${name}: pass.until should be in the future`
          );
          Assert.ok(pass.isValid(), `${name}: pass should be valid`);
        } else {
          Assert.equal(pass, null, `${name}: pass should be null`);
        }

        server.stop();
      };
    })
    .forEach(test => add_task(test));
});

add_task(async function test_parseGuardianSuccessURL() {
  const testcases = [
    {
      name: "Valid success URL with code",
      input: "https://example.com/oauth/success?code=abc123",
      expects: { ok: true, error: undefined },
    },
    {
      name: "Error in URL",
      input: "https://example.com/oauth/success?error=generic_error",
      expects: { ok: false, error: "generic_error" },
    },
    {
      name: "Missing code in success URL",
      input: "https://example.com/oauth/success",
      expects: { ok: false, error: "missing_code" },
    },
    {
      name: "Null input",
      input: null,
      expects: { ok: false, error: "timeout" },
    },
  ];

  testcases.forEach(({ name, input, expects }) => {
    info(`Running test case: ${name}`);

    const result = GuardianClient._parseGuardianSuccessURL(input);

    Assert.equal(result.ok, expects.ok, `${name}: ok should match`);
    Assert.equal(result.error, expects.error, `${name}: error should match`);
  });
});
