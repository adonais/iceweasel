/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/gtest/MozAssertions.h"
#include "mozilla/security/lockstore/lockstore_ffi_generated.h"
#include "nsCOMPtr.h"
#include "nsDirectoryServiceDefs.h"
#include "nsIFile.h"
#include "nsString.h"
#include "nsTArray.h"

using mozilla::security::lockstore::keystore_add_kek;
using mozilla::security::lockstore::keystore_close;
using mozilla::security::lockstore::keystore_create_dek;
using mozilla::security::lockstore::keystore_create_kek;
using mozilla::security::lockstore::keystore_decrypt;
using mozilla::security::lockstore::keystore_delete_dek;
using mozilla::security::lockstore::keystore_encrypt;
using mozilla::security::lockstore::keystore_get_dek;
using mozilla::security::lockstore::keystore_import_dek;
using mozilla::security::lockstore::keystore_is_dek_extractable;
using mozilla::security::lockstore::keystore_is_kek_unlocked;
using mozilla::security::lockstore::keystore_list_deks;
using mozilla::security::lockstore::keystore_lock;
using mozilla::security::lockstore::keystore_lock_kek;
using mozilla::security::lockstore::keystore_open;
using mozilla::security::lockstore::keystore_remove_kek;
using mozilla::security::lockstore::keystore_switch_kek;
using mozilla::security::lockstore::keystore_unlock_kek;
using mozilla::security::lockstore::KeystoreHandle;

class LockstoreKeystoreTest : public ::testing::Test {
 protected:
  nsCOMPtr<nsIFile> mTmpDir;
  nsAutoCString mProfilePath;
  KeystoreHandle* mKeystore = nullptr;
  // Per-test LocalKey kek_ref. LocalKey is no longer a canonical
  // singleton: every test mints its own via createKek("local", ...)
  // and uses the returned random-ID kek_ref throughout.
  nsCString mLocalKekRef;

  void SetUp() override {
    nsresult rv =
        NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(mTmpDir));
    ASSERT_NS_SUCCEEDED(rv);
    rv = mTmpDir->AppendNative("lockstore_ks_test"_ns);
    ASSERT_NS_SUCCEEDED(rv);
    rv = mTmpDir->CreateUnique(nsIFile::DIRECTORY_TYPE, 0700);
    ASSERT_NS_SUCCEEDED(rv);
    nsAutoString profilePathWide;
    rv = mTmpDir->GetPath(profilePathWide);
    ASSERT_NS_SUCCEEDED(rv);
    mProfilePath = NS_ConvertUTF16toUTF8(profilePathWide);
  }

  void TearDown() override {
    if (mKeystore) {
      EXPECT_NS_SUCCEEDED(keystore_close(mKeystore));
      mKeystore = nullptr;
    }
    if (mTmpDir) {
      mTmpDir->Remove(true);
    }
  }

  // Mint a fresh LocalKey kek_ref against the already-open keystore
  // and store it in `mLocalKekRef`. Call this after a successful
  // `keystore_open` whenever the test needs a usable
  // LocalKey to wrap a DEK under.
  void MintLocalKek() {
    const nsCString kekType("local"_ns);
    const nsCString empty;
    nsresult rv = keystore_create_kek(mKeystore, &kekType, &empty, &empty,
                                      /* cache_timeout_ms */ 0, &mLocalKekRef);
    ASSERT_NS_SUCCEEDED(rv);
  }

  // Mint a fresh Password kek_ref against the already-open keystore.
  // The unlocked KEK is NOT cached on creation; callers must invoke
  // keystore_unlock_kek before any DEK op against it.
  void MintPassword(const nsACString& aPassword, nsCString& aOut) {
    const nsCString kekType("password"_ns);
    const nsCString empty;
    nsresult rv = keystore_create_kek(mKeystore, &kekType, &empty, &aPassword,
                                      /* cache_timeout_ms */ 0, &aOut);
    ASSERT_NS_SUCCEEDED(rv);
  }
};

TEST_F(LockstoreKeystoreTest, OpenAndClose) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();
  ASSERT_NE(mKeystore, nullptr);
  nsresult rvClose = keystore_close(mKeystore);
  mKeystore = nullptr;
  ASSERT_NS_SUCCEEDED(rvClose);
}

TEST_F(LockstoreKeystoreTest, OpenEmptyPath) {
  nsAutoCString empty;
  nsresult rv = keystore_open(&empty, &mKeystore);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
  ASSERT_EQ(mKeystore, nullptr);
}

