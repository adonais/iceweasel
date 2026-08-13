/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SandboxInitialization.h"

#include "base/memory/ref_counted.h"
#include "mozilla/DebugOnly.h"
#include "mozilla/WindowsProcessMitigations.h"
#include "nsWindowsDllInterceptor.h"
#include "sandbox/win/src/process_mitigations.h"
#include "sandbox/win/src/sandbox_factory.h"

namespace mozilla {
namespace sandboxing {

static bool ThreadLocalStorageIsInitialized() {
  // Reserved[11] is ThreadLocalStoragePointer.
  return !!NtCurrentTeb()->Reserved1[11];
}

typedef BOOL(WINAPI* CloseHandle_func)(HANDLE hObject);
static WindowsDllInterceptor::FuncHookType<CloseHandle_func> stub_CloseHandle;

typedef BOOL(WINAPI* DuplicateHandle_func)(
    HANDLE hSourceProcessHandle, HANDLE hSourceHandle,
    HANDLE hTargetProcessHandle, LPHANDLE lpTargetHandle, DWORD dwDesiredAccess,
    BOOL bInheritHandle, DWORD dwOptions);
static WindowsDllInterceptor::FuncHookType<DuplicateHandle_func>
    stub_DuplicateHandle;

static BOOL WINAPI patched_CloseHandle(HANDLE hObject) {
  // Check handles being closed against the sandbox's tracked handles, skipping
  // threads where TLS is uninitialized (e.g. loader threadpool threads during
  // DLL mapping) as the verifier accesses a thread_local.
  if (ThreadLocalStorageIsInitialized()) {
    base::win::OnHandleBeingClosed(
        hObject, base::win::HandleOperation::kCloseHandleHook);
  }
  return stub_CloseHandle(hObject);
}

static BOOL WINAPI patched_DuplicateHandle(
    HANDLE hSourceProcessHandle, HANDLE hSourceHandle,
    HANDLE hTargetProcessHandle, LPHANDLE lpTargetHandle, DWORD dwDesiredAccess,
    BOOL bInheritHandle, DWORD dwOptions) {
  // If closing a source handle from our process, check it against the sandbox's
  // tracked handles. Skip if TLS is uninitialized (loader threadpool threads).
  if ((dwOptions & DUPLICATE_CLOSE_SOURCE) &&
      ThreadLocalStorageIsInitialized() &&
      (GetProcessId(hSourceProcessHandle) == ::GetCurrentProcessId())) {
    base::win::OnHandleBeingClosed(
        hSourceHandle, base::win::HandleOperation::kDuplicateHandleHook);
  }

  return stub_DuplicateHandle(hSourceProcessHandle, hSourceHandle,
                              hTargetProcessHandle, lpTargetHandle,
                              dwDesiredAccess, bInheritHandle, dwOptions);
}

typedef BOOL(WINAPI* ApiSetQueryApiSetPresence_func)(PCUNICODE_STRING,
                                                     PBOOLEAN);
static WindowsDllInterceptor::FuncHookType<ApiSetQueryApiSetPresence_func>
    stub_ApiSetQueryApiSetPresence;

static const WCHAR gApiSetNtUserWindowStation[] =
    L"ext-ms-win-ntuser-windowstation-l1-1-0";

static BOOL WINAPI patched_ApiSetQueryApiSetPresence(
    PCUNICODE_STRING aNamespace, PBOOLEAN aPresent) {
  if (aNamespace && aPresent &&
      !wcsncmp(aNamespace->Buffer, gApiSetNtUserWindowStation,
               aNamespace->Length / sizeof(WCHAR))) {
    *aPresent = FALSE;
    return TRUE;
  }

  return stub_ApiSetQueryApiSetPresence(aNamespace, aPresent);
}

MOZ_RUNINIT static WindowsDllInterceptor Kernel32Intercept;
MOZ_RUNINIT static WindowsDllInterceptor gApiQueryIntercept;

static bool EnableHandleCloseMonitoring() {
  Kernel32Intercept.Init("kernel32.dll");
  bool hooked = stub_CloseHandle.Set(Kernel32Intercept, "CloseHandle",
                                     &patched_CloseHandle);
  if (!hooked) {
    return false;
  }

  hooked = stub_DuplicateHandle.Set(Kernel32Intercept, "DuplicateHandle",
                                    &patched_DuplicateHandle);
  if (!hooked) {
    return false;
  }

  return true;
}

/**
 * There is a bug in COM that causes its initialization to fail when user32.dll
 * is loaded but Win32k lockdown is enabled. COM uses ApiSetQueryApiSetPresence
 * to make this check. When we are under Win32k lockdown, we hook
 * ApiSetQueryApiSetPresence and force it to tell the caller that the DLL of
 * interest is not present.
 */
static void EnableApiQueryInterception() {
  if (!IsWin32kLockedDown()) {
    return;
  }

  gApiQueryIntercept.Init(L"Api-ms-win-core-apiquery-l1-1-0.dll");
  DebugOnly<bool> hookSetOk = stub_ApiSetQueryApiSetPresence.Set(
      gApiQueryIntercept, "ApiSetQueryApiSetPresence",
      &patched_ApiSetQueryApiSetPresence);
  MOZ_ASSERT(hookSetOk);
}

static bool ShouldDisableHandleVerifier() {
  // ScopedHandle only uses VerifierTraits (which tracks handles) when
  // DCHECK_IS_ON(), i.e. debug builds. On optimized builds DummyVerifierTraits
  // means no handles are ever registered, so the hooks serve no purpose.
#if defined(DEBUG)
  return false;
#else
  return true;
#endif
}

static void InitializeHandleVerifier() {
  // Disable the handle verifier if we don't want it or can't enable the close
  // monitoring hooks.
  if (ShouldDisableHandleVerifier() || !EnableHandleCloseMonitoring()) {
    base::win::DisableHandleVerifier();
  }
}

static sandbox::TargetServices* InitializeTargetServices() {
  // This might disable the verifier, so we want to do it before it is used.
  InitializeHandleVerifier();

  EnableApiQueryInterception();

  sandbox::TargetServices* targetServices =
      sandbox::SandboxFactory::GetTargetServices();
  if (!targetServices) {
    return nullptr;
  }

  if (targetServices->Init() != sandbox::SBOX_ALL_OK) {
    return nullptr;
  }

  return targetServices;
}

sandbox::TargetServices* GetInitializedTargetServices() {
  static sandbox::TargetServices* sInitializedTargetServices =
      InitializeTargetServices();

  return sInitializedTargetServices;
}

void LowerSandbox() { GetInitializedTargetServices()->LowerToken(); }

class BrokerServicesDelegateImpl final
    : public sandbox::BrokerServicesDelegate {
 public:
  void ParallelLaunchPostTaskAndReplyWithResult(
      const base::Location& from_here,
      base::OnceCallback<sandbox::CreateTargetResult()> task,
      base::OnceCallback<void(sandbox::CreateTargetResult)> reply) override {
    // We don't want to use chromium multi-threaded launching, so just run the
    // callbacks inline.
    auto createTargetResult = std::move(task).Run();
    std::move(reply).Run(std::move(createTargetResult));
  }

  void BeforeTargetProcessCreateOnCreationThread(
      const void* trace_id) override {}

  void AfterTargetProcessCreateOnCreationThread(const void* trace_id,
                                                DWORD process_id) override {}

  void OnCreateThreadActionCreateFailure(DWORD last_error) override {}

  void OnCreateThreadActionDuplicateFailure(DWORD last_error) override {}
};

static sandbox::BrokerServices* InitializeBrokerServices() {
  // This might disable the verifier, so we want to do it before it is used.
  InitializeHandleVerifier();

  sandbox::BrokerServices* brokerServices =
      sandbox::SandboxFactory::GetBrokerServices();
  if (!brokerServices) {
    return nullptr;
  }

  if (brokerServices->Init(std::make_unique<BrokerServicesDelegateImpl>()) !=
      sandbox::SBOX_ALL_OK) {
    return nullptr;
  }

  // Comment below copied from Chromium code.
  // Precreate the desktop and window station used by the renderers.
  // IMPORTANT: This piece of code needs to run as early as possible in the
  // process because it will initialize the sandbox broker, which requires
  // the process to swap its window station. During this time all the UI
  // will be broken. This has to run before threads and windows are created.
  (void)brokerServices->CreateAlternateDesktop(
      sandbox::Desktop::kAlternateWinstation);

  // Ensure the relevant mitigations are enforced.
  mozilla::sandboxing::ApplyParentProcessMitigations();

  return brokerServices;
}

sandbox::BrokerServices* GetInitializedBrokerServices() {
  static sandbox::BrokerServices* sInitializedBrokerServices =
      InitializeBrokerServices();

  return sInitializedBrokerServices;
}

void ApplyParentProcessMitigations() {
  // The main reason for this call is for the token hardening, but chromium code
  // also ensures DEP without ATL thunk so we do the same.
  sandbox::RatchetDownSecurityMitigations(
      sandbox::MITIGATION_DEP | sandbox::MITIGATION_DEP_NO_ATL_THUNK |
      sandbox::MITIGATION_HARDEN_TOKEN_IL_POLICY);
}

}  // namespace sandboxing
}  // namespace mozilla
