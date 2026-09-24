/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

// Tests that ValidateAndResolveModuleSection rejects invalid section modules.
//
// Everything here runs in the parent process and needs no child process.
// Driving a real content process into loading a chosen DLL - is not currently
// possible from a test (loadModuleForTesting is MAIN_PROCESS_ONLY).
#include "gtest/gtest.h"

#include <windows.h>
#include <aclapi.h>
#include <sddl.h>

#include "mozilla/FileUtilsWin.h"
#include "mozilla/ipc/FileDescriptor.h"
#include "mozilla/UntrustedModulesProcessor.h"
#include "nsCOMPtr.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsIFile.h"
#include "nsString.h"
#include "nsWindowsHelpers.h"

// NativeNt.h declares this only for the freestanding launcher, inside its
// !MOZILLA_INTERNAL_API block, so declare it locally the way
// TestDllBlocklistAssumptions.cpp does for NtMapViewOfSection.
extern "C" NTSTATUS NTAPI NtCreateSection(PHANDLE aSectionHandle,
                                          ACCESS_MASK aDesiredAccess,
                                          POBJECT_ATTRIBUTES aObjectAttributes,
                                          PLARGE_INTEGER aMaximumSize,
                                          ULONG aSectionPageProtection,
                                          ULONG aAllocationAttributes,
                                          HANDLE aFileHandle);

using namespace mozilla;

