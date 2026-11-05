/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_security_lockstore_ProfileKek_h
#define mozilla_security_lockstore_ProfileKek_h

#include "mozilla/FunctionRef.h"
#include "mozilla/Maybe.h"
#include "nsLiteralString.h"

namespace mozilla::security::lockstore {

// Constants for the profile KEK. lockstore derives a kek_ref from
// (type, identifier), so the same pair always names the same record; keep
// these in step with ProfileKekPassword.sys.mjs, which names the same two
// records from JS.
constexpr auto kProfileKekId = "profile"_ns;
constexpr auto kProfilePasswordKek = "lockstore::kek::password:profile"_ns;
constexpr auto kProfileLocalKek = "lockstore::kek::local:profile"_ns;

enum class PrimaryPasswordSync {
  // Reopen a password KEK this session has not unlocked yet.
  Unlock,
  // Bring a primary password lockstore knows nothing about under its wing.
  Adopt,
};

/**
 * Decide what startup has to do to keep the profile KEK in step with the
 * primary password, given the observed state. Nothing means the two already
 * agree. Only consulted while security.lockstore.unlock.enabled is set.
 *
 * aKekExists         whether a password profile KEK is on disk
 * aKekUnlocked       whether the KEK is unlocked, which at this point in
 *                    startup means someone else opened it and owns it
 * aTokenHasPassword  queried only when the outcome turns on it, since
 *                    instantiating the internal key token is not free
 */
Maybe<PrimaryPasswordSync> ChoosePrimaryPasswordSync(
    bool aKekExists, bool aKekUnlocked, FunctionRef<bool()> aTokenHasPassword);

/**
 * Whether giving up on aSync leaves the session usable. Adoption is the one
 * sync with nothing at stake: no password KEK exists yet, so every DEK is
 * still under the LocalKey. Giving up on an unlock leaves DEKs under a KEK this
 * session cannot unlock, which breaks every consumer of an encrypted database.
 */
bool SyncIsSkippable(PrimaryPasswordSync aSync);

/**
 * While security.lockstore.unlock.enabled is set, bring the profile KEK in step
 * with the primary password, prompting for it when needed. Whatever the pref,
 * move the profile DEKs back to a LocalKey if it is turned off later in the
 * session. Called from nsXREDirProvider::DoStartup just before
 * profile-do-change, ahead of the first encrypted database open.
 * Returns false when startup cannot continue. Main-thread only.
 */
bool SyncProfileKekAtStartup();

}  // namespace mozilla::security::lockstore

#endif  // mozilla_security_lockstore_ProfileKek_h
