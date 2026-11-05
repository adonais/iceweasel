/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

#include "storage_test_harness.h"

#include "mozStorageConnection.h"
#include "mozilla/Preferences.h"
#include "mozilla/StaticPrefs_security.h"

using namespace mozilla;
using namespace mozilla::storage;

// A successful encrypted open must not leave the connection marked as closed.
TEST(storage_encrypted_open, ConnectionIsNotClosed)
{
  constexpr auto kPref = "security.storage.encryption.sqlite.enabled";
  bool oldPref = Preferences::GetBool(kPref, false, PrefValueKind::Default);
  Preferences::Unlock(kPref);
  Preferences::SetBool(kPref, true, PrefValueKind::Default);
  ASSERT_TRUE(StaticPrefs::security_storage_encryption_sqlite_enabled());

  nsCOMPtr<nsIFile> dbFile;
  do_check_success(NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR,
                                          getter_AddRefs(dbFile)));
  do_check_success(dbFile->Append(u"storage_test_encrypted_open.sqlite"_ns));

  nsCOMPtr<mozIStorageConnection> db(getDatabase(dbFile));
  do_check_false(static_cast<Connection*>(db.get())->isClosed());

  do_check_success(db->Close());
  (void)dbFile->Remove(false);
  Preferences::SetBool(kPref, oldPref, PrefValueKind::Default);
  Preferences::Lock(kPref);
}
