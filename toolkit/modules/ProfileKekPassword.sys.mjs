/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// lockstore derives a kek_ref from (type, identifier), so the same pair always
// names the same record; keep these in step with
// security/lockstore/ProfileKek.h, which names the same two records from C++.
const KEK_ID = "profile";
const PW_KEK = `lockstore::kek::password:${KEK_ID}`;
const LOCAL_KEK = `lockstore::kek::local:${KEK_ID}`;
// Unlocked for the rest of the session; lockstore takes a u64.
const KEK_CACHE_MS = Number.MAX_SAFE_INTEGER;

function getLockstore() {
  return Cc["@mozilla.org/security/lockstore;1"].getService(Ci.nsILockstore);
}

/**
 * Keeps the profile KEK in step with the internal key token's primary
 * password. Every UI that changes, removes or resets that password runs one of
 * these first, or the two end up keyed to different secrets.
 */
export const ProfileKekPassword = {
  async exists() {
    if (!Services.prefs.getBoolPref("security.lockstore.unlock.enabled")) {
      return false;
    }
    return getLockstore().kekExists(PW_KEK);
  },

  async update(oldPassword, newPassword) {
    if (!Services.prefs.getBoolPref("security.lockstore.unlock.enabled")) {
      return;
    }

    const lockstore = getLockstore();

    if (await lockstore.kekExists(PW_KEK)) {
      await lockstore.unlockKek(PW_KEK, oldPassword, KEK_CACHE_MS);

      if (newPassword == "") {
        await lockstore.createKek("local", KEK_ID, "", 0);
        await this.moveDeks(lockstore, PW_KEK, LOCAL_KEK);
      } else {
        await this.changePassword(lockstore, oldPassword, newPassword);
      }
      return;
    }

    if (newPassword == "") {
      return;
    }

    await lockstore.createKek("password", KEK_ID, newPassword, KEK_CACHE_MS);
    if (await lockstore.kekExists(LOCAL_KEK)) {
      await this.moveDeks(lockstore, LOCAL_KEK, PW_KEK);
    }
  },

  // For a primary password about to be destroyed rather than changed, so
  // there is no new secret to re-key the KEK to. Deliberately not gated on
  // security.lockstore.unlock.enabled, unlike the methods above: a password
  // KEK can outlive the pref going off -- it was created while the pref was
  // on, or a rollback to the local KEK never finished -- and it is those
  // leftovers that would otherwise keep asking for a password the reset is
  // about to destroy.
  async discard() {
    const lockstore = getLockstore();
    if (!(await lockstore.kekExists(PW_KEK))) {
      return;
    }

    // Still cached from this session, so the DEKs survive the reset.
    if (lockstore.isKekUnlocked(PW_KEK)) {
      await lockstore.createKek("local", KEK_ID, "", 0);
      await this.moveDeks(lockstore, PW_KEK, LOCAL_KEK);
      return;
    }

    // Never unlocked this session, and the password that would unlock it
    // does not outlive key4.db, so these DEKs are already unreadable for
    // good. Delete them, both because nothing can use them again and
    // because deleteKek refuses while a DEK is still wrapped under the KEK.
    for (const dekName of await lockstore.listDeks()) {
      if ((await lockstore.listKeks(dekName)).includes(PW_KEK)) {
        await lockstore.deleteDek(dekName);
      }
    }
    await this.deleteKekQuietly(lockstore, PW_KEK);
  },

  // changeKekPassword drops the cached unlock, so restore it. Failing to do
  // so leaves the KEK locked, and the DEKs under it unreadable, until the
  // next startup prompts for the new password; the password change itself has
  // already succeeded, so it is not reported as a failure.
  async changePassword(lockstore, oldPassword, newPassword) {
    const wasUnlocked = lockstore.isKekUnlocked(PW_KEK);
    await lockstore.changeKekPassword(PW_KEK, oldPassword, newPassword);
    if (!wasUnlocked) {
      return;
    }
    try {
      await lockstore.unlockKek(PW_KEK, newPassword, KEK_CACHE_MS);
    } catch (e) {
      console.error("Failed to restore lockstore KEK unlock state", e);
    }
  },

  // A failed migration leaves the DEKs under fromKek, so toKek is the only
  // leftover. A successful one empties fromKek, whose record every kekExists
  // check would still read as "the profile uses this KEK", so drop it -- but
  // quietly, as the migration it follows has already succeeded.
  async moveDeks(lockstore, fromKek, toKek) {
    try {
      await lockstore.migrateDeks(fromKek, toKek);
    } catch (e) {
      console.error("Failed to migrate lockstore DEKs to", toKek, e);
      await this.deleteKekQuietly(lockstore, toKek);
      throw e;
    }
    await this.deleteKekQuietly(lockstore, fromKek);
  },

  // Cleanup only: a leftover KEK is harmless and must not mask the failure.
  async deleteKekQuietly(lockstore, kekRef) {
    try {
      await lockstore.deleteKek(kekRef);
    } catch (e) {
      console.error("Failed to delete lockstore KEK", kekRef, e);
    }
  },
};
