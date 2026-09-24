/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "UtilityProcessManager.h"

#include "JSOracleParent.h"
#include "mozilla/AppShutdown.h"
#include "mozilla/Components.h"
#include "mozilla/ipc/UtilityProcessHost.h"
#include "mozilla/MemoryReportingProcess.h"
#include "mozilla/Preferences.h"
#include "mozilla/ProfilerMarkers.h"
#include "mozilla/StaticPrefs_browser.h"
#include "mozilla/StaticPrefs_media.h"
#include "mozilla/SyncRunnable.h"  // for LaunchUtilityProcess
#ifndef ANDROID
#  include "mozilla/hwinference/PHWInferenceChild.h"
#endif  // !ANDROID
#include "mozilla/ipc/UtilityProcessParent.h"
#include "mozilla/ipc/UtilityMediaServiceChild.h"
#include "mozilla/ipc/UtilityMediaServiceParent.h"
#include "mozilla/dom/BindingUtils.h"
#include "mozilla/dom/ContentParent.h"
#include "mozilla/ipc/Endpoint.h"
#include "mozilla/ipc/UtilityProcessSandboxing.h"
#include "mozilla/ipc/ProcessChild.h"
#include "nsAppRunner.h"
#include "nsContentUtils.h"

#ifdef XP_WIN
#  include "mozilla/dom/WindowsUtilsParent.h"
#  include "mozilla/widget/filedialog/WinFileDialogParent.h"
#endif

#include "mozilla/GeckoArgs.h"

#if defined(NIGHTLY_BUILD) && !defined(MOZ_NO_SMART_CARDS)
#  include "mozilla/psm/PPKCS11ModuleChild.h"
#endif  // NIGHTLY_BUILD && !MOZ_NO_SMART_CARDS