TEST_F(LockstoreKeystoreTest, CreateAndListDek) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("mydek");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<nsCString> dekNames;
  rv = keystore_list_deks(mKeystore, &dekNames);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(dekNames.Length(), 1u);
  EXPECT_EQ(dekNames[0], dekName);
}

TEST_F(LockstoreKeystoreTest, CreateDekEmptyDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  nsAutoCString empty;
  rv = keystore_create_dek(mKeystore, &empty, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, CreateDekDuplicate) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("dup");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_EQ(rv, NS_ERROR_FAILURE);
}

TEST_F(LockstoreKeystoreTest, GetDekExtractable) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("extract");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, true,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<uint8_t> dek;
  rv = keystore_get_dek(mKeystore, &dekName, &mLocalKekRef, &dek);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_GT(dek.Length(), 0u);
}

TEST_F(LockstoreKeystoreTest, GetDekEmptyDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  nsAutoCString empty;
  nsTArray<uint8_t> dek;
  rv = keystore_get_dek(mKeystore, &empty, &mLocalKekRef, &dek);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, GetDekNonexistent) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("nosuch");
  nsTArray<uint8_t> dek;
  rv = keystore_get_dek(mKeystore, &dekName, &mLocalKekRef, &dek);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, GetDekNotExtractable) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("noextract");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<uint8_t> dek;
  rv = keystore_get_dek(mKeystore, &dekName, &mLocalKekRef, &dek);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, DeleteDek) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("todelete");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  rv = keystore_delete_dek(mKeystore, &dekName);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<nsCString> dekNames;
  rv = keystore_list_deks(mKeystore, &dekNames);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_EQ(dekNames.Length(), 0u);
}

TEST_F(LockstoreKeystoreTest, DeleteDekEmptyDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  nsAutoCString empty;
  rv = keystore_delete_dek(mKeystore, &empty);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, DeleteDekNonexistent) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("nosuch");
  rv = keystore_delete_dek(mKeystore, &dekName);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, ListDekNamesEmpty) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  nsTArray<nsCString> dekNames;
  rv = keystore_list_deks(mKeystore, &dekNames);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_EQ(dekNames.Length(), 0u);
}

TEST_F(LockstoreKeystoreTest, ListMultipleDekNames) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString alpha("alpha");
  const nsCString beta("beta");
  const nsCString gamma("gamma");
  rv = keystore_create_dek(mKeystore, &alpha, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);
  rv = keystore_create_dek(mKeystore, &beta, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);
  rv = keystore_create_dek(mKeystore, &gamma, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<nsCString> dekNames;
  rv = keystore_list_deks(mKeystore, &dekNames);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(dekNames.Length(), 3u);
  EXPECT_TRUE(dekNames.Contains(alpha));
  EXPECT_TRUE(dekNames.Contains(beta));
  EXPECT_TRUE(dekNames.Contains(gamma));
}

TEST_F(LockstoreKeystoreTest, PersistenceAcrossReopen) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("persist");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  ASSERT_NS_SUCCEEDED(keystore_close(mKeystore));
  mKeystore = nullptr;

  rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<nsCString> dekNames;
  rv = keystore_list_deks(mKeystore, &dekNames);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(dekNames.Length(), 1u);
  EXPECT_EQ(dekNames[0], dekName);
}

TEST_F(LockstoreKeystoreTest, AddKekEmptyDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  nsAutoCString empty;
  rv = keystore_add_kek(mKeystore, &empty, &mLocalKekRef, &mLocalKekRef);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, AddKekNonexistentDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("nosuch");
  rv = keystore_add_kek(mKeystore, &dekName, &mLocalKekRef, &mLocalKekRef);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, AddKekDuplicate) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("adddup");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  rv = keystore_add_kek(mKeystore, &dekName, &mLocalKekRef, &mLocalKekRef);
  ASSERT_EQ(rv, NS_ERROR_FAILURE);
}

TEST_F(LockstoreKeystoreTest, RemoveKekEmptyDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  nsAutoCString empty;
  rv = keystore_remove_kek(mKeystore, &empty, &mLocalKekRef);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, RemoveKekNonexistentDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("nosuch");
  rv = keystore_remove_kek(mKeystore, &dekName, &mLocalKekRef);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, RemoveKekLastRemaining) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("removelast");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  rv = keystore_remove_kek(mKeystore, &dekName, &mLocalKekRef);
  ASSERT_EQ(rv, NS_ERROR_FAILURE);
}

