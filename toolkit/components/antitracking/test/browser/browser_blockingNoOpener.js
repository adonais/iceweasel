gFeatures = "noopener";

AntiTracking.runTestInNormalAndPrivateMode(
  "Blocking in the case of noopener windows",
  async _ => {
    try {
      localStorage.foo = 42;
      ok(false, "LocalStorage cannot be used!");
    } catch (e) {
      ok(true, "LocalStorage cannot be used!");
      is(e.name, "SecurityError", "We want a security error message.");
    }
  },
  async phase => {
    switch (phase) {
      case 1:
        localStorage.foo = 42;
        ok(true, "LocalStorage is allowed");
        break;
      case 2:
        try {
          localStorage.foo = 42;
          ok(false, "LocalStorage cannot be used!");
        } catch (e) {
          ok(true, "LocalStorage cannot be used!");
          is(e.name, "SecurityError", "We want a security error message.");
        }
        break;
    }
  },
  // Cleanup callback
  clearSiteTestData,
  null,
  true,
  false
);
