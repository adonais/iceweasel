/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ProfileKekPassword: "resource://gre/modules/ProfileKekPassword.sys.mjs",
});

var gRemovePasswordDialog = {
  _token: null,
  _okButton: null,
  _password: null,
  init() {
    this._okButton = document.getElementById("removemp").getButton("accept");
    document.l10n.setAttributes(this._okButton, "pw-remove-button");
    this._password = document.getElementById("password");
    this._token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(
      Ci.nsIPKCS11Token
    );
    document.addEventListener("dialogaccept", event =>
      this.removePassword(event)
    );
  },

  async createAlert(titleL10nId, messageL10nId) {
    const [title, message] = await document.l10n.formatValues([
      { id: titleL10nId },
      { id: messageL10nId },
    ]);
    Services.prompt.alert(window, title, message);
  },

  async removePassword(event) {
    event.preventDefault();
    let kekMoved = false;
    try {
      // Migrate the lockstore KEK first: if it fails the primary password is
      // left untouched, so the two never diverge. changePassword is the
      // irreversible step and runs only once the KEK is in the right state.
      if (await lazy.ProfileKekPassword.exists()) {
        await lazy.ProfileKekPassword.update(this._password.value, "");
        kekMoved = true;
      }
      await this._token.changePassword(this._password.value, "");
      this.createAlert("pw-change-success-title", "settings-pp-erased-ok");
      window.close();
    } catch (e) {
      // kekMoved is only set once the update resolved, so reaching here with
      // it set means changePassword is what failed. The primary password is
      // still there, so put the DEKs back under it: leaving them on the
      // LocalKey would drop their protection while the UI still shows a
      // primary password as set.
      if (kekMoved) {
        await lazy.ProfileKekPassword.update("", this._password.value).catch(
          rollbackError =>
            console.error(
              "Failed to roll back the lockstore KEK",
              rollbackError
            )
        );
      }
      let nssErrorsService = Cc["@mozilla.org/nss_errors_service;1"].getService(
        Ci.nsINSSErrorsService
      );
      // SEC_ERROR_BASE + 15 = SEC_ERROR_BAD_PASSWORD
      let badPasswordResult = nssErrorsService.getXPCOMFromNSSError(
        Ci.nsINSSErrorsService.NSS_SEC_ERROR_BASE + 15
      );
      // The lockstore unlock runs first and reports a wrong password as
      // NS_ERROR_ABORT rather than the token's bad-password code. Only
      // reachable with kekMoved unset: past that point the KEK is done with
      // and the token, which reports failures as NSS codes, is what failed.
      if (
        e.result == badPasswordResult ||
        (!kekMoved && e.result == Cr.NS_ERROR_ABORT)
      ) {
        this._password.focus();
        this._password.setAttribute("value", "");
        this.createAlert("pw-change-failed-title", "incorrect-pp");
      } else {
        this.createAlert("pw-change-failed-title", "failed-pp-change");
      }
    }
  },
};

window.addEventListener("load", () => gRemovePasswordDialog.init());