TEST_F(LockstoreKeystoreTest, EncryptDecryptRoundtrip) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("crypto");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  const uint8_t plaintext[] = {'h', 'e', 'l', 'l', 'o'};
  nsTArray<uint8_t> ciphertext;
  rv = keystore_encrypt(mKeystore, &dekName, &mLocalKekRef, plaintext,
                        sizeof(plaintext), &ciphertext);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_GT(ciphertext.Length(), sizeof(plaintext));

  nsTArray<uint8_t> round;
  rv = keystore_decrypt(mKeystore, &dekName, &mLocalKekRef,
                        ciphertext.Elements(), ciphertext.Length(), &round);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(round.Length(), sizeof(plaintext));
  EXPECT_EQ(memcmp(round.Elements(), plaintext, sizeof(plaintext)), 0);
}

TEST_F(LockstoreKeystoreTest, EncryptEmptyDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  nsAutoCString empty;
  const uint8_t plaintext[] = {'x'};
  nsTArray<uint8_t> ciphertext;
  rv = keystore_encrypt(mKeystore, &empty, &mLocalKekRef, plaintext,
                        sizeof(plaintext), &ciphertext);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, EncryptUnknownDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("nosuch");
  const uint8_t plaintext[] = {'x'};
  nsTArray<uint8_t> ciphertext;
  rv = keystore_encrypt(mKeystore, &dekName, &mLocalKekRef, plaintext,
                        sizeof(plaintext), &ciphertext);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, DecryptEmptyCiphertext) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("decempty");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<uint8_t> plaintext;
  rv = keystore_decrypt(mKeystore, &dekName, &mLocalKekRef, nullptr, 0,
                        &plaintext);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, IsKekUnlockedLocalAlwaysTrue) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  // LocalKey has no interactive gate, so it's always reported unlocked.
  bool unlocked = false;
  rv = keystore_is_kek_unlocked(mKeystore, &mLocalKekRef, &unlocked);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_TRUE(unlocked);
}

TEST_F(LockstoreKeystoreTest, IsKekUnlockedPasswordInitiallyFalse) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  // A freshly-minted Password kek_ref starts locked: createKek persists
  // the wrapped KEK but does not populate the unlock cache.
  nsCString pwKekRef;
  MintPassword("hunter2"_ns, pwKekRef);
  bool unlocked = true;
  rv = keystore_is_kek_unlocked(mKeystore, &pwKekRef, &unlocked);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_FALSE(unlocked);
}

TEST_F(LockstoreKeystoreTest, LockKekEmptyRef) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  nsAutoCString empty;
  rv = keystore_lock_kek(mKeystore, &empty);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, LockKekLocalIsNoop) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  // LocalKey lock/unlock never fail; they're no-ops.
  rv = keystore_lock_kek(mKeystore, &mLocalKekRef);
  ASSERT_NS_SUCCEEDED(rv);
}

TEST_F(LockstoreKeystoreTest, UnlockKekPasswordUnknownRefFails) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  // A `password:` kek_ref that has no persisted record surfaces
  // InvalidKekRef → NS_ERROR_INVALID_ARG when callers try to unlock it.
  const nsCString bogusPw("lockstore::kek::password:not-a-real-id"_ns);
  const nsCString pw("pw"_ns);
  rv = keystore_unlock_kek(mKeystore, &bogusPw, &pw,
                           /* timeoutMs */ 60000);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, UnlockKekUnknownRefFails) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString bogus("lockstore::kek::bogus"_ns);
  const nsCString pw("pw"_ns);
  rv = keystore_unlock_kek(mKeystore, &bogus, &pw,
                           /* timeoutMs */ 60000);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, GetDekForPasswordWhenLockedFails) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  // Freshly-minted Password kek_ref starts locked. Creating a DEK
  // under it must fail with NS_ERROR_NOT_AVAILABLE (Locked) until the
  // caller invokes unlock_kek.
  nsCString pwKekRef;
  MintPassword("hunter2"_ns, pwKekRef);
  const nsCString dekName("pwlocked");
  rv = keystore_create_dek(mKeystore, &dekName, &pwKekRef, false,
                           /*key_size=*/32);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, LockAllIsNoopWhenNothingCached) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  // `lock()` clears every cached KEK. With nothing cached it must still
  // succeed (callers on shutdown shouldn't have to check first).
  rv = keystore_lock(mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
}