namespace {

// Creates a SEC_IMAGE section over aFile with the same arguments the loader
// uses.
nsAutoHandle MakeImageSection(HANDLE aFile) {
  HANDLE section = nullptr;
  NTSTATUS status = ::NtCreateSection(
      &section, SECTION_QUERY | SECTION_MAP_READ | SECTION_MAP_EXECUTE, nullptr,
      nullptr, PAGE_EXECUTE, SEC_IMAGE, aFile);
  if (!NT_SUCCESS(status)) {
    return nsAutoHandle();
  }
  return nsAutoHandle(section);
}

nsAutoHandle OpenForImageSection(const nsString& aPath) {
  return nsAutoHandle(
      ::CreateFileW(aPath.get(), GENERIC_READ | GENERIC_EXECUTE,
                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                    nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
}

// A private copy of a small real module, so that a test can apply an integrity
// label to a file that is still a valid PE.
class ScopedModuleCopy final {
 public:
  ScopedModuleCopy() {
    wchar_t source[MAX_PATH + 1] = {};
    UINT sysLen = ::GetSystemDirectoryW(source, MAX_PATH);
    if (!sysLen || sysLen > MAX_PATH) {
      return;
    }
    // Small, present on every Windows install, and not a module we load here.
    if (wcscat_s(source, MAX_PATH, L"\\version.dll") != 0) {
      return;
    }

    // Use local AppData instead of TMP because mozilla-build permissions
    // would prevent this from succeeding in local builds in TMP.
    nsCOMPtr<nsIFile> file;
    if (NS_FAILED(NS_GetSpecialDirectory(NS_WIN_LOCAL_APPDATA_DIR,
                                         getter_AddRefs(file))) ||
        NS_FAILED(file->Append(u"mfv.dll"_ns)) ||
        NS_FAILED(file->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600))) {
      return;
    }

    nsAutoString path;
    if (NS_FAILED(file->GetPath(path))) {
      file->Remove(false);
      return;
    }

    // The unique file already exists, so this overwrites it, leaving its
    // inherited permissions in place.
    if (!::CopyFileW(source, path.get(), FALSE)) {
      file->Remove(false);
      return;
    }

    mPath = path;
  }

  ~ScopedModuleCopy() {
    if (!mPath.IsEmpty()) {
      ::DeleteFileW(mPath.get());
    }
  }

  bool IsValid() const { return !mPath.IsEmpty(); }
  const nsString& Path() const { return mPath; }

  // Applies a mandatory label. aSddl is a SACL in SDDL form, e.g.
  // "S:(ML;;NW;;;LW)" for low integrity.
  bool SetIntegrityLabel(const wchar_t* aSddl) {
    PSECURITY_DESCRIPTOR rawSd = nullptr;
    if (!::ConvertStringSecurityDescriptorToSecurityDescriptorW(
            aSddl, SDDL_REVISION_1, &rawSd, nullptr)) {
      return false;
    }

    UniquePtr<void, LocalFreeDeleter> sd(rawSd);

    BOOL saclPresent = FALSE;
    BOOL saclDefaulted = FALSE;
    PACL sacl = nullptr;
    if (!::GetSecurityDescriptorSacl(rawSd, &saclPresent, &sacl,
                                     &saclDefaulted) ||
        !saclPresent) {
      return false;
    }

    nsAutoString mutablePath(mPath);
    return ::SetNamedSecurityInfoW(
               reinterpret_cast<wchar_t*>(mutablePath.BeginWriting()),
               SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, nullptr, nullptr,
               nullptr, sacl) == ERROR_SUCCESS;
  }

 private:
  nsString mPath;
};

}  // anonymous namespace

TEST(TestModuleFileValidation, AcceptsLoadedModuleAndVerifiesPathsMatch)
{
  wchar_t xulPath[MAX_PATH + 1] = {};
  ASSERT_NE(::GetModuleFileNameW(::GetModuleHandleW(L"xul.dll"), xulPath,
                                 std::size(xulPath)),
            0UL);

  nsAutoString path(xulPath);
  nsAutoHandle file(OpenForImageSection(path));
  ASSERT_NE(file.get(), INVALID_HANDLE_VALUE);

  nsAutoHandle section(MakeImageSection(file.get()));
  ASSERT_NE(section.get(), nullptr);

  ipc::FileDescriptor fd(section.get());
  ASSERT_TRUE(fd.IsValid());

  nsAutoString resolved;
  ASSERT_TRUE(ValidateAndResolveModuleSection(fd, resolved));

  // CompleteProcessing looks up the parent's ModulesMap by this path, so it
  // has to name the file the child loaded; if it named it differently, lookup
  // would miss and every module would be mistakenly reported as trusted. It is
  // in the NT device form that a child's loader observer records and that
  // ModuleRecord expects, so it needs converting before it can be compared
  // against a DOS path.
  EXPECT_TRUE(StringBeginsWith(resolved, u"\\Device\\"_ns));

  nsAutoString resolvedDosPath;
  ASSERT_TRUE(NtPathToDosPath(resolved, resolvedDosPath));
  EXPECT_TRUE(resolvedDosPath.Equals(path, nsCaseInsensitiveStringComparator))
      << "resolved: " << NS_ConvertUTF16toUTF8(resolvedDosPath).get()
      << ", expected: " << NS_ConvertUTF16toUTF8(path).get();
}

// An invalid descriptor must be refused rather than producing a path.
TEST(TestModuleFileValidation, RejectsInvalidDescriptor)
{
  ipc::FileDescriptor fd;
  ASSERT_FALSE(fd.IsValid());

  nsAutoString resolved;
  EXPECT_FALSE(ValidateAndResolveModuleSection(fd, resolved));
  EXPECT_TRUE(resolved.IsEmpty());
}

// A handle to something unmappable must be refused.
TEST(TestModuleFileValidation, RejectsNonSectionHandle)
{
  HANDLE readEnd = nullptr;
  HANDLE writeEnd = nullptr;
  ASSERT_TRUE(::CreatePipe(&readEnd, &writeEnd, nullptr, 0));
  nsAutoHandle read(readEnd);
  nsAutoHandle write(writeEnd);

  ipc::FileDescriptor fd(read.get());
  ASSERT_TRUE(fd.IsValid());

  nsAutoString resolved;
  EXPECT_FALSE(ValidateAndResolveModuleSection(fd, resolved));
  EXPECT_TRUE(resolved.IsEmpty());
}

// A handle to a non-MEM_IMAGE section must be refused.
TEST(TestModuleFileValidation, RejectsDataSection)
{
  wchar_t xulPath[MAX_PATH + 1] = {};
  ASSERT_NE(::GetModuleFileNameW(::GetModuleHandleW(L"xul.dll"), xulPath,
                                 std::size(xulPath)),
            0UL);

  nsAutoHandle file(
      ::CreateFileW(xulPath, GENERIC_READ,
                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                    nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
  ASSERT_NE(file.get(), INVALID_HANDLE_VALUE);

  // The same file, but mapped as data rather than as an image.
  nsAutoHandle mapping(::CreateFileMappingW(file.get(), nullptr, PAGE_READONLY,
                                            0, 4096, nullptr));
  ASSERT_NE(mapping.get(), nullptr);

  ipc::FileDescriptor fd(mapping.get());
  ASSERT_TRUE(fd.IsValid());

  nsAutoString resolved;
  EXPECT_FALSE(ValidateAndResolveModuleSection(fd, resolved));
  EXPECT_TRUE(resolved.IsEmpty());
}

// An unlabelled file is medium integrity by default, which is the usual case
// and is accepted.
TEST(TestModuleFileValidation, AcceptsUnlabelledModule)
{
  ScopedModuleCopy copy;
  ASSERT_TRUE(copy.IsValid());

  nsAutoHandle file(OpenForImageSection(copy.Path()));
  ASSERT_NE(file.get(), INVALID_HANDLE_VALUE);

  nsAutoHandle section(MakeImageSection(file.get()));
  ASSERT_NE(section.get(), nullptr);

  ipc::FileDescriptor fd(section.get());
  ASSERT_TRUE(fd.IsValid());

  nsAutoString resolved;
  EXPECT_TRUE(ValidateAndResolveModuleSection(fd, resolved));
  EXPECT_TRUE(StringBeginsWith(resolved, u"\\Device\\"_ns));

  // The copy carries a generated temp name, not the name of the module it was
  // copied from, so check that the resolved path names this file.
  int32_t leafOffset = copy.Path().RFindChar(u'\\');
  ASSERT_NE(leafOffset, kNotFound);
  EXPECT_TRUE(StringEndsWith(resolved,
                             nsDependentSubstring(copy.Path(), leafOffset),
                             nsCaseInsensitiveStringComparator));
}

// A low integrity module must be rejected.
TEST(TestModuleFileValidation, RejectsLowIntegrityModule)
{
  ScopedModuleCopy copy;
  ASSERT_TRUE(copy.IsValid());
  ASSERT_TRUE(copy.SetIntegrityLabel(L"S:(ML;;NW;;;LW)"));

  nsAutoHandle file(OpenForImageSection(copy.Path()));
  ASSERT_NE(file.get(), INVALID_HANDLE_VALUE);

  nsAutoHandle section(MakeImageSection(file.get()));
  ASSERT_NE(section.get(), nullptr);

  ipc::FileDescriptor fd(section.get());
  ASSERT_TRUE(fd.IsValid());

  nsAutoString resolved;
  EXPECT_FALSE(ValidateAndResolveModuleSection(fd, resolved));
  EXPECT_TRUE(resolved.IsEmpty());
}

// Untrusted integrity is below low, so it must be refused too.
TEST(TestModuleFileValidation, RejectsUntrustedIntegrityModule)
{
  ScopedModuleCopy copy;
  ASSERT_TRUE(copy.IsValid());
  ASSERT_TRUE(copy.SetIntegrityLabel(L"S:(ML;;NW;;;S-1-16-0)"));

  nsAutoHandle file(OpenForImageSection(copy.Path()));
  ASSERT_NE(file.get(), INVALID_HANDLE_VALUE);

  nsAutoHandle section(MakeImageSection(file.get()));
  ASSERT_NE(section.get(), nullptr);

  ipc::FileDescriptor fd(section.get());
  ASSERT_TRUE(fd.IsValid());

  nsAutoString resolved;
  EXPECT_FALSE(ValidateAndResolveModuleSection(fd, resolved));
  EXPECT_TRUE(resolved.IsEmpty());
}

// A label at or above medium is not something a low integrity child could have
// written, so it must not be refused.
TEST(TestModuleFileValidation, AcceptsMediumIntegrityModule)
{
  ScopedModuleCopy copy;
  ASSERT_TRUE(copy.IsValid());
  ASSERT_TRUE(copy.SetIntegrityLabel(L"S:(ML;;NW;;;ME)"));

  nsAutoHandle file(OpenForImageSection(copy.Path()));
  ASSERT_NE(file.get(), INVALID_HANDLE_VALUE);

  nsAutoHandle section(MakeImageSection(file.get()));
  ASSERT_NE(section.get(), nullptr);

  ipc::FileDescriptor fd(section.get());
  ASSERT_TRUE(fd.IsValid());

  nsAutoString resolved;
  EXPECT_TRUE(ValidateAndResolveModuleSection(fd, resolved));
  EXPECT_TRUE(StringBeginsWith(resolved, u"\\Device\\"_ns));
}
