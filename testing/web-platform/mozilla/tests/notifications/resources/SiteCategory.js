function reregisterChromeScript() {
  const MOCK_SITE_CATEGORY_CID = Components.ID(
    "{767fadc4-2242-470e-9474-f6103bebcfed}"
  );
  const SYSTEM_CID = Components.ID("{f29e6ab3-34b5-4746-a2be-20112ca2e386}");
  const SITE_CATEGORY_CONTRACT_ID = "@mozilla.org/site-category;1";

  // All we do here is to create a new site category factory that initializes again,
  // so that we don't need to implement a test-only reset function in nsISiteCategory itself.
  const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
  const oldFactory = Components.manager.getClassObject(Cc[SITE_CATEGORY_CONTRACT_ID], Ci.nsIFactory);
  registrar.registerFactory(MOCK_SITE_CATEGORY_CID, "site category", SITE_CATEGORY_CONTRACT_ID, oldFactory);

  addMessageListener("site-category:unregister", () => {
    registrar.unregisterFactory(MOCK_SITE_CATEGORY_CID, oldFactory);
    // Revive the system one
    registrar.registerFactory(SYSTEM_CID, "", SITE_CATEGORY_CONTRACT_ID, null);
    sendAsyncMessage("site-category:unregistered");
  });

  this.sendAsyncMessage("site-category:registered");
}

const SiteCategory = {
  async register(t) {
    if (this._chromeScript) {
      throw new Error("SiteCategory already registered");
    }
    this._chromeScript = SpecialPowers.loadChromeScript(
      reregisterChromeScript
    );
    // Make sure every registration will unregister automatically at test end
    t.add_cleanup(async () => {
      await SiteCategory.unregister();
    });
    await this._chromeScript.promiseOneMessage("site-category:registered");
  },
  async unregister() {
    if (!this._chromeScript) {
      throw new Error("SiteCategory not registered");
    }
    this._chromeScript.sendAsyncMessage("site-category:unregister");
    return this._chromeScript
      .promiseOneMessage("site-category:unregistered")
      .then(() => {
        this._chromeScript.destroy();
        this._chromeScript = null;
      });
  },
}