TEST_F(LockstoreKeystoreTest, ImportDekRoundtripExtractable) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("imported");
  uint8_t dek[32];
  for (size_t i = 0; i < sizeof(dek); ++i) {
    dek[i] = static_cast<uint8_t>(i + 1);
  }
  rv = keystore_import_dek(mKeystore, &dekName, &mLocalKekRef, dek, sizeof(dek),
                           true);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<uint8_t> round;
  rv = keystore_get_dek(mKeystore, &dekName, &mLocalKekRef, &round);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(round.Length(), sizeof(dek));
  for (size_t i = 0; i < sizeof(dek); ++i) {
    EXPECT_EQ(round[i], dek[i]);
  }
}

TEST_F(LockstoreKeystoreTest, ImportDekWrongLength) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("badlen");
  uint8_t shortDek[16] = {0};
  rv = keystore_import_dek(mKeystore, &dekName, &mLocalKekRef, shortDek,
                           sizeof(shortDek), true);
  ASSERT_EQ(rv, NS_ERROR_FAILURE);
}

TEST_F(LockstoreKeystoreTest, ImportDekEmptyDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  nsAutoCString empty;
  uint8_t dek[32] = {0};
  rv = keystore_import_dek(mKeystore, &empty, &mLocalKekRef, dek, sizeof(dek),
                           true);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, ImportDekDuplicate) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("dup");
  uint8_t dek[32] = {0};
  rv = keystore_import_dek(mKeystore, &dekName, &mLocalKekRef, dek, sizeof(dek),
                           true);
  ASSERT_NS_SUCCEEDED(rv);

  rv = keystore_import_dek(mKeystore, &dekName, &mLocalKekRef, dek, sizeof(dek),
                           true);
  ASSERT_EQ(rv, NS_ERROR_FAILURE);
}

TEST_F(LockstoreKeystoreTest, IsDekExtractableTrue) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("extract-yes");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, true,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  bool extractable = false;
  rv = keystore_is_dek_extractable(mKeystore, &dekName, &extractable);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_TRUE(extractable);
}

TEST_F(LockstoreKeystoreTest, IsDekExtractableFalse) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("extract-no");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  bool extractable = true;
  rv = keystore_is_dek_extractable(mKeystore, &dekName, &extractable);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_FALSE(extractable);
}

TEST_F(LockstoreKeystoreTest, IsDekExtractableMissingDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("nope");
  bool extractable = false;
  rv = keystore_is_dek_extractable(mKeystore, &dekName, &extractable);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, IsDekExtractableEmptyDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  nsAutoCString empty;
  bool extractable = false;
  rv = keystore_is_dek_extractable(mKeystore, &empty, &extractable);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, SwitchKekEmptyArgs) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  nsAutoCString empty;
  const nsCString dekName("col");
  rv = keystore_switch_kek(mKeystore, &empty, &mLocalKekRef, &mLocalKekRef);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
  rv = keystore_switch_kek(mKeystore, &dekName, &empty, &mLocalKekRef);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
  rv = keystore_switch_kek(mKeystore, &dekName, &mLocalKekRef, &empty);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, SwitchKekSameRefRejected) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("col");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  rv = keystore_switch_kek(mKeystore, &dekName, &mLocalKekRef, &mLocalKekRef);
  // old == new is InvalidConfiguration → NS_ERROR_FAILURE per the FFI mapping.
  ASSERT_EQ(rv, NS_ERROR_FAILURE);
}

TEST_F(LockstoreKeystoreTest, SwitchKekNonexistentDekName) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  // Switching against a dekName that doesn't exist must reject
  // before the kek_ref types are even consulted.
  const nsCString dekName("nope");
  nsCString otherLocal;
  {
    const nsCString kekType("local"_ns);
    const nsCString empty;
    rv = keystore_create_kek(mKeystore, &kekType, &empty, &empty, 0,
                             &otherLocal);
    ASSERT_NS_SUCCEEDED(rv);
  }
  rv = keystore_switch_kek(mKeystore, &dekName, &mLocalKekRef, &otherLocal);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, SwitchKekMissingOldWrapping) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  // DekName wrapped only under LocalKey; "switch from <another Local>"
  // must reject because that other ref doesn't currently wrap this
  // dekName.
  const nsCString dekName("local-only");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  nsCString otherLocal;
  {
    const nsCString kekType("local"_ns);
    const nsCString empty;
    rv = keystore_create_kek(mKeystore, &kekType, &empty, &empty, 0,
                             &otherLocal);
    ASSERT_NS_SUCCEEDED(rv);
  }
  rv = keystore_switch_kek(mKeystore, &dekName, &otherLocal, &mLocalKekRef);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

