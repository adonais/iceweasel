/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

#include "gtest/gtest.h"
#include "mozilla/XREAppData.h"
#include "nsAppRunner.h"
#include "nsDirectoryServiceDefs.h"
#include "nsIFile.h"
#include "nsString.h"
#include "prio.h"

static int sCheckCompatTestCounter = 0;

class CheckCompatibilityTest : public ::testing::Test {
 protected:
  nsCOMPtr<nsIFile> mBaseDir;
  nsCOMPtr<nsIFile> mProfileDir;
  nsCOMPtr<nsIFile> mPlatformDir;
  nsCOMPtr<nsIFile> mAppDir;
  const mozilla::XREAppData* mOriginalAppData = nullptr;
  mozilla::XREAppData mFakeAppData{};

  void SetUp() override {
    nsCOMPtr<nsIFile> tmpDir;
    nsresult rv =
        NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(tmpDir));
    ASSERT_EQ(NS_OK, rv);

    rv = tmpDir->Clone(getter_AddRefs(mBaseDir));
    ASSERT_EQ(NS_OK, rv);
    // Use a counter so each test gets a unique directory. CreateUnique would
    // reuse names after TearDown deletes the directory, and URLPreloader
    // caches file content by path so a reused path returns stale data.
    nsAutoString dirName(u"test_compat_"_ns);
    dirName.AppendInt(sCheckCompatTestCounter++);
    rv = mBaseDir->Append(dirName);
    ASSERT_EQ(NS_OK, rv);
    rv = mBaseDir->Create(nsIFile::DIRECTORY_TYPE, 0755);
    ASSERT_EQ(NS_OK, rv);

    rv = mBaseDir->Clone(getter_AddRefs(mProfileDir));
    ASSERT_EQ(NS_OK, rv);
    rv = mProfileDir->Append(u"profile"_ns);
    ASSERT_EQ(NS_OK, rv);
    rv = mProfileDir->Create(nsIFile::DIRECTORY_TYPE, 0755);
    ASSERT_EQ(NS_OK, rv);

    rv = mBaseDir->Clone(getter_AddRefs(mPlatformDir));
    ASSERT_EQ(NS_OK, rv);
    rv = mPlatformDir->Append(u"platform"_ns);
    ASSERT_EQ(NS_OK, rv);
    rv = mPlatformDir->Create(nsIFile::DIRECTORY_TYPE, 0755);
    ASSERT_EQ(NS_OK, rv);

    rv = mBaseDir->Clone(getter_AddRefs(mAppDir));
    ASSERT_EQ(NS_OK, rv);
    rv = mAppDir->Append(u"appdir"_ns);
    ASSERT_EQ(NS_OK, rv);
    rv = mAppDir->Create(nsIFile::DIRECTORY_TYPE, 0755);
    ASSERT_EQ(NS_OK, rv);

    mFakeAppData.version = "130.0";
    mFakeAppData.buildID = "20250101000000";
    mOriginalAppData = gAppData;
    gAppData = &mFakeAppData;
  }

  void TearDown() override {
    if (mOriginalAppData) {
      gAppData = mOriginalAppData;
      mOriginalAppData = nullptr;
    }
    if (mBaseDir) {
      mBaseDir->Remove(true);
    }
  }

  void WriteCompatIni(const nsACString& aContent) {
    nsCOMPtr<nsIFile> file;
    nsresult rv = mProfileDir->Clone(getter_AddRefs(file));
    ASSERT_EQ(NS_OK, rv);
    rv = file->AppendNative("compatibility.ini"_ns);
    ASSERT_EQ(NS_OK, rv);

    PRFileDesc* fd;
    rv = file->OpenNSPRFileDesc(PR_WRONLY | PR_CREATE_FILE | PR_TRUNCATE, 0600,
                                &fd);
    ASSERT_EQ(NS_OK, rv);

    PR_Write(fd, aContent.BeginReading(), aContent.Length());
    PR_Close(fd);
  }

  void WriteCompatIniWithDirs(const nsACString& aVersion,
                              const nsACString& aOSABI,
                              const nsACString& aExtra = ""_ns) {
    nsAutoCString platformDesc;
    (void)mPlatformDir->GetPersistentDescriptor(platformDesc);
    nsAutoCString appDesc;
    (void)mAppDir->GetPersistentDescriptor(appDesc);

    nsAutoCString content;
    content.AppendPrintf(
        "[Compatibility]\n"
        "LastVersion=%s\n"
        "LastOSABI=%s\n"
        "LastPlatformDir=%s\n"
        "LastAppDir=%s\n",
        PromiseFlatCString(aVersion).get(), PromiseFlatCString(aOSABI).get(),
        platformDesc.get(), appDesc.get());
    if (!aExtra.IsEmpty()) {
      content.Append(aExtra);
      content.AppendLiteral("\n");
    }
    WriteCompatIni(content);
  }

  void CreatePurgeCachesFile(nsCOMPtr<nsIFile>& aFlagFile) {
    nsresult rv = mProfileDir->Clone(getter_AddRefs(aFlagFile));
    ASSERT_EQ(NS_OK, rv);
    rv = aFlagFile->AppendNative(".purgecaches"_ns);
    ASSERT_EQ(NS_OK, rv);
    rv = aFlagFile->Create(nsIFile::NORMAL_FILE_TYPE, 0644);
    ASSERT_EQ(NS_OK, rv);
  }
};