namespace mozilla::ipc {

extern LazyLogModule gUtilityProcessLog;
#define LOGD(...) MOZ_LOG(gUtilityProcessLog, LogLevel::Debug, (__VA_ARGS__))

static StaticRefPtr<UtilityProcessManager> sSingleton;

// We tear the Utility processes down at the beginning of XPCOMWillShutdown, so
// from that point on there is no point in handing out or launching any.
static bool IsPastLaunchDeadline() {
  return AppShutdown::IsInOrBeyond(ShutdownPhase::XPCOMWillShutdown);
}

bool UtilityProcessManager::IsShutdown() const {
  MOZ_ASSERT(NS_IsMainThread());
  return IsPastLaunchDeadline() || !sSingleton;
}

RefPtr<UtilityProcessManager> UtilityProcessManager::GetSingleton() {
  MOZ_ASSERT(XRE_IsParentProcess());
  MOZ_ASSERT(NS_IsMainThread());

  if (!IsPastLaunchDeadline() && sSingleton == nullptr) {
    sSingleton = new UtilityProcessManager();
    sSingleton->Init();
  }
  return sSingleton;
}

RefPtr<UtilityProcessManager> UtilityProcessManager::GetIfExists() {
  MOZ_ASSERT(NS_IsMainThread());
  return sSingleton;
}

UtilityProcessManager::UtilityProcessManager() {
  LOGD("[%p] UtilityProcessManager::UtilityProcessManager", this);
}

void UtilityProcessManager::Init() {
  // Start listening for pref changes so we can
  // forward them to the process once it is running.
  mObserver = new Observer(this);
  nsContentUtils::RegisterShutdownObserver(mObserver);
  Preferences::AddStrongObserver(mObserver, "");

  RegisterShutdownBlocker();
}

void UtilityProcessManager::RegisterShutdownBlocker() {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(!mShutdownBlocker);

  nsCOMPtr<nsIAsyncShutdownService> svc = components::AsyncShutdown::Service();
  if (!svc) {
    return;
  }

  nsCOMPtr<nsIAsyncShutdownClient> client;
  if (NS_FAILED(svc->GetXpcomWillShutdown(getter_AddRefs(client))) || !client) {
    return;
  }

  RefPtr<ShutdownBlocker> blocker = new ShutdownBlocker(this);
  if (NS_FAILED(client->AddBlocker(blocker,
                                   NS_LITERAL_STRING_FROM_CSTRING(__FILE__),
                                   __LINE__, u""_ns))) {
    // The phase is already closed for new blockers, so there is nothing left
    // for us to hold back. OnXPCOMShutdown will do the teardown instead.
    return;
  }

  mShutdownBlocker = std::move(blocker);
  mShutdownBlockerClient = std::move(client);
}

void UtilityProcessManager::RemoveShutdownBlocker() {
  MOZ_ASSERT(NS_IsMainThread());

  if (!mShutdownBlocker) {
    return;
  }

  LOGD("[%p] UtilityProcessManager::RemoveShutdownBlocker", this);

  mShutdownBlockerClient->RemoveBlocker(mShutdownBlocker);
  mShutdownBlockerClient = nullptr;
  mShutdownBlocker = nullptr;
}

NS_IMPL_ISUPPORTS(UtilityProcessManager::ShutdownBlocker,
                  nsIAsyncShutdownBlocker)

NS_IMETHODIMP UtilityProcessManager::ShutdownBlocker::GetName(
    nsAString& aName) {
  aName = u"UtilityProcessManager: shutting down the Utility processes"_ns;
  return NS_OK;
}

NS_IMETHODIMP UtilityProcessManager::ShutdownBlocker::BlockShutdown(
    nsIAsyncShutdownClient* aBarrierClient) {
  if (mManager) {
    mManager->OnXPCOMWillShutdown();
  }
  return NS_OK;
}

NS_IMETHODIMP UtilityProcessManager::ShutdownBlocker::GetState(
    nsIPropertyBag** aState) {
  *aState = nullptr;
  return NS_OK;
}

UtilityProcessManager::~UtilityProcessManager() {
  LOGD("[%p] UtilityProcessManager::~UtilityProcessManager", this);

  // The Utility process should ALL have already been shut down.
  MOZ_ASSERT(NoMoreProcesses());
}

NS_IMPL_ISUPPORTS(UtilityProcessManager::Observer, nsIObserver);

UtilityProcessManager::Observer::Observer(UtilityProcessManager* aManager)
    : mManager(aManager) {}

NS_IMETHODIMP
UtilityProcessManager::Observer::Observe(nsISupports* aSubject,
                                         const char* aTopic,
                                         const char16_t* aData) {
  if (!strcmp(aTopic, NS_XPCOM_SHUTDOWN_OBSERVER_ID)) {
    mManager->OnXPCOMShutdown();
  } else if (!strcmp(aTopic, "nsPref:changed")) {
    mManager->OnPreferenceChange(aData);
  }
  return NS_OK;
}

void UtilityProcessManager::OnXPCOMWillShutdown() {
  LOGD("[%p] UtilityProcessManager::OnXPCOMWillShutdown", this);

  MOZ_ASSERT(NS_IsMainThread());

  mBlockingShutdownPhase = true;

  CleanShutdownAllProcesses();

  // Nothing to wait for; otherwise OnProcessShutdownComplete removes the
  // blocker once every host is done.
  if (mPendingShutdowns == 0) {
    RemoveShutdownBlocker();
  }
}

void UtilityProcessManager::OnXPCOMShutdown() {
  LOGD("[%p] UtilityProcessManager::OnXPCOMShutdown", this);

  MOZ_ASSERT(NS_IsMainThread());
  if (mObserver) {
    nsContentUtils::UnregisterShutdownObserver(mObserver);
  }

  // Normally a no-op, since our blocker already did this during
  // xpcom-will-shutdown. If we failed to register it, this is the last chance.
  CleanShutdownAllProcesses();
}

void UtilityProcessManager::OnProcessShutdownComplete() {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_DIAGNOSTIC_ASSERT(mPendingShutdowns > 0);

  --mPendingShutdowns;
  if (mPendingShutdowns > 0) {
    return;
  }

  // If we're already within shutdown, ensure our async shutdown blocker is gone
  // now that all processes have shut down.
  if (mBlockingShutdownPhase) {
    MOZ_ASSERT(NoMoreProcesses(),
               "How was a process launched during shutdown?");
    RemoveShutdownBlocker();
  }
}

void UtilityProcessManager::OnPreferenceChange(const char16_t* aData) {
  MOZ_ASSERT(NS_IsMainThread());
  if (NoMoreProcesses()) {
    // Process hasn't been launched yet
    return;
  }
  // We know prefs are ASCII here.
  NS_LossyConvertUTF16toASCII strData(aData);

  mozilla::dom::Pref pref(strData, /* isLocked */ false,
                          /* isSanitized */ false, Nothing(), Nothing());
  Preferences::GetPreference(&pref, GeckoProcessType_Utility,
                             /* remoteType */ {});

  for (auto& p : mProcesses) {
    if (!p) {
      continue;
    }

    if (p->mProcessParent) {
      (void)p->mProcessParent->SendPreferenceUpdate(pref);
    } else if (IsProcessLaunching(p->mSandbox)) {
      p->mQueuedPrefs.AppendElement(pref);
    }
  }
}

RefPtr<UtilityProcessManager::ProcessFields> UtilityProcessManager::GetProcess(
    SandboxingKind aSandbox) {
  if (!mProcesses[aSandbox]) {
    return nullptr;
  }

  return mProcesses[aSandbox];
}

void UtilityProcessManager::RegisterActor(
    const RefPtr<UtilityProcessParent>& aParent, UtilityActorName aActorName) {
  for (auto& p : mProcesses) {
    if (p && p->mProcessParent && p->mProcessParent == aParent) {
      MOZ_LOG(
          gChildProcessLifecycleLog, LogLevel::Info,
          ("UTILITYACTOR [childID = %" PRIi32 "] [actorName = %s]",
           p->mProcess->GetChildID(), dom::GetEnumString(aActorName).get()));
      p->mActors.AppendElement(aActorName);
      return;
    }
  }
}

RefPtr<UtilityProcessManager::SharedLaunchPromise<Ok>>
UtilityProcessManager::LaunchProcess(SandboxingKind aSandbox) {
  LOGD("[%p] UtilityProcessManager::LaunchProcess SandboxingKind=%" PRIu64,
       this, aSandbox);
  using RetPromise = SharedLaunchPromise<Ok>;

  MOZ_ASSERT(NS_IsMainThread());

  if (IsShutdown()) {
    NS_WARNING("Reject early LaunchProcess() for Shutdown");
    return RetPromise::CreateAndReject(
        LaunchError("UPM::LaunchProcess(): IsShutdown()"), __func__);
  }

  RefPtr<ProcessFields> p = GetProcess(aSandbox);
  if (p && p->mNumProcessAttempts) {
    // We failed to start the Utility process earlier, abort now.
    NS_WARNING("Reject LaunchProcess() for earlier mNumProcessAttempts");
    return RetPromise::CreateAndReject(
        LaunchError("UPM::LaunchProcess(): p->mNumProcessAttempts"), __func__);
  }

  if (p && p->mLaunchPromise && p->mProcess) {
    return p->mLaunchPromise;
  }

  if (!p) {
    p = new ProcessFields(aSandbox);
    mProcesses[aSandbox] = p;
  }

  geckoargs::ChildProcessArgs extraArgs;
  ProcessChild::AddPlatformBuildID(extraArgs);
  geckoargs::sSandboxingKind.Put(aSandbox, extraArgs);

  // The subprocess is launched asynchronously, so we
  // wait for the promise to be resolved to acquire the IPDL actor.
  p->mProcess = new UtilityProcessHost(aSandbox, this);
  if (!p->mProcess->Launch(std::move(extraArgs))) {
    p->mNumProcessAttempts++;
    DestroyProcess(aSandbox);
    NS_WARNING("Reject LaunchProcess() for mNumProcessAttempts++");
    return RetPromise::CreateAndReject(
        LaunchError("UPM::LaunchProcess(): mNumProcessAttempts++"), __func__);
  }

  RefPtr<UtilityProcessManager> self = this;
  p->mLaunchPromise = p->mProcess->LaunchPromise()->Then(
      GetMainThreadSerialEventTarget(), __func__,
      [self, p, aSandbox](Ok) -> RefPtr<RetPromise> {
        if (self->IsShutdown()) {
          NS_WARNING(
              "Reject LaunchProcess() after LaunchPromise() for Shutdown");
          return RetPromise::CreateAndReject(
              LaunchError("UPM::LaunchProcess(): post-await IsShutdown()"),
              __func__);
        }

        if (self->IsProcessDestroyed(aSandbox)) {
          NS_WARNING(
              "Reject LaunchProcess() after LaunchPromise() for destroyed "
              "process");
          return RetPromise::CreateAndReject(
              LaunchError(
                  "UPM::LaunchProcess(): post-await IsProcessDestroyed()"),
              __func__);
        }

        p->mProcessParent = p->mProcess->GetActor();

        // Flush any pref updates that happened during
        // launch and weren't included in the blobs set
        // up in LaunchUtilityProcess.
        for (const mozilla::dom::Pref& pref : p->mQueuedPrefs) {
          (void)NS_WARN_IF(!p->mProcessParent->SendPreferenceUpdate(pref));
        }
        p->mQueuedPrefs.Clear();
      #ifdef MOZ_CRASHREPORTER
        CrashReporter::RecordAnnotationCString(
            CrashReporter::Annotation::UtilityProcessStatus, "Running");
      #endif
        return RetPromise::CreateAndResolve(Ok{}, __func__);
      },
      [self, p, aSandbox](LaunchError error) {
        if (GetSingleton()) {
          p->mNumProcessAttempts++;
          self->DestroyProcess(aSandbox);
        }
        NS_WARNING("Reject LaunchProcess() for LaunchPromise() rejection");
        return RetPromise::CreateAndReject(std::move(error), __func__);
      });

  return p->mLaunchPromise;
}

already_AddRefed<UtilityProcessKeepAlive>
UtilityProcessManager::LaunchProcessWithKeepAlive(SandboxingKind aSandbox) {
  MOZ_ASSERT(NS_IsMainThread());

  // Nothing here needs the launch promise: it is reachable from the keep-alive.
  LaunchProcess(aSandbox);

  RefPtr<ProcessFields> p = GetProcess(aSandbox);
  if (!p) {
    LOGD("[%p] LaunchProcessWithKeepAlive SandboxingKind=%" PRIu64
         " - launch failed",
         this, aSandbox);
    return nullptr;
  }

  RefPtr<UtilityProcessKeepAlive> keepAlive = p->mKeepAlive;
  if (!keepAlive) {
    keepAlive = new UtilityProcessKeepAlive(p);
  }
  return keepAlive.forget();
}

template <typename Actor>
RefPtr<UtilityProcessManager::LaunchPromise<Ok>>
UtilityProcessManager::StartUtility(RefPtr<Actor> aActor,
                                    SandboxingKind aSandbox) {
  using RetPromise = LaunchPromise<Ok>;

  LOGD(
      "[%p] UtilityProcessManager::StartUtility actor=%p "
      "SandboxingKind=%" PRIu64,
      this, aActor.get(), aSandbox);

  if (!aActor) {
    MOZ_ASSERT(false, "Actor singleton failure");
    return RetPromise::CreateAndReject(
        LaunchError("UPM::StartUtility: aActor is null"), __func__);
  }

  if (aActor->CanSend()) {
    // Actor has already been setup, so we:
    //   - know the process has been launched
    //   - the ipc actors are ready
    PROFILER_MARKER_TEXT(
        "UtilityProcessManager::StartUtility", IPC,
        MarkerOptions(MarkerTiming::InstantNow()),
        nsPrintfCString("SandboxingKind=%" PRIu64 " aActor->CanSend()",
                        aSandbox));
    return RetPromise::CreateAndResolve(Ok{}, __func__);
  }

  RefPtr<SharedLaunchPromise<Ok>> launchPromise = LaunchProcess(aSandbox);
  RefPtr<ProcessFields> process = GetProcess(aSandbox);
  if (!process) {
    // LaunchProcess() failed outright and dropped the process.
    NS_WARNING("Reject StartUtility() for LaunchProcess() failure");
    return RetPromise::CreateAndReject(
        LaunchError("UPM::StartUtility: LaunchProcess()"), __func__);
  }

  return StartUtilityOnProcess(std::move(aActor), process, launchPromise);
}

template <typename Actor>
RefPtr<UtilityProcessManager::LaunchPromise<Ok>>
UtilityProcessManager::StartUtilityOnProcess(
    RefPtr<Actor> aActor, ProcessFields* aProcess,
    SharedLaunchPromise<Ok>* aLaunchPromise) {
  using RetPromise = LaunchPromise<Ok>;

  MOZ_ASSERT(NS_IsMainThread());

  TimeStamp utilityStart = TimeStamp::Now();
  SandboxingKind sandbox = aProcess->mSandbox;

  RefPtr<UtilityProcessManager> self = this;
  RefPtr<ProcessFields> process = aProcess;
  return aLaunchPromise->Then(
      GetMainThreadSerialEventTarget(), __func__,
      [self, aActor, sandbox, process, utilityStart]() -> RefPtr<RetPromise> {
        RefPtr<UtilityProcessParent> utilityParent = process->mProcessParent;
        if (!utilityParent) {
          NS_WARNING("Missing parent in StartUtility");
          return RetPromise::CreateAndReject(
              LaunchError("UPM::GetProcessParent"), __func__);
        }

        // It is possible if multiple processes concurrently request a utility
        // actor that the previous CanSend() check returned false for both but
        // that by the time we have started our process for real, one of them
        // has already been able to establish the IPC connection and thus we
        // would perform more than one Open() call.
        //
        // The tests within browser_utility_multipleAudio.js should be able to
        // catch that behavior.
        if (!aActor->CanSend()) {
          if (!utilityParent->CanSend()) {
            NS_WARNING("Utility process died before IPC could be established");
            return RetPromise::CreateAndReject(
                LaunchError("UPM::UtilityParent died"), __func__);
          }

          nsresult rv = aActor->BindToUtilityProcess(utilityParent);
          if (NS_FAILED(rv)) {
            LOGD("BindToUtilityProcess failed with rv=%x",
                 static_cast<uint32_t>(rv));
            MOZ_ASSERT(false, "Protocol endpoints failure");
            return RetPromise::CreateAndReject(
                LaunchError("BindToUtilityProcess", rv), __func__);
          }

          MOZ_DIAGNOSTIC_ASSERT(aActor->CanSend(), "IPC established for actor");
          self->RegisterActor(utilityParent, aActor->GetActorName());
        }

        PROFILER_MARKER_TEXT(
            "UtilityProcessManager::StartUtility", IPC,
            MarkerOptions(MarkerTiming::IntervalUntilNowFrom(utilityStart)),
            nsPrintfCString("SandboxingKind=%" PRIu64 " Resolve", sandbox));
        return RetPromise::CreateAndResolve(Ok{}, __func__);
      },
      [self, sandbox, utilityStart](LaunchError const& error) {
        NS_WARNING("Reject StartUtility() for LaunchProcess() rejection");
        if (!self->IsShutdown()) {
          NS_WARNING("Reject StartUtility() when !IsShutdown()");
        }
        PROFILER_MARKER_TEXT(
            "UtilityProcessManager::StartUtility", IPC,
            MarkerOptions(MarkerTiming::IntervalUntilNowFrom(utilityStart)),
            nsPrintfCString("SandboxingKind=%" PRIu64 " Reject", sandbox));
        return RetPromise::CreateAndReject(error, __func__);
      });
}

RefPtr<UtilityProcessManager::StartRemoteDecodingUtilityPromise>
UtilityProcessManager::StartProcessForRemoteMediaDecoding(
    EndpointProcInfo aOtherProcess, dom::ContentParentId aChildId,
    SandboxingKind aSandbox) {
  using RetPromise = StartRemoteDecodingUtilityPromise;

  // Not supported kinds.
  if (aSandbox != SandboxingKind::GENERIC_UTILITY
#ifdef MOZ_APPLEMEDIA
      && aSandbox != SandboxingKind::UTILITY_AUDIO_DECODING_APPLE_MEDIA
#endif
#ifdef XP_WIN
      && aSandbox != SandboxingKind::UTILITY_AUDIO_DECODING_WMF
#endif
#ifdef MOZ_WMF_MEDIA_ENGINE
      && aSandbox != SandboxingKind::MF_MEDIA_ENGINE_CDM
#endif
  ) {
    return RetPromise::CreateAndReject(
        LaunchError("Start...MediaDecoding: bad sandbox type"), __func__);
  }
  TimeStamp remoteDecodingStart = TimeStamp::Now();

  RefPtr<UtilityProcessManager> self = this;
  RefPtr<UtilityMediaServiceChild> umsc =
      UtilityMediaServiceChild::GetSingleton(aSandbox);
  MOZ_ASSERT(umsc, "Unable to get a singleton for UtilityMediaServiceChild");
  return StartUtility(umsc, aSandbox)
      ->Then(
          GetMainThreadSerialEventTarget(), __func__,
          [self, umsc, aOtherProcess, aChildId, aSandbox,
           remoteDecodingStart]() {
            RefPtr<UtilityProcessParent> parent =
                self->GetProcessParent(aSandbox);
            if (!parent) {
              NS_WARNING("UtilityMediaServiceParent lost in the middle");
              return RetPromise::CreateAndReject(
                  LaunchError("Start...MediaDecoding: parent lost"), __func__);
            }

            if (!umsc->CanSend()) {
              NS_WARNING("UtilityMediaServiceChild lost in the middle");
              return RetPromise::CreateAndReject(
                  LaunchError("Start...MediaDecoding: child lost"), __func__);
            }

            EndpointProcInfo process = parent->OtherEndpointProcInfo();

            Endpoint<PRemoteMediaManagerChild> childPipe;
            Endpoint<PRemoteMediaManagerParent> parentPipe;
            if (nsresult const rv = PRemoteMediaManager::CreateEndpoints(
                    process, aOtherProcess, &parentPipe, &childPipe);
                NS_FAILED(rv)) {
              MOZ_ASSERT(false, "Could not create content remote decoder");
              return RetPromise::CreateAndReject(
                  LaunchError("PRemoteMediaManager::CreateEndpoints", rv),
                  __func__);
            }

            if (!umsc->SendNewContentRemoteMediaManager(std::move(parentPipe),
                                                        aChildId)) {
              MOZ_ASSERT(false, "SendNewContentRemoteMediaManager failure");
              return RetPromise::CreateAndReject(
                  LaunchError("UMSC::SendNewCRDM"), __func__);
            }

#ifdef MOZ_WMF_MEDIA_ENGINE
            if (aSandbox == SandboxingKind::MF_MEDIA_ENGINE_CDM &&
                !umsc->CreateVideoBridge(process)) {
              MOZ_ASSERT(false, "Failed to create video bridge");
              return RetPromise::CreateAndReject(
                  LaunchError("UMSC::CreateVideoBridge"), __func__);
            }
#endif
            PROFILER_MARKER_TEXT(
                "UtilityProcessManager::StartProcessForRemoteMediaDecoding",
                MEDIA,
                MarkerOptions(
                    MarkerTiming::IntervalUntilNowFrom(remoteDecodingStart)),
                "Resolve"_ns);
            return RetPromise::CreateAndResolve(std::move(childPipe), __func__);
          },
          [self, remoteDecodingStart](LaunchError&& error) {
            NS_WARNING(
                "Reject StartProcessForRemoteMediaDecoding() for "
                "StartUtility() rejection");
            PROFILER_MARKER_TEXT(
                "UtilityProcessManager::StartProcessForRemoteMediaDecoding",
                MEDIA,
                MarkerOptions(
                    MarkerTiming::IntervalUntilNowFrom(remoteDecodingStart)),
                "Reject"_ns);
            return RetPromise::CreateAndReject(std::move(error), __func__);
          });
}

RefPtr<UtilityProcessManager::JSOraclePromise>
UtilityProcessManager::StartJSOracle(dom::JSOracleParent* aParent) {
  using RetPromise = JSOraclePromise;
  return StartUtility(RefPtr{aParent}, SandboxingKind::GENERIC_UTILITY)
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          []() { return RetPromise::CreateAndResolve(true, __func__); },
          [](LaunchError const&) {
            return RetPromise::CreateAndReject(NS_ERROR_NOT_AVAILABLE,
                                               __func__);
          });
}