// switchKek happy path: rewrapping a DEK under a new KEK leaves the DEK
// bytes (and therefore ciphertexts at rest) unchanged, the new KEK can
// access it, and the old KEK no longer wraps it.
TEST_F(LockstoreKeystoreTest, SwitchKekRewrapsAndPreservesDek) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("switchok");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef,
                           /*extractable=*/true,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<uint8_t> dekBefore;
  rv = keystore_get_dek(mKeystore, &dekName, &mLocalKekRef, &dekBefore);
  ASSERT_NS_SUCCEEDED(rv);

  const uint8_t plaintext[] = {'r', 'e', 'w', 'r', 'a', 'p'};
  nsTArray<uint8_t> ciphertext;
  rv = keystore_encrypt(mKeystore, &dekName, &mLocalKekRef, plaintext,
                        sizeof(plaintext), &ciphertext);
  ASSERT_NS_SUCCEEDED(rv);

  nsCString newKek;
  {
    const nsCString kekType("local"_ns);
    const nsCString empty;
    rv = keystore_create_kek(mKeystore, &kekType, &empty, &empty, 0, &newKek);
    ASSERT_NS_SUCCEEDED(rv);
  }
  rv = keystore_switch_kek(mKeystore, &dekName, &mLocalKekRef, &newKek);
  ASSERT_NS_SUCCEEDED(rv);

  // Same DEK bytes under the new KEK.
  nsTArray<uint8_t> dekAfter;
  rv = keystore_get_dek(mKeystore, &dekName, &newKek, &dekAfter);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(dekAfter, dekBefore);

  // Ciphertext produced before the switch still decrypts under the new KEK.
  nsTArray<uint8_t> round;
  rv = keystore_decrypt(mKeystore, &dekName, &newKek, ciphertext.Elements(),
                        ciphertext.Length(), &round);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(round.Length(), sizeof(plaintext));
  EXPECT_EQ(memcmp(round.Elements(), plaintext, sizeof(plaintext)), 0);

  // The old KEK no longer wraps the DEK.
  nsTArray<uint8_t> viaOld;
  rv = keystore_get_dek(mKeystore, &dekName, &mLocalKekRef, &viaOld);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

// addKek happy path: a second KEK wrapping the same DEK can decrypt
// ciphertext produced under the first.
TEST_F(LockstoreKeystoreTest, AddKekSharesDekAcrossKeks) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("shared");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  nsCString secondKek;
  {
    const nsCString kekType("local"_ns);
    const nsCString empty;
    rv =
        keystore_create_kek(mKeystore, &kekType, &empty, &empty, 0, &secondKek);
    ASSERT_NS_SUCCEEDED(rv);
  }
  rv = keystore_add_kek(mKeystore, &dekName, &mLocalKekRef, &secondKek);
  ASSERT_NS_SUCCEEDED(rv);

  const uint8_t plaintext[] = {'s', 'h', 'a', 'r', 'e'};
  nsTArray<uint8_t> ciphertext;
  rv = keystore_encrypt(mKeystore, &dekName, &mLocalKekRef, plaintext,
                        sizeof(plaintext), &ciphertext);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<uint8_t> round;
  rv = keystore_decrypt(mKeystore, &dekName, &secondKek, ciphertext.Elements(),
                        ciphertext.Length(), &round);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(round.Length(), sizeof(plaintext));
  EXPECT_EQ(memcmp(round.Elements(), plaintext, sizeof(plaintext)), 0);
}

// deleteKek drops a KEK that wraps no DEK.
TEST_F(LockstoreKeystoreTest, DeleteKekUnreferenced) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  rv = keystore_delete_kek(mKeystore, &mLocalKekRef);
  ASSERT_NS_SUCCEEDED(rv);
  // It is gone now: a second delete reports NotFound.
  rv = keystore_delete_kek(mKeystore, &mLocalKekRef);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

// deleteKek refuses to drop a KEK still wrapping a DEK.
TEST_F(LockstoreKeystoreTest, DeleteKekRejectsWhenInUse) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  MintLocalKek();

  const nsCString dekName("inuse");
  rv = keystore_create_dek(mKeystore, &dekName, &mLocalKekRef, false,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  rv = keystore_delete_kek(mKeystore, &mLocalKekRef);
  ASSERT_EQ(rv, NS_ERROR_FAILURE);
}