TEST_F(CheckCompatibilityTest, VersionMatchesEverythingIdentical) {
  nsCString version("130.0_20250101000000/20250101000000");
  WriteCompatIniWithDirs(version, "Darwin_aarch64-gcc3"_ns);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, version, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_TRUE(result.isCompatible);
  EXPECT_TRUE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "130.0");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250101000000");
}

TEST_F(CheckCompatibilityTest, VersionMatchesOSABIDiffers) {
  nsCString version("130.0_20250101000000/20250101000000");
  WriteCompatIniWithDirs(version, "Darwin_aarch64-gcc3"_ns);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, version, "Linux_x86_64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_FALSE(result.isCompatible);
  EXPECT_FALSE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "130.0");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250101000000");
}

TEST_F(CheckCompatibilityTest, VersionMatchesInvalidateCaches) {
  nsCString version("130.0_20250101000000/20250101000000");
  WriteCompatIniWithDirs(version, "Darwin_aarch64-gcc3"_ns,
                         "InvalidateCaches=1"_ns);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, version, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_TRUE(result.isCompatible);
  EXPECT_FALSE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "130.0");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250101000000");
}

TEST_F(CheckCompatibilityTest, VersionMatchesPurgeCachesFileExists) {
  nsCString version("130.0_20250101000000/20250101000000");
  WriteCompatIniWithDirs(version, "Darwin_aarch64-gcc3"_ns);

  nsCOMPtr<nsIFile> flagFile;
  CreatePurgeCachesFile(flagFile);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, version, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, flagFile);

  EXPECT_TRUE(result.isCompatible);
  EXPECT_FALSE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "130.0");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250101000000");
}

TEST_F(CheckCompatibilityTest, VersionMatchesDifferentPlatformDir) {
  nsCString version("130.0_20250101000000/20250101000000");

  nsCOMPtr<nsIFile> tmpDir;
  NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(tmpDir));
  nsCOMPtr<nsIFile> otherDir;
  tmpDir->Clone(getter_AddRefs(otherDir));
  otherDir->Append(u"test_compat_other_platform"_ns);
  otherDir->Remove(true);
  (void)otherDir->Create(nsIFile::DIRECTORY_TYPE, 0755);

  nsAutoCString otherDesc;
  (void)otherDir->GetPersistentDescriptor(otherDesc);

  nsAutoCString appDesc;
  (void)mAppDir->GetPersistentDescriptor(appDesc);

  nsAutoCString content;
  content.AppendPrintf(
      "[Compatibility]\n"
      "LastVersion=%s\n"
      "LastOSABI=Darwin_aarch64-gcc3\n"
      "LastPlatformDir=%s\n"
      "LastAppDir=%s\n",
      version.get(), otherDesc.get(), appDesc.get());
  WriteCompatIni(content);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, version, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_FALSE(result.isCompatible);
  EXPECT_FALSE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_TRUE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "130.0");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250101000000");

  otherDir->Remove(true);
}

TEST_F(CheckCompatibilityTest, VersionMatchesDifferentAppDir) {
  nsCString version("130.0_20250101000000/20250101000000");

  nsAutoCString platformDesc;
  (void)mPlatformDir->GetPersistentDescriptor(platformDesc);

  nsAutoCString content;
  content.AppendPrintf(
      "[Compatibility]\n"
      "LastVersion=%s\n"
      "LastOSABI=Darwin_aarch64-gcc3\n"
      "LastPlatformDir=%s\n"
      "LastAppDir=/nonexistent/path\n",
      version.get(), platformDesc.get());
  WriteCompatIni(content);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, version, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_FALSE(result.isCompatible);
  EXPECT_FALSE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_TRUE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "130.0");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250101000000");
}

TEST_F(CheckCompatibilityTest, VersionUpgrade) {
  nsCString oldVersion("129.0_20240901000000/20240901000000");
  nsCString newVersion("130.0_20250101000000/20250101000000");
  WriteCompatIniWithDirs(oldVersion, "Darwin_aarch64-gcc3"_ns);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, newVersion, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_FALSE(result.isCompatible);
  EXPECT_FALSE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "129.0");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20240901000000");
}

TEST_F(CheckCompatibilityTest, VersionDowngrade) {
  nsCString oldVersion("131.0_20250201000000/20250201000000");
  nsCString newVersion("130.0_20250101000000/20250101000000");
  WriteCompatIniWithDirs(oldVersion, "Darwin_aarch64-gcc3"_ns);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, newVersion, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_FALSE(result.isCompatible);
  EXPECT_FALSE(result.cachesOK);
  EXPECT_TRUE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "131.0");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250201000000");
}