#ifdef XP_WIN

// Windows Utils

RefPtr<UtilityProcessManager::WindowsUtilsPromise>
UtilityProcessManager::GetWindowsUtilsPromise() {
  TimeStamp windowsUtilsStart = TimeStamp::Now();
  RefPtr<UtilityProcessManager> self = this;
  if (!mWindowsUtils) {
    mWindowsUtils = new dom::WindowsUtilsParent();
  }

  RefPtr<dom::WindowsUtilsParent> wup = mWindowsUtils;
  MOZ_ASSERT(wup, "Unable to get a singleton for WindowsUtils");
  return StartUtility(wup, SandboxingKind::WINDOWS_UTILS)
      ->Then(
          GetMainThreadSerialEventTarget(), __func__,
          [self, wup, windowsUtilsStart]() {
            if (!wup->CanSend()) {
              MOZ_ASSERT(false, "WindowsUtilsParent can't send");
              return WindowsUtilsPromise::CreateAndReject(
                  LaunchError("GetWindowsUtilsPromise: !wup->CanSend()"),
                  __func__);
            }
            PROFILER_MARKER_TEXT(
                "UtilityProcessManager::GetWindowsUtilsPromise", OTHER,
                MarkerOptions(
                    MarkerTiming::IntervalUntilNowFrom(windowsUtilsStart)),
                "Resolve"_ns);
            return WindowsUtilsPromise::CreateAndResolve(wup, __func__);
          },
          [self, windowsUtilsStart](LaunchError&& error) {
            NS_WARNING("StartUtility rejected promise for PWindowsUtils");
            PROFILER_MARKER_TEXT(
                "UtilityProcessManager::GetWindowsUtilsPromise", OTHER,
                MarkerOptions(
                    MarkerTiming::IntervalUntilNowFrom(windowsUtilsStart)),
                "Reject"_ns);
            return WindowsUtilsPromise::CreateAndReject(std::move(error),
                                                        __func__);
          });
}

