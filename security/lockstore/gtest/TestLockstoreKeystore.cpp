/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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

using mozilla::security::lockstore::lockstore_keystore_add_security_level;
using mozilla::security::lockstore::lockstore_keystore_close;
using mozilla::security::lockstore::lockstore_keystore_create_dek;
using mozilla::security::lockstore::lockstore_keystore_delete_dek;
using mozilla::security::lockstore::lockstore_keystore_get_dek;
using mozilla::security::lockstore::lockstore_keystore_list_collections;
using mozilla::security::lockstore::lockstore_keystore_open;
using mozilla::security::lockstore::lockstore_keystore_remove_security_level;
using mozilla::security::lockstore::LockstoreKeystoreHandle;
using mozilla::security::lockstore::LockstoreSecurityLevel;

class LockstoreKeystoreTest : public ::testing::Test {
 protected:
  nsCOMPtr<nsIFile> mTmpDir;
  nsAutoCString mProfilePath;
  LockstoreKeystoreHandle* mKeystore = nullptr;

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
      EXPECT_NS_SUCCEEDED(lockstore_keystore_close(mKeystore));
      mKeystore = nullptr;
    }
    if (mTmpDir) {
      mTmpDir->Remove(true);
    }
  }
};

TEST_F(LockstoreKeystoreTest, OpenAndClose) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_NE(mKeystore, nullptr);
  nsresult rvClose = lockstore_keystore_close(mKeystore);
  mKeystore = nullptr;
  ASSERT_NS_SUCCEEDED(rvClose);
}

TEST_F(LockstoreKeystoreTest, OpenEmptyPath) {
  nsAutoCString empty;
  nsresult rv = lockstore_keystore_open(&empty, &mKeystore);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
  ASSERT_EQ(mKeystore, nullptr);
}

TEST_F(LockstoreKeystoreTest, CreateAndListDek) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("mycoll");
  rv = lockstore_keystore_create_dek(mKeystore, &coll,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<nsCString> collections;
  rv = lockstore_keystore_list_collections(mKeystore, &collections);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(collections.Length(), 1u);
  EXPECT_EQ(collections[0], coll);
}

TEST_F(LockstoreKeystoreTest, CreateDekEmptyCollection) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsAutoCString empty;
  rv = lockstore_keystore_create_dek(mKeystore, &empty,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, CreateDekDuplicate) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("dup");
  rv = lockstore_keystore_create_dek(mKeystore, &coll,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_NS_SUCCEEDED(rv);

  rv = lockstore_keystore_create_dek(mKeystore, &coll,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_EQ(rv, NS_ERROR_FAILURE);
}

TEST_F(LockstoreKeystoreTest, GetDekExtractable) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("extract");
  rv = lockstore_keystore_create_dek(mKeystore, &coll,
                                     LockstoreSecurityLevel::LocalKey, true);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<uint8_t> dek;
  rv = lockstore_keystore_get_dek(mKeystore, &coll,
                                  LockstoreSecurityLevel::LocalKey, &dek);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_GT(dek.Length(), 0u);
}

TEST_F(LockstoreKeystoreTest, GetDekEmptyCollection) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsAutoCString empty;
  nsTArray<uint8_t> dek;
  rv = lockstore_keystore_get_dek(mKeystore, &empty,
                                  LockstoreSecurityLevel::LocalKey, &dek);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, GetDekNonexistent) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("nosuch");
  nsTArray<uint8_t> dek;
  rv = lockstore_keystore_get_dek(mKeystore, &coll,
                                  LockstoreSecurityLevel::LocalKey, &dek);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, GetDekNotExtractable) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("noextract");
  rv = lockstore_keystore_create_dek(mKeystore, &coll,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<uint8_t> dek;
  rv = lockstore_keystore_get_dek(mKeystore, &coll,
                                  LockstoreSecurityLevel::LocalKey, &dek);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, DeleteDek) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("todelete");
  rv = lockstore_keystore_create_dek(mKeystore, &coll,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_NS_SUCCEEDED(rv);

  rv = lockstore_keystore_delete_dek(mKeystore, &coll);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<nsCString> collections;
  rv = lockstore_keystore_list_collections(mKeystore, &collections);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_EQ(collections.Length(), 0u);
}

