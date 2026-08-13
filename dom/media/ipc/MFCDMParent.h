/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_IPC_MFCDMPARENT_H_
#define DOM_MEDIA_IPC_MFCDMPARENT_H_

#include <wrl.h>

#include "MFCDMExtra.h"
#include "MFCDMSession.h"
#include "MFPMPHostWrapper.h"
#include "MFProtectedPathReadinessMonitor.h"
#include "RemoteMediaManagerParent.h"
#include "mozilla/EventTargetAndLockCapability.h"
#include "mozilla/Maybe.h"
#include "mozilla/MozPromise.h"
#include "mozilla/PMFCDMParent.h"
#include "mozilla/RefPtr.h"
#include "mozilla/StaticMutex.h"

namespace mozilla {

class MFCDMProxy;

/**
 * MFCDMParent is a wrapper class for the Media Foundation CDM in the utility
 * process.
 * It's responsible to create and manage a CDM and its sessions, and acts as a
 * proxy to the Media Foundation interfaces
 * (https://learn.microsoft.com/en-us/windows/win32/api/mfcontentdecryptionmodule/)
 * by accepting calls from and calling back to MFCDMChild in the content
 * process.
 */
class MFCDMParent final : public PMFCDMParent {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(MFCDMParent, final);

  MFCDMParent(const nsAString& aKeySystem, RemoteMediaManagerParent* aManager,
              nsISerialEventTarget* aManagerThread);

  static void SetWidevineL1Path(const char* aPath);

  // Perform clean-up when shutting down the MFCDM process.
  static void Shutdown();

  // Return capabilities from all key systems which the media foundation CDM
  // supports.
  using CapabilitiesPromise =
      MozPromise<CopyableTArray<MFCDMCapabilitiesIPDL>, nsresult, true>;
  static RefPtr<CapabilitiesPromise> GetAllKeySystemsCapabilities();

  static already_AddRefed<MFCDMParent> GetCDMById(uint64_t aId);
  uint64_t Id() const { return mId; }
  const nsString& GetKeySystem() const { return mKeySystem; }

  // Per-session protected-playback readiness monitor. The engine actor reads
  // and updates it via GetCDMById because this CDM actor outlives an engine
  // recreate.
  MFProtectedPathReadinessMonitor& ReadinessMonitor() {
    return mReadinessMonitor;
  }

  bool IsHardwareDRM() const { return mIsHardwareDRM; }

  // Whether this session is clearlead: its stream begins with clear samples
  // before switching to encrypted, so its first produced frame is clear.
  bool IsClearLead() const;

  void ActorDestroy(ActorDestroyReason aWhy) override;

  mozilla::ipc::IPCResult RecvGetCapabilities(
      const MFCDMCapabilitiesRequest& aRequest,
      GetCapabilitiesResolver&& aResolver);

  mozilla::ipc::IPCResult RecvInit(const MFCDMInitParamsIPDL& aParams,
                                   InitResolver&& aResolver);

  mozilla::ipc::IPCResult RecvCreateSessionAndGenerateRequest(
      const MFCDMCreateSessionParamsIPDL& aParams,
      CreateSessionAndGenerateRequestResolver&& aResolver);

  mozilla::ipc::IPCResult RecvLoadSession(
      const KeySystemConfig::SessionType& aSessionType,
      const nsString& aSessionId, LoadSessionResolver&& aResolver);

  mozilla::ipc::IPCResult RecvUpdateSession(
      const nsString& aSessionId, const CopyableTArray<uint8_t>& aResponse,
      UpdateSessionResolver&& aResolver);

  mozilla::ipc::IPCResult RecvCloseSession(const nsString& aSessionId,
                                           UpdateSessionResolver&& aResolver);

  mozilla::ipc::IPCResult RecvRemoveSession(const nsString& aSessionId,
                                            UpdateSessionResolver&& aResolver);

  mozilla::ipc::IPCResult RecvSetServerCertificate(
      const CopyableTArray<uint8_t>& aCertificate,
      UpdateSessionResolver&& aResolver);

  mozilla::ipc::IPCResult RecvGetStatusForPolicy(
      const dom::HDCPVersion& aMinHdcpVersion,
      GetStatusForPolicyResolver&& aResolver);

  // Checks whether the HDCP 2.2 link has settled after a hardware reset.
  // The result is used as a timing signal only; playback proceeds regardless
  // of whether the check succeeds or fails.
  RefPtr<GenericPromise> WaitForHDCPSettleAfterReset();

  // Resolves with the IsHDCPVersionSupported result (NS_OK iff supported) on
  // the manager thread, after running the blocking query on a background queue;
  // rejects only if that query could not be dispatched.
  using HDCPSupportPromise =
      MozPromise<nsresult, nsresult, /* IsExclusive */ false>;
  static RefPtr<HDCPSupportPromise> QueryHDCPSupport(
      const nsString& aKeySystem, dom::HDCPVersion aVersion,
      nsISerialEventTarget* aManagerThread);

  // Warms the HDCP support query off the playback path at CDM init and marks
  // the readiness monitor's HDCP condition once it completes: Ready if HDCP is
  // supported, Failed otherwise (the gate still proceeds on Failed, and Media
  // Foundation rebuilds HDCP when it later builds the topology). Skipped for
  // non-hardware-DRM playback, which has no HDCP gate. HDCP is a per-display
  // property, so the query is issued at most once per process and concurrent
  // actors wait on the same outstanding query.
  void PrewarmHDCP(bool aIsHardwareDRM);

  // Marks the readiness monitor's HDCP condition Ready if aSupported, else
  // Failed.
  void MarkHDCPCondition(bool aSupported);