void UtilityProcessManager::ReleaseWindowsUtils() { mWindowsUtils = nullptr; }

RefPtr<UtilityProcessManager::WinFileDialogPromise>
UtilityProcessManager::CreateWinFileDialogActor() {
  using RetPromise = WinFileDialogPromise;
  TimeStamp startTime = TimeStamp::Now();
  auto wfdp = MakeRefPtr<widget::filedialog::WinFileDialogParent>();

  return StartUtility(wfdp, SandboxingKind::WINDOWS_FILE_DIALOG)
      ->Then(
          GetMainThreadSerialEventTarget(), __PRETTY_FUNCTION__,
          [wfdp, startTime]() mutable {
            LOGD("CreateWinFileDialogAsync() resolve: wfdp = [%p]", wfdp.get());
            if (!wfdp->CanSend()) {
              MOZ_ASSERT(false, "WinFileDialogParent can't send");
              return RetPromise::CreateAndReject(
                  LaunchError("CreateWinFileDialogActor: !wfdp->CanSend()"),
                  __PRETTY_FUNCTION__);
            }
            PROFILER_MARKER_TEXT(
                "UtilityProcessManager::CreateWinFileDialogAsync", OTHER,
                MarkerOptions(MarkerTiming::IntervalUntilNowFrom(startTime)),
                "Resolve"_ns);

            return RetPromise::CreateAndResolve(
                widget::filedialog::ProcessProxy(std::move(wfdp)),
                __PRETTY_FUNCTION__);
          },
          [self = RefPtr(this), startTime](LaunchError&& error) {
            LOGD("CreateWinFileDialogAsync() reject");
            if (!self->IsShutdown()) {
              MOZ_ASSERT_UNREACHABLE("failure when starting file-dialog actor");
            }
            PROFILER_MARKER_TEXT(
                "UtilityProcessManager::CreateWinFileDialogAsync", OTHER,
                MarkerOptions(MarkerTiming::IntervalUntilNowFrom(startTime)),
                "Reject"_ns);

            return RetPromise::CreateAndReject(std::move(error),
                                               __PRETTY_FUNCTION__);
          });
}

