/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ProfileKekPassword: "resource://gre/modules/ProfileKekPassword.sys.mjs",
});

document.addEventListener("dialogaccept", resetPassword);

async function resetPassword(event) {
  event.preventDefault();

  // The primary password is about to be reset, so the profile KEK needs to be
  // as well, to prevent future prompts asking for a no longer existing
  // password. Allowed to reject, like token.reset() after it, because a reset
  // that cannot be done safely must not go ahead.
  await lazy.ProfileKekPassword.discard();

  let token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(
    Ci.nsIPKCS11Token
  );
  await token.reset();

  try {
    await Services.logins.removeAllUserFacingLoginsAsync();
  } catch (e) {}

  let l10n = new Localization(["security/pippki/pippki.ftl"], true);
  if (l10n) {
    Services.prompt.alert(
      window,
      l10n.formatValueSync("pippki-reset-password-confirmation-title"),
      l10n.formatValueSync("pippki-reset-password-confirmation-message")
    );
  }

  window.close();
}