TEST_F(CheckCompatibilityTest, MinorVersionChangeNotDowngrade) {
  // A change from 130.1 to 130.0 is a minor version change within the same
  // major version. CompareCompatVersions only compares major versions, so this
  // should not be flagged as a downgrade, but the version mismatch should still
  // clear caches (isCompatible = false).
  nsCString oldVersion("130.1_20250201000000/20250201000000");
  nsCString newVersion("130.0_20250101000000/20250101000000");
  WriteCompatIniWithDirs(oldVersion, "Darwin_aarch64-gcc3"_ns);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, newVersion, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_FALSE(result.isCompatible);
  EXPECT_FALSE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "130.1");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250201000000");
}

TEST_F(CheckCompatibilityTest, PatchVersionChangeNotDowngrade) {
  nsCString oldVersion("130.0.1_20250201000000/20250201000000");
  nsCString newVersion("130.0_20250101000000/20250101000000");
  WriteCompatIniWithDirs(oldVersion, "Darwin_aarch64-gcc3"_ns);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, newVersion, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_FALSE(result.isCompatible);
  EXPECT_FALSE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "130.0.1");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250201000000");
}

TEST_F(CheckCompatibilityTest, EncryptedDatabases) {
  nsCString version("130.0_20250101000000/20250101000000");
  WriteCompatIniWithDirs(version, "Darwin_aarch64-gcc3"_ns,
                         "EncryptedDatabases=1"_ns);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, version, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_TRUE(result.isCompatible);
  EXPECT_TRUE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_TRUE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "130.0");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250101000000");
}

TEST_F(CheckCompatibilityTest, EncryptedDatabasesAbsent) {
  nsCString version("130.0_20250101000000/20250101000000");
  WriteCompatIniWithDirs(version, "Darwin_aarch64-gcc3"_ns);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, version, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_TRUE(result.isCompatible);
  EXPECT_TRUE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "130.0");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250101000000");
}

TEST_F(CheckCompatibilityTest, NoCompatIni) {
  nsCString version("130.0_20250101000000/20250101000000");

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, version, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_FALSE(result.isCompatible);
  EXPECT_FALSE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_TRUE(result.lastAppVersion.IsVoid());
  EXPECT_TRUE(result.lastAppBuildID.IsVoid());
}

TEST_F(CheckCompatibilityTest, SafeMode) {
  WriteCompatIniWithDirs("Safe Mode"_ns, "Darwin_aarch64-gcc3"_ns);

  nsCString version("130.0_20250101000000/20250101000000");
  CompatCheckResult result =
      CheckCompatibility(mProfileDir, version, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, mAppDir, nullptr);

  EXPECT_FALSE(result.isCompatible);
  EXPECT_FALSE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "Safe Mode");
  EXPECT_TRUE(result.lastAppBuildID.IsEmpty());
}

TEST_F(CheckCompatibilityTest, VersionMatchesNoAppDir) {
  nsCString version("130.0_20250101000000/20250101000000");
  nsAutoCString platformDesc;
  (void)mPlatformDir->GetPersistentDescriptor(platformDesc);

  nsAutoCString content;
  content.AppendPrintf(
      "[Compatibility]\n"
      "LastVersion=%s\n"
      "LastOSABI=Darwin_aarch64-gcc3\n"
      "LastPlatformDir=%s\n",
      version.get(), platformDesc.get());
  WriteCompatIni(content);

  CompatCheckResult result =
      CheckCompatibility(mProfileDir, version, "Darwin_aarch64-gcc3"_ns,
                         mPlatformDir, nullptr, nullptr);

  EXPECT_TRUE(result.isCompatible);
  EXPECT_TRUE(result.cachesOK);
  EXPECT_FALSE(result.isDowngrade);
  EXPECT_FALSE(result.isDifferentInstall);
  EXPECT_FALSE(result.hasEncryptedDatabases);
  EXPECT_STREQ(result.lastAppVersion.get(), "130.0");
  EXPECT_STREQ(result.lastAppBuildID.get(), "20250101000000");
}

TEST(ExtractCompatVersionInfoTest, NormalFormat)
{
  nsAutoCString version;
  nsAutoCString buildId;
  ExtractCompatVersionInfo("67.0_20190101120000/20190101120000"_ns, version,
                           buildId);
  EXPECT_STREQ(version.get(), "67.0");
  EXPECT_STREQ(buildId.get(), "20190101120000");
}

TEST(ExtractCompatVersionInfoTest, MissingUnderscore)
{
  nsAutoCString version;
  nsAutoCString buildId;
  ExtractCompatVersionInfo("67.0"_ns, version, buildId);
  EXPECT_STREQ(version.get(), "67.0");
  EXPECT_TRUE(buildId.IsEmpty());
}

TEST(ExtractCompatVersionInfoTest, MissingSlash)
{
  nsAutoCString version;
  nsAutoCString buildId;
  ExtractCompatVersionInfo("67.0_20190101120000"_ns, version, buildId);
  EXPECT_STREQ(version.get(), "67.0_20190101120000");
  EXPECT_TRUE(buildId.IsEmpty());
}