#endif  // XP_WIN

#if defined(NIGHTLY_BUILD) && !defined(MOZ_NO_SMART_CARDS)
RefPtr<UtilityProcessManager::PKCS11ModulePromise>
UtilityProcessManager::StartPKCS11Module() {
  using RetPromise = PKCS11ModulePromise;
  auto parent = MakeRefPtr<psm::PKCS11ModuleParent>();
  auto startPromise = StartUtility(parent, SandboxingKind::PKCS11_MODULE);
  return startPromise->Then(
      GetMainThreadSerialEventTarget(), __func__,
      [parent = std::move(parent)]() mutable {
        if (!parent->CanSend()) {
          MOZ_ASSERT(false, "PKCS11ModuleParent lost in the middle");
          return RetPromise::CreateAndReject(
              LaunchError("StartPKCS11Module: !parent->CanSend()"),
              __PRETTY_FUNCTION__);
        }
        return RetPromise::CreateAndResolve(std::move(parent), __func__);
      },
      [](LaunchError&& aError) {
        MOZ_ASSERT_UNREACHABLE(
            "StartPKCS11Module: failure when starting actor");
        return RetPromise::CreateAndReject(std::move(aError), __func__);
      });
}
#endif  // NIGHTLY_BUILD && !MOZ_NO_SMART_CARDS

