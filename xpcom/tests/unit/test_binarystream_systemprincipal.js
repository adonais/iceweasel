/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The system principal is the only component that is both a singleton and
// serializable, and we support reading it from legacy principals, so make sure
// that it works with nsBinaryInputStream::ReadObject.
// We can't use SystemPrincipal::Write() directly because it does a release
// assert, so this test synthesizes what WriteCompoundObject used to emit: the
// CID, the IID, and nothing else.

add_task(function test_read_legacy_system_principal() {
  // Set up the streams.
  let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
  pipe.init(false, false, 0, 0, null);

  let output = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(
    Ci.nsIObjectOutputStream
  );
  output.setOutputStream(pipe.outputStream);

  let input = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
    Ci.nsIObjectInputStream
  );
  input.setInputStream(pipe.inputStream);

  // Write out the data.
  let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
  output.writeID(registrar.contractIDToCID("@mozilla.org/systemprincipal;1"));
  output.writeID(Ci.nsIPrincipal);

  // Deserialize and validate.
  let principal = input.readObject(true);
  let systemPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
  Assert.ok(principal, "Deserialized a legacy system principal");
  Assert.ok(principal.isSystemPrincipal, "It is the system principal");
  Assert.ok(
    principal.equals(systemPrincipal),
    "equals the real system principal"
  );
  Assert.equal(
    principal,
    systemPrincipal,
    "equal to the real system principal"
  );
});
