/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PH = Ci.nsIProtocolHandler;
const ssm = Services.scriptSecurityManager;

add_task(function test_flags() {
  const flags = Services.io.getProtocolFlags("jar");
  Assert.ok(flags & PH.URI_IS_LOCAL_FILE, "jar: claims URI_IS_LOCAL_FILE");
  Assert.ok(
    !(flags & PH.URI_LOADABLE_BY_ANYONE),
    "jar: is not loadable by anyone"
  );
});

add_task(function test_web_content_cannot_load_remote_jar() {
  const principal = ssm.createContentPrincipalFromOrigin("https://example.com");
  const uri = Services.io.newURI(
    "jar:https://example.org/archive.jar!/index.html"
  );
  Assert.throws(
    () => ssm.checkLoadURIWithPrincipal(principal, uri, 0),
    /denied/,
    "web content cannot load a jar: URI wrapping a remote resource"
  );
});

add_task(function test_web_content_cannot_load_local_jar() {
  const principal = ssm.createContentPrincipalFromOrigin("https://example.com");
  const uri = Services.io.newURI("jar:file:///archive.jar!/index.html");
  Assert.throws(
    () => ssm.checkLoadURIWithPrincipal(principal, uri, 0),
    /denied/,
    "web content cannot load a jar: URI wrapping a local file"
  );
});

add_task(function test_privileged_callers_can_load_jar() {
  for (const spec of [
    "jar:file:///archive.jar!/index.html",
    "jar:https://example.org/archive.jar!/index.html",
  ]) {
    const uri = Services.io.newURI(spec);
    ssm.checkLoadURIWithPrincipal(ssm.getSystemPrincipal(), uri, 0);
    Assert.ok(true, `system principal may load ${spec}`);
  }
});