#ifndef ANDROID
RefPtr<UtilityProcessManager::HWInferencePromise>
UtilityProcessManager::StartHWInference() {
  LOGD("[%p] StartHWInference called", this);
  RefPtr<UtilityProcessManager> self = this;
  using RetPromise = HWInferencePromise;
  RefPtr<hwinference::HWInferenceParent> hwip =
      hwinference::HWInferenceParent::GetSingleton();
  MOZ_ASSERT(hwip, "Unable to get a singleton for HWInference");
  LOGD("[%p] Starting HWInference utility process with HW_INFERENCE sandboxing",
       this);
  return StartUtility(hwip, SandboxingKind::HW_INFERENCE)
      ->Then(
          GetMainThreadSerialEventTarget(), __func__,
          [self, hwip]() {
            LOGD("StartHWInference: Utility process started successfully");
            if (!hwip->CanSend()) {
              MOZ_ASSERT(false, "HWInferenceParent lost in the middle");
              LOGD("StartHWInference: HWInferenceParent cannot send!");
              return RetPromise::CreateAndReject(
                  LaunchError("StartHWInference: !hwip->CanSend()"),
                  __PRETTY_FUNCTION__);
            }
            LOGD("StartHWInference: HWInferenceParent ready, CanSend=true");
            return RetPromise::CreateAndResolve(std::move(hwip), __func__);
          },
          [](LaunchError&& aError) {
            LOGD("StartHWInference: Failed to start utility process: %s",
                 aError.FunctionName().get());
            MOZ_ASSERT_UNREACHABLE("PHWInference: failure when starting actor");
            return RetPromise::CreateAndReject(std::move(aError), __func__);
          });
}
#endif  // !ANDROID