TEST_F(LockstoreKeystoreTest, DeleteKekEmptyRef) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsAutoCString empty;
  rv = keystore_delete_kek(mKeystore, &empty);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, DeleteKekUnknownRef) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  // Well-formed local kek_ref with no persisted record.
  const nsCString bogus("lockstore::kek::local:not-a-real-id"_ns);
  rv = keystore_delete_kek(mKeystore, &bogus);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, DeleteKekInvalidRefFormat) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString malformed("not-a-kek-ref"_ns);
  rv = keystore_delete_kek(mKeystore, &malformed);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

// Password KEK: a correct unlock makes the KEK usable for DEK ops.
TEST_F(LockstoreKeystoreTest, UnlockPasswordThenUseSucceeds) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsCString pwKekRef;
  MintPassword("hunter2"_ns, pwKekRef);
  const nsCString pw("hunter2"_ns);
  rv = keystore_unlock_kek(mKeystore, &pwKekRef, &pw, /* timeoutMs */ 60000);
  ASSERT_NS_SUCCEEDED(rv);

  bool unlocked = false;
  rv = keystore_is_kek_unlocked(mKeystore, &pwKekRef, &unlocked);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_TRUE(unlocked);

  const nsCString dekName("pwdek");
  rv = keystore_create_dek(mKeystore, &dekName, &pwKekRef, /*extractable=*/true,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);
  nsTArray<uint8_t> dek;
  rv = keystore_get_dek(mKeystore, &dekName, &pwKekRef, &dek);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(dek.Length(), 32u);
}

// Password KEK: an incorrect secret is rejected (AEAD-tag failure) and
// nothing is cached.
TEST_F(LockstoreKeystoreTest, UnlockPasswordWrongSecretRejected) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsCString pwKekRef;
  MintPassword("hunter2"_ns, pwKekRef);
  const nsCString wrong("nope"_ns);
  rv = keystore_unlock_kek(mKeystore, &pwKekRef, &wrong, /* timeoutMs */ 60000);
  ASSERT_EQ(rv, NS_ERROR_ABORT);

  bool unlocked = true;
  rv = keystore_is_kek_unlocked(mKeystore, &pwKekRef, &unlocked);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_FALSE(unlocked);
}

// lockKek drops a Password KEK's cached secret, so subsequent DEK access
// fails until the caller re-unlocks.
TEST_F(LockstoreKeystoreTest, LockKekClearsPasswordCache) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsCString pwKekRef;
  MintPassword("hunter2"_ns, pwKekRef);
  const nsCString pw("hunter2"_ns);
  rv = keystore_unlock_kek(mKeystore, &pwKekRef, &pw, /* timeoutMs */ 60000);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString dekName("pwlock");
  rv = keystore_create_dek(mKeystore, &dekName, &pwKekRef, /*extractable=*/true,
                           /*key_size=*/32);
  ASSERT_NS_SUCCEEDED(rv);

  rv = keystore_lock_kek(mKeystore, &pwKekRef);
  ASSERT_NS_SUCCEEDED(rv);

  bool unlocked = true;
  rv = keystore_is_kek_unlocked(mKeystore, &pwKekRef, &unlocked);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_FALSE(unlocked);

  nsTArray<uint8_t> dek;
  rv = keystore_get_dek(mKeystore, &dekName, &pwKekRef, &dek);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

// createKek with a non-empty identifier is deterministic: the same
// (type, identifier) returns the same kek_ref instead of minting a new one.
TEST_F(LockstoreKeystoreTest, CreateKekIdentifierIsIdempotent) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString kekType("local"_ns);
  const nsCString identifier("myid123"_ns);
  const nsCString empty;
  nsCString first;
  rv = keystore_create_kek(mKeystore, &kekType, &identifier, &empty, 0, &first);
  ASSERT_NS_SUCCEEDED(rv);
  nsCString second;
  rv =
      keystore_create_kek(mKeystore, &kekType, &identifier, &empty, 0, &second);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_EQ(first, second);
}

// createKek rejects an identifier that is not base64url.
TEST_F(LockstoreKeystoreTest, CreateKekRejectsNonBase64urlIdentifier) {
  nsresult rv = keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString kekType("local"_ns);
  const nsCString badIdentifier("bad id!"_ns);
  const nsCString empty;
  nsCString out;
  rv =
      keystore_create_kek(mKeystore, &kekType, &badIdentifier, &empty, 0, &out);
  ASSERT_EQ(rv, NS_ERROR_FAILURE);
}
