/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_Sandbox_h
#define mozilla_Sandbox_h

#include <sys/sysctl.h>

#include <cstring>
#include <string>
#include <vector>

#include "mozilla/ipc/UtilityProcessSandboxing.h"

enum MacSandboxType {
  MacSandboxType_Default = 0,
  MacSandboxType_Content,
  MacSandboxType_GMP,
  MacSandboxType_RDD,
  MacSandboxType_Socket,
  MacSandboxType_Utility,
  MacSandboxType_GPU,
  MacSandboxType_Invalid
};

typedef struct _MacSandboxInfo {
  _MacSandboxInfo()
      : type(MacSandboxType_Default),
        level(0),
        hasFilePrivileges(false),
        hasSandboxedProfile(false),
        hasAudio(false),
        hasWindowServer(false),
        shouldLog(false) {}
  _MacSandboxInfo(const struct _MacSandboxInfo& other) = default;

  void AppendAsParams(std::vector<std::string>& aParams) const;
  static void AppendFileAccessParam(std::vector<std::string>& aParams,
                                    bool aHasFilePrivileges);

 private:
  void AppendStartupParam(std::vector<std::string>& aParams) const;
  void AppendLoggingParam(std::vector<std::string>& aParams) const;
  void AppendAppPathParam(std::vector<std::string>& aParams) const;
  void AppendPluginPathParam(std::vector<std::string>& aParams) const;
  void AppendLevelParam(std::vector<std::string>& aParams) const;
  void AppendAudioParam(std::vector<std::string>& aParams) const;
  void AppendWindowServerParam(std::vector<std::string>& aParams) const;
  void AppendReadPathParams(std::vector<std::string>& aParams) const;
#ifdef DEBUG
  void AppendDebugWriteDirParam(std::vector<std::string>& aParams) const;
#endif

 public:
  MacSandboxType type;
  mozilla::ipc::SandboxingKind utilityKind;
  int32_t level;
  bool hasFilePrivileges;
  bool hasSandboxedProfile;
  bool hasAudio;
  bool hasWindowServer;

  std::string appPath;
  std::string appBinaryPath;
  std::string appDir;
  std::string profileDir;
  std::string debugWriteDir;

  std::string pluginPath;
  std::string pluginBinaryPath;

  std::string testingReadPath1;
  std::string testingReadPath2;
  std::string testingReadPath3;
  std::string testingReadPath4;

  std::string crashServerPort;

  bool shouldLog;
} MacSandboxInfo;

namespace mozilla {

bool StartMacSandbox(MacSandboxInfo const& aInfo, std::string& aErrorMessage);
bool StartMacSandboxIfEnabled(MacSandboxType aSandboxType, int aArgc,
                              char** aArgv, std::string& aErrorMessage);
bool IsMacSandboxStarted();
#ifdef DEBUG
void AssertMacSandboxEnabled();
#endif /* DEBUG */

/*
 * Returns true if the process is running under x86_64. This encompasses
 * Intel macs and Apple Silicon running the Rosetta translator. This
 * complements (rather than duplicates) ProcessIsRosettaTranslated() in
 * Sandbox.mm, which keys off `sysctl.proc_translated` and is true only
 * for Rosetta. Defined inline here so SandboxTestingChildTests.h can
 * call it without linking Sandbox.mm into the test binary.
 */
inline bool ProcessIsX86_64() {
  char arch[32] = {0};
  size_t size = sizeof(arch);
  if (sysctlbyname("hw.machine", arch, &size, nullptr, 0) == -1) {
    return false;
  }
  return std::strcmp(arch, "x86_64") == 0;
}

}  // namespace mozilla

#endif  // mozilla_Sandbox_h