bool UtilityProcessManager::IsProcessLaunching(SandboxingKind aSandbox) {
  MOZ_ASSERT(NS_IsMainThread());

  RefPtr<ProcessFields> p = GetProcess(aSandbox);
  if (!p) {
    MOZ_CRASH("Cannot check process launching with no process");
    return false;
  }

  return p->mProcess && !(p->mProcessParent);
}

bool UtilityProcessManager::IsProcessDestroyed(SandboxingKind aSandbox) {
  MOZ_ASSERT(NS_IsMainThread());
  RefPtr<ProcessFields> p = GetProcess(aSandbox);
  if (!p) {
    return true;
  }
  return !p->mProcess && !p->mProcessParent;
}

void UtilityProcessManager::OnProcessUnexpectedShutdown(
    UtilityProcessHost* aHost) {
  MOZ_ASSERT(NS_IsMainThread());

  for (auto& it : mProcesses) {
    if (it && it->mProcess && it->mProcess == aHost) {
      it->mNumUnexpectedCrashes++;
#ifndef ANDROID
      if (it->mSandbox == SandboxingKind::HW_INFERENCE) {
        // https://bugzilla.mozilla.org/show_bug.cgi?id=2067834
        // mNumUnexpectedCrashes is reset between restarts. Remove
        // mHWInferenceRestarts once fixed.
        mHWInferenceRestarts++;
      }
#endif  // !ANDROID
      DestroyProcess(it->mSandbox);
      return;
    }
  }

  MOZ_CRASH(
      "Called UtilityProcessManager::OnProcessUnexpectedShutdown with invalid "
      "aHost");
}

void UtilityProcessManager::CleanShutdownAllProcesses() {
  LOGD("[%p] UtilityProcessManager::CleanShutdownAllProcesses", this);

  for (auto& it : mProcesses) {
    if (it) {
      DestroyProcess(it->mSandbox);
    }
  }
}

void UtilityProcessManager::CleanShutdown(SandboxingKind aSandbox) {
  LOGD("[%p] UtilityProcessManager::CleanShutdown SandboxingKind=%" PRIu64,
       this, aSandbox);

#ifndef ANDROID
  if (aSandbox == SandboxingKind::HW_INFERENCE) {
    // Shut down deliberately rather than crashing: the next launch starts with
    // a fresh restart budget.
    mHWInferenceRestarts = 0;
  }
#endif  // !ANDROID

  DestroyProcess(aSandbox);
}

uint16_t UtilityProcessManager::AliveProcesses() {
  uint16_t alive = 0;
  for (auto& p : mProcesses) {
    if (p != nullptr) {
      alive++;
    }
  }
  return alive;
}

bool UtilityProcessManager::NoMoreProcesses() { return AliveProcesses() == 0; }

void UtilityProcessManager::DestroyProcess(SandboxingKind aSandbox) {
  LOGD("[%p] UtilityProcessManager::DestroyProcess SandboxingKind=%" PRIu64,
       this, aSandbox);

  MOZ_RELEASE_ASSERT(NS_IsMainThread());

  if (AliveProcesses() <= 1) {
    if (mObserver) {
      Preferences::RemoveObserver(mObserver, "");
    }

    mObserver = nullptr;
  }

  RefPtr<ProcessFields> p = GetProcess(aSandbox);
  if (!p) {
    return;
  }

  p->mQueuedPrefs.Clear();
  p->mProcessParent = nullptr;

  if (p->mProcess) {
    ++mPendingShutdowns;
    p->mProcess->Shutdown()->Then(
        GetMainThreadSerialEventTarget(), __func__,
        [self = RefPtr{this}](const UtilityProcessHost::ShutdownPromiseType::
                                  ResolveOrRejectValue&) {
          self->OnProcessShutdownComplete();
        });
    p->mProcess = nullptr;
  }

  mProcesses[aSandbox] = nullptr;
#ifdef MOZ_CRASHREPORTER
  CrashReporter::RecordAnnotationCString(
      CrashReporter::Annotation::UtilityProcessStatus, "Destroyed");
#endif
  if (NoMoreProcesses()) {
    sSingleton = nullptr;
  }
}