TEST_F(LockstoreKeystoreTest, DeleteDekEmptyCollection) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsAutoCString empty;
  rv = lockstore_keystore_delete_dek(mKeystore, &empty);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, DeleteDekNonexistent) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("nosuch");
  rv = lockstore_keystore_delete_dek(mKeystore, &coll);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, ListCollectionsEmpty) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<nsCString> collections;
  rv = lockstore_keystore_list_collections(mKeystore, &collections);
  ASSERT_NS_SUCCEEDED(rv);
  EXPECT_EQ(collections.Length(), 0u);
}

TEST_F(LockstoreKeystoreTest, ListMultipleCollections) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString alpha("alpha");
  const nsCString beta("beta");
  const nsCString gamma("gamma");
  rv = lockstore_keystore_create_dek(mKeystore, &alpha,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_NS_SUCCEEDED(rv);
  rv = lockstore_keystore_create_dek(mKeystore, &beta,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_NS_SUCCEEDED(rv);
  rv = lockstore_keystore_create_dek(mKeystore, &gamma,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<nsCString> collections;
  rv = lockstore_keystore_list_collections(mKeystore, &collections);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(collections.Length(), 3u);
  EXPECT_TRUE(collections.Contains(alpha));
  EXPECT_TRUE(collections.Contains(beta));
  EXPECT_TRUE(collections.Contains(gamma));
}

TEST_F(LockstoreKeystoreTest, PersistenceAcrossReopen) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("persist");
  rv = lockstore_keystore_create_dek(mKeystore, &coll,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_NS_SUCCEEDED(rv);

  ASSERT_NS_SUCCEEDED(lockstore_keystore_close(mKeystore));
  mKeystore = nullptr;

  rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsTArray<nsCString> collections;
  rv = lockstore_keystore_list_collections(mKeystore, &collections);
  ASSERT_NS_SUCCEEDED(rv);
  ASSERT_EQ(collections.Length(), 1u);
  EXPECT_EQ(collections[0], coll);
}

TEST_F(LockstoreKeystoreTest, AddSecurityLevelEmptyCollection) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsAutoCString empty;
  rv = lockstore_keystore_add_security_level(mKeystore, &empty,
                                             LockstoreSecurityLevel::LocalKey,
                                             LockstoreSecurityLevel::LocalKey);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, AddSecurityLevelNonexistentCollection) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("nosuch");
  rv = lockstore_keystore_add_security_level(mKeystore, &coll,
                                             LockstoreSecurityLevel::LocalKey,
                                             LockstoreSecurityLevel::LocalKey);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, AddSecurityLevelDuplicate) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("adddup");
  rv = lockstore_keystore_create_dek(mKeystore, &coll,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_NS_SUCCEEDED(rv);

  rv = lockstore_keystore_add_security_level(mKeystore, &coll,
                                             LockstoreSecurityLevel::LocalKey,
                                             LockstoreSecurityLevel::LocalKey);
  ASSERT_EQ(rv, NS_ERROR_FAILURE);
}

TEST_F(LockstoreKeystoreTest, RemoveSecurityLevelEmptyCollection) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  nsAutoCString empty;
  rv = lockstore_keystore_remove_security_level(
      mKeystore, &empty, LockstoreSecurityLevel::LocalKey);
  ASSERT_EQ(rv, NS_ERROR_INVALID_ARG);
}

TEST_F(LockstoreKeystoreTest, RemoveSecurityLevelNonexistentCollection) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("nosuch");
  rv = lockstore_keystore_remove_security_level(
      mKeystore, &coll, LockstoreSecurityLevel::LocalKey);
  ASSERT_EQ(rv, NS_ERROR_NOT_AVAILABLE);
}

TEST_F(LockstoreKeystoreTest, RemoveSecurityLevelLastRemaining) {
  nsresult rv = lockstore_keystore_open(&mProfilePath, &mKeystore);
  ASSERT_NS_SUCCEEDED(rv);

  const nsCString coll("removelast");
  rv = lockstore_keystore_create_dek(mKeystore, &coll,
                                     LockstoreSecurityLevel::LocalKey, false);
  ASSERT_NS_SUCCEEDED(rv);

  rv = lockstore_keystore_remove_security_level(
      mKeystore, &coll, LockstoreSecurityLevel::LocalKey);
  ASSERT_EQ(rv, NS_ERROR_FAILURE);
}
