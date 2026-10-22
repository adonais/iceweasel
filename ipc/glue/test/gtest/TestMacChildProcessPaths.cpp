/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"

#include "mozilla/ipc/GeckoChildProcessHost.h"
#include "nsCOMPtr.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsIDirectoryEnumerator.h"
#include "nsIFile.h"
#include "nsReadableUtils.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsXPCOM.h"

using mozilla::ipc::GetChildProcessBundleNameForTesting;
using mozilla::ipc::MacOSChildProcessBundleType;
using mozilla::ipc::ResolveChildProcessPathFromPlistForTesting;

namespace {

constexpr size_t kBundleTypeCount =
    static_cast<size_t>(MacOSChildProcessBundleType::Count);

// App bundles that ship beside the child process bundles but are not launched
// through GeckoChildProcessHost.
constexpr const char* kNonChildProcessBundles[] = {"crashreporter.app",
                                                   "updater.app"};

bool IsNonChildProcessBundle(const nsACString& aLeafName) {
  for (const char* bundle : kNonChildProcessBundles) {
    if (aLeafName.Equals(bundle)) {
      return true;
    }
  }
  return false;
}

already_AddRefed<nsIFile> GetGREBinDir() {
  nsCOMPtr<nsIFile> greBinDir;
  if (NS_FAILED(
          NS_GetSpecialDirectory(NS_GRE_BIN_DIR, getter_AddRefs(greBinDir)))) {
    return nullptr;
  }
  return greBinDir.forget();
}

// The leaf names in <GreBinDir>/<aBundleName>/Contents/MacOS, found without
// reading a plist so that the result is independent of the code under test.
nsTArray<nsCString> GetExecutablesInBundle(const nsACString& aBundleName) {
  nsTArray<nsCString> executables;

  nsCOMPtr<nsIFile> macOSDir = GetGREBinDir();
  if (!macOSDir || NS_FAILED(macOSDir->AppendNative(aBundleName)) ||
      NS_FAILED(macOSDir->AppendNative("Contents"_ns)) ||
      NS_FAILED(macOSDir->AppendNative("MacOS"_ns))) {
    return executables;
  }

  nsCOMPtr<nsIDirectoryEnumerator> entries;
  if (NS_FAILED(macOSDir->GetDirectoryEntries(getter_AddRefs(entries)))) {
    return executables;
  }

  nsCOMPtr<nsIFile> entry;
  while (NS_SUCCEEDED(entries->GetNextFile(getter_AddRefs(entry))) && entry) {
    nsAutoCString leafName;
    if (NS_SUCCEEDED(entry->GetNativeLeafName(leafName))) {
      executables.AppendElement(leafName);
    }
  }

  return executables;
}

}  // namespace

// Every bundle type has to resolve through its Info.plist.
TEST(MacChildProcessPaths, PlistResolutionSucceedsForEveryBundleType)
{
  for (size_t i = 0; i < kBundleTypeCount; ++i) {
    auto bundleType = static_cast<MacOSChildProcessBundleType>(i);
    nsLiteralCString bundleName =
        GetChildProcessBundleNameForTesting(bundleType);

    nsAutoCString resolvedPath;
    if (!ResolveChildProcessPathFromPlistForTesting(bundleType, resolvedPath)) {
      ADD_FAILURE() << "could not read the executable name from "
                    << bundleName.get();
      continue;
    }

    nsCOMPtr<nsIFile> executable;
    if (NS_FAILED(
            NS_NewNativeLocalFile(resolvedPath, getter_AddRefs(executable)))) {
      ADD_FAILURE() << resolvedPath.get() << " is not a usable path";
      continue;
    }

    bool isFile = false;
    EXPECT_TRUE(NS_SUCCEEDED(executable->IsFile(&isFile)) && isFile)
        << resolvedPath.get() << " does not exist or is not a file";

    EXPECT_TRUE(resolvedPath.Contains(bundleName))
        << resolvedPath.get() << " is not inside " << bundleName.get();
  }
}

// The leaf name the plist produced has to be the executable that is really
// there. The leaf is the only part of the resolved path that came from the
// plist, since everything before it is built from the GRE directory and the
// bundle name macro. Checked without using a plist API to ensure independence.
TEST(MacChildProcessPaths, ResolvedLeafIsTheExecutableInTheBundle)
{
  for (size_t i = 0; i < kBundleTypeCount; ++i) {
    auto bundleType = static_cast<MacOSChildProcessBundleType>(i);
    nsLiteralCString bundleName =
        GetChildProcessBundleNameForTesting(bundleType);

    nsAutoCString resolvedPath;
    if (!ResolveChildProcessPathFromPlistForTesting(bundleType, resolvedPath)) {
      ADD_FAILURE() << "could not read the executable name from "
                    << bundleName.get();
      continue;
    }

    nsCOMPtr<nsIFile> executable;
    nsAutoCString resolvedLeaf;
    if (NS_FAILED(
            NS_NewNativeLocalFile(resolvedPath, getter_AddRefs(executable))) ||
        NS_FAILED(executable->GetNativeLeafName(resolvedLeaf))) {
      ADD_FAILURE() << resolvedPath.get() << " is not a usable path";
      continue;
    }

    nsTArray<nsCString> onDisk = GetExecutablesInBundle(bundleName);
    if (onDisk.Length() != 1) {
      ADD_FAILURE() << bundleName.get() << " holds " << onDisk.Length()
                    << " executables, expected exactly one";
      continue;
    }

    EXPECT_STREQ(onDisk[0].get(), resolvedLeaf.get())
        << "the plist for " << bundleName.get()
        << " does not name the executable that is on disk";
  }
}

// A helper bundle on disk that no bundle type claims means a
// child process was added without a MacOSChildProcessBundleType value.
// Because the launcher falls back to Default the process can start from
// plugin-container carrying the wrong entitlements if not caught.
TEST(MacChildProcessPaths, EveryHelperBundleOnDiskIsClaimed)
{
  nsTArray<nsCString> knownBundles;
  for (size_t i = 0; i < kBundleTypeCount; ++i) {
    knownBundles.AppendElement(GetChildProcessBundleNameForTesting(
        static_cast<MacOSChildProcessBundleType>(i)));
  }

  nsCOMPtr<nsIFile> greBinDir = GetGREBinDir();
  ASSERT_TRUE(greBinDir);

  nsCOMPtr<nsIDirectoryEnumerator> entries;
  ASSERT_TRUE(
      NS_SUCCEEDED(greBinDir->GetDirectoryEntries(getter_AddRefs(entries))));

  nsCOMPtr<nsIFile> entry;
  while (NS_SUCCEEDED(entries->GetNextFile(getter_AddRefs(entry))) && entry) {
    nsAutoCString leafName;
    if (NS_FAILED(entry->GetNativeLeafName(leafName))) {
      continue;
    }

    if (!StringEndsWith(leafName, ".app"_ns) ||
        IsNonChildProcessBundle(leafName)) {
      continue;
    }

    EXPECT_TRUE(knownBundles.Contains(leafName))
        << leafName.get()
        << " is not claimed by any MacOSChildProcessBundleType. Add a value to "
           "that enum and cases to the bundle helpers in "
           "GeckoChildProcessHost.cpp, or list it in kNonChildProcessBundles "
           "if it is not launched as a child process.";
  }
}