Maybe<base::ProcessId> UtilityProcessManager::ProcessPid(
    SandboxingKind aSandbox) {
  MOZ_ASSERT(NS_IsMainThread());
  RefPtr<ProcessFields> p = GetProcess(aSandbox);
  if (!p) {
    return Nothing();
  }
  if (p->mProcessParent) {
    return Some(p->mProcessParent->OtherPid());
  }
  return Nothing();
}

class UtilityMemoryReporter : public MemoryReportingProcess {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(UtilityMemoryReporter, override)

  explicit UtilityMemoryReporter(UtilityProcessParent* aParent) {
    mParent = aParent;
  }

  bool IsAlive() const override { return bool(GetParent()); }

  bool SendRequestMemoryReport(
      const uint32_t& aGeneration, const bool& aAnonymize,
      const bool& aMinimizeMemoryUsage,
      const Maybe<ipc::FileDescriptor>& aDMDFile) override {
    RefPtr<UtilityProcessParent> parent = GetParent();
    if (!parent) {
      return false;
    }

    return parent->SendRequestMemoryReport(aGeneration, aAnonymize,
                                           aMinimizeMemoryUsage, aDMDFile);
  }

  int32_t Pid() const override {
    if (RefPtr<UtilityProcessParent> parent = GetParent()) {
      return (int32_t)parent->OtherPid();
    }
    return 0;
  }

 private:
  RefPtr<UtilityProcessParent> GetParent() const { return mParent; }

  RefPtr<UtilityProcessParent> mParent = nullptr;

 protected:
  ~UtilityMemoryReporter() = default;
};

RefPtr<MemoryReportingProcess> UtilityProcessManager::GetProcessMemoryReporter(
    UtilityProcessParent* parent) {
  return new UtilityMemoryReporter(parent);
}

#ifndef ANDROID
already_AddRefed<UtilityProcessKeepAlive>
UtilityProcessManager::AcquireContentHWInferenceProcess() {
  MOZ_ASSERT(NS_IsMainThread());

  // Only a relaunch is refused: a spent budget must not take a working process
  // away from its consumers.
  if (!GetProcess(SandboxingKind::HW_INFERENCE) &&
      mHWInferenceRestarts >=
          StaticPrefs::browser_ml_hwinference_max_restarts()) {
    return nullptr;
  }

  RefPtr<UtilityProcessKeepAlive> keepAlive =
      LaunchProcessWithKeepAlive(SandboxingKind::HW_INFERENCE);
  if (keepAlive) {
    // A no-op once bound, and what re-binds if the PHWInference channel went
    // away without the process going with it.
    keepAlive->StartUtility(hwinference::HWInferenceParent::GetSingleton());
  }
  return keepAlive.forget();
}
#endif  // !ANDROID

UtilityProcessKeepAlive::UtilityProcessKeepAlive(
    UtilityProcessManager::ProcessFields* aProcess)
    : mProcess(aProcess) {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(!mProcess->mKeepAlive);
  mProcess->mKeepAlive = this;
}

UtilityProcessKeepAlive::~UtilityProcessKeepAlive() {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(mProcess->mKeepAlive == this);
  mProcess->mKeepAlive = nullptr;

  // Only shut down if this process is still the live one: it may have crashed
  // and been relaunched, and that replacement is not ours to kill.
  RefPtr<UtilityProcessManager> upm = UtilityProcessManager::GetIfExists();
  if (!upm || upm->GetProcess(mProcess->mSandbox) != mProcess) {
    LOGD("[%p] ~UtilityProcessKeepAlive - process already gone", this);
    return;
  }

  LOGD("[%p] ~UtilityProcessKeepAlive - last consumer gone, shutting down",
       this);
  upm->CleanShutdown(mProcess->mSandbox);
}

RefPtr<UtilityProcessManager::SharedLaunchPromise<Ok>>
UtilityProcessKeepAlive::GetLaunchPromise() const {
  MOZ_ASSERT(NS_IsMainThread());
  return mProcess->mLaunchPromise;
}

template <typename Actor>
RefPtr<UtilityProcessManager::LaunchPromise<Ok>>
UtilityProcessKeepAlive::StartUtility(RefPtr<Actor> aActor) {
  MOZ_ASSERT(NS_IsMainThread());

  RefPtr<UtilityProcessManager> upm = UtilityProcessManager::GetIfExists();
  if (!upm) {
    return UtilityProcessManager::LaunchPromise<Ok>::CreateAndReject(
        LaunchError("UPKA::StartUtility(): no UtilityProcessManager"),
        __func__);
  }

  return upm->StartUtilityOnProcess(std::move(aActor), mProcess,
                                    mProcess->mLaunchPromise);
}

}  // namespace mozilla::ipc