  // Process-wide HDCP pre-warm state, touched only on the manager thread (which
  // every MFCDMParent shares). sHDCPSupported holds the queried per-display
  // HDCP result once known (Nothing until then); sHDCPPrewarmQuery is the
  // outstanding query that concurrent actors share. Reset on a hardware context
  // change so HDCP is re-queried.
  static inline Maybe<bool> sHDCPSupported;
  static inline RefPtr<HDCPSupportPromise> sHDCPPrewarmQuery;
  // Bumped on every hardware-context reset so an in-flight pre-warm query that
  // resolves after the reset is ignored: its result predates the change.
  static inline uint32_t sHDCPPrewarmGeneration = 0;

  // A thread-safe method to access the CDM proxy. Returns nullptr if the CDM
  // has been shut down.
  MFCDMProxy* GetMFCDMProxy();

  void ShutdownCDM();

  // Called when a hardware context reset (e.g. GPU/DRM device lost) invalidates
  // all active CDM sessions. Closes every open session and resets the trusted
  // input so the content process can re-establish keys.
  void OnHardwareContextReset();

 private:
  ~MFCDMParent();

  enum class CapabilitesFlag {
    HarewareDecryption,
    NeedClearLeadCheck,
    IsPrivateBrowsing,
  };
  using CapabilitesFlagSet = EnumSet<CapabilitesFlag, uint8_t>;

  static LPCWSTR GetCDMLibraryName(const nsString& aKeySystem);

  static HRESULT GetOrCreateFactory(
      const nsString& aKeySystem,
      Microsoft::WRL::ComPtr<IMFContentDecryptionModuleFactory>& aFactoryOut);

  static HRESULT LoadFactory(
      const nsString& aKeySystem,
      Microsoft::WRL::ComPtr<IMFContentDecryptionModuleFactory>& aFactoryOut);

  static void GetCapabilities(const nsString& aKeySystem,
                              const CapabilitesFlagSet& aFlags,
                              IMFContentDecryptionModuleFactory* aFactory,
                              MFCDMCapabilitiesIPDL& aCapabilitiesOut);

  void Register();
  void Unregister();

  void ConnectSessionEvents(MFCDMSession* aSession);

  MFCDMSession* GetSession(const nsString& aSessionId);

  // Called after a GPU/DRM hardware context reset to discard the invalid CDM
  // and create a fresh one so new sessions can be established.
  HRESULT RecreateCDM();
  // Sets up the PMPHostApp on the CDM. Only required by PlayReady.
  HRESULT SetupPMPHostApp() MOZ_REQUIRES(mCDMAccessLock);

  mozilla::Mutex& Mutex() MOZ_RETURN_CAPABILITY(mCDMAccessLock.Lock()) {
    return mCDMAccessLock.Lock();
  }

  nsString mKeySystem;

  const RefPtr<RemoteMediaManagerParent> mManager;
  const RefPtr<nsISerialEventTarget> mManagerThread;

  Maybe<MFCDMInitParamsIPDL> mInitParams;

  // Guards sRegisteredCDMs and the strong reference handed out by GetCDMById.
  static inline StaticMutex sRegistryMutex;

  MFProtectedPathReadinessMonitor mReadinessMonitor;

  constinit static inline nsTHashMap<nsUint64HashKey, MFCDMParent*>
      sRegisteredCDMs MOZ_GUARDED_BY(sRegistryMutex);

  static inline uint64_t sNextId = 1;
  const uint64_t mId;
  bool mIsInited = false;
  bool mIsHardwareDRM = false;

  static inline BSTR sWidevineL1Path;

  Microsoft::WRL::ComPtr<IMFContentDecryptionModuleFactory> mFactory;
  Microsoft::WRL::ComPtr<MFPMPHostWrapper> mPMPHostWrapper;

  std::map<nsString, UniquePtr<MFCDMSession>> mSessions;

  MediaEventForwarder<MFCDMKeyMessage> mKeyMessageEvents;
  MediaEventForwarder<MFCDMKeyStatusChange> mKeyChangeEvents;
  MediaEventForwarder<MFCDMKeyExpiration> mExpirationEvents;
  MediaEventForwarder<MFCDMSessionClosedResult> mClosedEvents;

  MediaEventListener mKeyMessageListener;
  MediaEventListener mKeyChangeListener;
  MediaEventListener mExpirationListener;
  MediaEventListener mClosedListener;

  // The mCDM and mCDMProxy members are exclusively modified on the manager
  // thread, while being read-only on other threads. To ensure thread-safe
  // access, we employ the EventTargetAndLockCapability mechanism.
  mozilla::EventTargetAndLockCapability<nsISerialEventTarget, mozilla::Mutex>
      mCDMAccessLock;
  Microsoft::WRL::ComPtr<IMFContentDecryptionModule> mCDM
      MOZ_GUARDED_BY(mCDMAccessLock);
  RefPtr<MFCDMProxy> mCDMProxy MOZ_GUARDED_BY(mCDMAccessLock);
};

// A helper class only used in the chrome process to handle CDM related tasks.
class MFCDMService {
 public:
  // This is used to display CDM capabilites in `about:support`.
  static void GetAllKeySystemsCapabilities(dom::Promise* aPromise);

  // If Widevine L1 is downloaded after the MFCDM process is created, then we
  // use this method to update the L1 path and setup L1 permission for the MFCDM
  // process.
  static void UpdateWidevineL1Path(nsIFile* aFile);

 private:
  static RefPtr<GenericNonExclusivePromise> LaunchMFCDMProcessIfNeeded(
      ipc::SandboxingKind aSandbox);
};

}  // namespace mozilla

#endif  // DOM_MEDIA_IPC_MFCDMPARENT_H_
