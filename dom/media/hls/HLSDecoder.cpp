/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "HLSDecoder.h"

#include "AndroidBridge.h"
#include "DecoderTraits.h"
#include "GeckoViewStreamListener.h"
#include "HLSDemuxer.h"
#include "HLSUtils.h"
#include "JavaBuiltins.h"
#include "JavaExceptions.h"
#include "MediaContainerType.h"
#include "MediaDecoderStateMachine.h"
#include "MediaFormatReader.h"
#include "MediaShutdownManager.h"
#include "base/process_util.h"
#include "mozilla/BasePrincipal.h"
#include "mozilla/ErrorNames.h"
#include "mozilla/NullPrincipal.h"
#include "mozilla/StaticPrefs_media.h"
#include "mozilla/SyncRunnable.h"
#include "mozilla/dom/HTMLMediaElement.h"
#include "mozilla/glean/DomMediaHlsMetrics.h"
#include "mozilla/java/GeckoAppShellWrappers.h"
#include "mozilla/java/GeckoHLSResourceWrapperNatives.h"
#include "mozilla/java/GeckoResultWrappers.h"
#include "mozilla/java/WebMessageWrappers.h"
#include "mozilla/java/WebRequestWrappers.h"
#include "mozilla/widget/WebExecutorSupport.h"
#include "nsContentUtils.h"
#include "nsIChannel.h"
#include "nsIHttpChannel.h"
#include "nsILoadInfo.h"
#include "nsMimeTypes.h"
#include "nsNetUtil.h"
#include "nsThreadUtils.h"

namespace mozilla {

class HLSResourceCallbacksSupport
    : public java::GeckoHLSResourceWrapper::Callbacks::Natives<
          HLSResourceCallbacksSupport> {
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(HLSResourceCallbacksSupport)
 public:
  typedef java::GeckoHLSResourceWrapper::Callbacks::Natives<
      HLSResourceCallbacksSupport>
      NativeCallbacks;
  using NativeCallbacks::AttachNative;
  using NativeCallbacks::DisposeNative;

  explicit HLSResourceCallbacksSupport(HLSDecoder* aResource);
  void Detach();
  void OnDataArrived();
  void OnError(int aErrorCode);
  // Called by ExoPlayer on its loader thread to fetch HLS resource specified
  // with a WebRequest. Returns a GeckoResult<WebResponse> that will be resolved
  // on the Gecko main thread.
  jni::Object::LocalRef OnOpenChannel(jni::Object::Param aRequest);

 private:
  ~HLSResourceCallbacksSupport() {}
  void DoOpenChannel(java::WebRequest::Param aRequest,
                     java::GeckoResult::Param aResult);
  // Called on the main thread when a Necko channel response header arrives.
  // Records media usage telemetry and updates the content principal for
  // non-manifest responses.
  void NotifyChannelResponse(nsIChannel* aChannel);

  Mutex mMutex MOZ_UNANNOTATED;
  HLSDecoder* mDecoder;
};

// Listener to bridges a Necko HTTP channel response back to the
// GeckoResult<WebResponse> returned by OnOpenChannel(). Also hooks into the
// response to update decoder state via an caller-supplied callback.
class GeckoHttpChannelListener final : public GeckoViewStreamListener {
 public:
  NS_INLINE_DECL_REFCOUNTING_INHERITED(GeckoHttpChannelListener,
                                       GeckoViewStreamListener)

  GeckoHttpChannelListener(java::GeckoResult::Param aResult,
                           std::function<void(nsIChannel*)> aOnResponse)
      : mResult(aResult), mOnResponse(std::move(aOnResponse)) {
    MOZ_ASSERT(NS_IsMainThread());
    MOZ_ASSERT(mResult);
  }

 protected:
  // Overridden to intercept response headers before the body stream is handed
  // to the Java side, giving mOnResponse a chance to inspect the channel while
  // Necko state (content type, result principal) is still accessible.
  nsresult HandleWebResponse(nsIRequest* aRequest) override {
    MOZ_ASSERT(NS_IsMainThread());
    nsCOMPtr<nsIHttpChannel> httpChannel = do_QueryInterface(aRequest);
    if (httpChannel) {
      uint32_t statusCode = 0;
      if (NS_SUCCEEDED(httpChannel->GetResponseStatus(&statusCode)) &&
          statusCode >= 200 && statusCode < 300) {
        // Only notify on success: an error response body has a meaningless
        // MIME type (e.g. text/html for a 404), which would corrupt the
        // one-shot media-usage telemetry and the content principal.
        mOnResponse(httpChannel);
      }
    }
    return GeckoViewStreamListener::HandleWebResponse(aRequest);
  }

  void SendWebResponse(java::WebResponse::Param aResponse) override {
    MOZ_ASSERT(mResult);
    HLS_DEBUG("GeckoHttpChannelListener", "Status code={}",
              aResponse->StatusCode());
    mResult->Complete(aResponse);
    mResult = nullptr;
  }

  void CompleteWithError(nsresult aStatus, nsIChannel* aChannel) override {
    MOZ_ASSERT(mResult);
    HLS_DEBUG("GeckoHttpChannelListener", "error={}", aStatus);
    widget::WebExecutorSupport::CompleteWithError(mResult, aStatus, aChannel);
    mResult = nullptr;
  }

 private:
  ~GeckoHttpChannelListener() = default;

  java::GeckoResult::GlobalRef mResult;
  std::function<void(nsIChannel*)> mOnResponse;
};

HLSResourceCallbacksSupport::HLSResourceCallbacksSupport(HLSDecoder* aDecoder)
    : mMutex("HLSResourceCallbacksSupport"), mDecoder(aDecoder) {
  MOZ_ASSERT(mDecoder);
}

void HLSResourceCallbacksSupport::Detach() {
  MOZ_ASSERT(NS_IsMainThread());
  MutexAutoLock lock(mMutex);
  mDecoder = nullptr;
}

void HLSResourceCallbacksSupport::NotifyChannelResponse(nsIChannel* aChannel) {
  MOZ_ASSERT(NS_IsMainThread());
  if (!mDecoder) {
    return;
  }
  nsAutoCString contentType;
  aChannel->GetContentType(contentType);
  // Skip HLS manifest responses; only process media segment responses.
  if (contentType.EqualsLiteral(APPLICATION_MPEGURL) ||
      contentType.EqualsLiteral(AUDIO_MPEG_URL) ||
      contentType.EqualsLiteral("application/x-mpegurl")) {
    return;
  }
  mDecoder->RecordMediaUsage(contentType);
  nsIScriptSecurityManager* secMan = nsContentUtils::GetSecurityManager();
  if (secMan) {
    nsCOMPtr<nsIPrincipal> principal;
    if (NS_SUCCEEDED(secMan->GetChannelResultPrincipal(
            aChannel, getter_AddRefs(principal))) &&
        principal) {
      mDecoder->UpdateCurrentPrincipal(principal);
    }
  }
}

void HLSResourceCallbacksSupport::OnDataArrived() {
  HLS_DEBUG("HLSResourceCallbacksSupport", "OnDataArrived.");
  MutexAutoLock lock(mMutex);
  if (!mDecoder) {
    return;
  }
  RefPtr<HLSResourceCallbacksSupport> self = this;
  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "HLSResourceCallbacksSupport::OnDataArrived", [self]() -> void {
        if (self->mDecoder) {
          self->mDecoder->NotifyDataArrived();
        }
      }));
}

void HLSResourceCallbacksSupport::OnError(int aErrorCode) {
  HLS_DEBUG("HLSResourceCallbacksSupport", "onError({})", aErrorCode);
  MutexAutoLock lock(mMutex);
  if (!mDecoder) {
    return;
  }
  RefPtr<HLSResourceCallbacksSupport> self = this;
  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "HLSResourceCallbacksSupport::OnError", [self]() -> void {
        if (self->mDecoder) {
          // Since HLS source should be from the Internet, we treat all resource
          // errors from GeckoHlsPlayer as network errors.
          self->mDecoder->NetworkError(
              MediaResult(NS_ERROR_FAILURE, "HLS error"));
        }
      }));
}

jni::Object::LocalRef HLSResourceCallbacksSupport::OnOpenChannel(
    jni::Object::Param aRequest) {
  MOZ_ASSERT(!NS_IsMainThread());

  MutexAutoLock lock(mMutex);
  if (!mDecoder) {
    HLS_DEBUG("HLSResourceCallbacksSupport", "FAIL: already detached");
    return nullptr;
  }

  auto result = java::GeckoResult::New();
  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "HLSResourceCallbacksSupport::OnOpenChannel",
      [self = RefPtr{this},
       request =
           java::WebRequest::GlobalRef{java::WebRequest::Ref::From(aRequest)},
       result = java::GeckoResult::GlobalRef{result}]() {
        self->DoOpenChannel(request, result);
      }));

  return jni::ToLocalRef(result);
}

void HLSResourceCallbacksSupport::DoOpenChannel(
    java::WebRequest::Param aRequest, java::GeckoResult::Param aResult) {
  MOZ_ASSERT(NS_IsMainThread());

  if (!mDecoder) {
    HLS_DEBUG("HLSResourceCallbacksSupport", "FAIL: already detached");
    aResult->CompleteExceptionally(java::sdk::IllegalStateException::New(
                                       jni::StringParam("already detached"_ns))
                                       .Cast<jni::Throwable>());
    return;
  }
  RefPtr<dom::HTMLMediaElement> element =
      mDecoder->GetOwner()->GetMediaElement();
  if (!element) {
    HLS_DEBUG("HLSResourceCallbacksSupport", "FAIL: no media element");
    aResult->CompleteExceptionally(java::sdk::IllegalStateException::New(
                                       jni::StringParam("no media element"_ns))
                                       .Cast<jni::Throwable>());
    return;
  }

  const auto requestBase =
      java::WebMessage::LocalRef(aRequest.Cast<java::WebMessage>());
  const nsCString uriStr = requestBase->Uri()->ToCString();

  HLS_DEBUG("HLSResourceCallbacksSupport", "URI={}", uriStr.get());
  nsCOMPtr<nsIURI> uri;
  nsresult rv = NS_NewURI(getter_AddRefs(uri), uriStr);
  if (NS_FAILED(rv)) {
    HLS_DEBUG("HLSResourceCallbacksSupport",
              "FAIL: cannot create URI, error={}", rv);
    widget::WebExecutorSupport::CompleteWithError(aResult, rv);
    return;
  }

  nsCOMPtr<nsIChannel> newChannel;
  nsCOMPtr<nsIPrincipal> triggeringPrincipal;
  nsContentUtils::QueryTriggeringPrincipal(element,
                                           getter_AddRefs(triggeringPrincipal));
  nsSecurityFlags secFlags =
      element->ShouldCheckAllowOrigin()
          ? nsILoadInfo::SEC_REQUIRE_CORS_INHERITS_SEC_CONTEXT
          : nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_INHERITS_SEC_CONTEXT;
  if (element->GetCORSMode() == CORS_USE_CREDENTIALS) {
    secFlags |= nsILoadInfo::SEC_COOKIES_INCLUDE;
  }
  const auto contentType = element->IsHTMLElement(nsGkAtoms::audio)
                               ? nsIContentPolicy::TYPE_INTERNAL_AUDIO
                               : nsIContentPolicy::TYPE_INTERNAL_VIDEO;
  rv = NS_NewChannelWithTriggeringPrincipal(getter_AddRefs(newChannel), uri,
                                            element, triggeringPrincipal,
                                            secFlags, contentType);
  if (NS_FAILED(rv)) {
    HLS_DEBUG("HLSResourceCallbacksSupport",
              "FAIL: cannot create channel, error={}", rv);
    widget::WebExecutorSupport::CompleteWithError(aResult, rv);
    return;
  }

  nsCOMPtr<nsILoadInfo> loadInfo = newChannel->LoadInfo();
  loadInfo->SetIsMediaRequest(true);

  nsCOMPtr<nsIHttpChannel> httpChannel = do_QueryInterface(newChannel);
  if (httpChannel) {
    const auto keys = requestBase->GetHeaderKeys();
    const auto values = requestBase->GetHeaderValues();
    for (size_t i = 0; i < keys->Length(); i++) {
      nsAutoCString name{
          jni::String::LocalRef(keys->GetElement(i))->ToCString()};
      nsAutoCString value{
          jni::String::LocalRef(values->GetElement(i))->ToCString()};
      rv = httpChannel->SetRequestHeader(name, value, false);
      if (NS_FAILED(rv)) {
        HLS_DEBUG("HLSResourceCallbacksSupport",
                  "WARN: cannot set header '{}: {}', error={}", name.get(),
                  value.get(), rv);
      }
    }
  }

  auto listener = MakeRefPtr<GeckoHttpChannelListener>(
      aResult, [self = RefPtr{this}](nsIChannel* aChannel) {
        self->NotifyChannelResponse(aChannel);
      });
  newChannel->SetNotificationCallbacks(listener);
  rv = newChannel->AsyncOpen(listener);
  if (NS_FAILED(rv)) {
    HLS_DEBUG("HLSResourceCallbacksSupport", "FAIL: cannot open, error={}", rv);
    widget::WebExecutorSupport::CompleteWithError(aResult, rv, newChannel);
  }
}

size_t HLSDecoder::sAllocatedInstances = 0;

// static
RefPtr<HLSDecoder> HLSDecoder::Create(MediaDecoderInit& aInit) {
  MOZ_ASSERT(NS_IsMainThread());

  return sAllocatedInstances < StaticPrefs::media_hls_max_allocations()
             ? new HLSDecoder(aInit)
             : nullptr;
}

HLSDecoder::HLSDecoder(MediaDecoderInit& aInit) : MediaDecoder(aInit) {
  MOZ_ASSERT(NS_IsMainThread());
  sAllocatedInstances++;
  HLS_DEBUG("HLSDecoder", "HLSDecoder(): allocated={}", sAllocatedInstances);
}

HLSDecoder::~HLSDecoder() {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(sAllocatedInstances > 0);
  sAllocatedInstances--;
  HLS_DEBUG("HLSDecoder", "~HLSDecoder(): allocated={}", sAllocatedInstances);
}

already_AddRefed<MediaDecoderStateMachineBase> HLSDecoder::CreateStateMachine(
    bool aDisableExternalEngine) {
  MOZ_ASSERT(NS_IsMainThread());

  MediaFormatReaderInit init;
  init.mVideoFrameContainer = GetVideoFrameContainer();
  init.mKnowsCompositor = GetCompositor();
  init.mCrashHelper = GetOwner()->CreateGMPCrashHelper();
  init.mFrameStats = mFrameStats;
  init.mMediaDecoderOwnerID = mOwner;
  static Atomic<uint32_t> sTrackingIdCounter(0);
  init.mTrackingId =
      Some(TrackingId(TrackingId::Source::HLSDecoder, sTrackingIdCounter++,
                      TrackingId::TrackAcrossProcesses::Yes));
  mReader = new MediaFormatReader(
      init, new HLSDemuxer(mHLSResourceWrapper->GetPlayerId()));

  return MakeAndAddRef<MediaDecoderStateMachine>(this, mReader);
}

bool HLSDecoder::IsEnabled() {
  return StaticPrefs::media_hls_enabled() &&
         !java::GeckoAppShell::IsIsolatedProcess();
}

bool HLSDecoder::IsSupportedType(const MediaContainerType& aContainerType) {
  return IsEnabled() && DecoderTraits::IsHttpLiveStreamingType(aContainerType);
}

nsresult HLSDecoder::Load(nsIChannel* aChannel) {
  MOZ_ASSERT(NS_IsMainThread());

  nsresult rv = NS_GetFinalChannelURI(aChannel, getter_AddRefs(mURI));
  if (NS_WARN_IF(NS_FAILED(rv))) {
    return rv;
  }

  mChannel = aChannel;
  nsCString spec;
  (void)mURI->GetSpec(spec);
  mUsageRecorded = false;

  HLSResourceCallbacksSupport::Init();

  mJavaCallbacks = java::GeckoHLSResourceWrapper::Callbacks::New();
  mCallbackSupport = new HLSResourceCallbacksSupport(this);
  HLSResourceCallbacksSupport::AttachNative(mJavaCallbacks, mCallbackSupport);
  mHLSResourceWrapper = java::GeckoHLSResourceWrapper::Create(
      NS_ConvertUTF8toUTF16(spec), mJavaCallbacks);
  MOZ_ASSERT(mHLSResourceWrapper);

  rv = MediaShutdownManager::Instance().Register(this);
  if (NS_WARN_IF(NS_FAILED(rv))) {
    return rv;
  }
  return CreateAndInitStateMachine(false);
}

void HLSDecoder::AddSizeOfResources(ResourceSizes* aSizes) {
  MOZ_ASSERT(NS_IsMainThread());
  // TODO: track JAVA wrappers.
}

already_AddRefed<nsIPrincipal> HLSDecoder::GetCurrentPrincipal() {
  MOZ_ASSERT(NS_IsMainThread());
  return do_AddRef(mContentPrincipal);
}

bool HLSDecoder::HadCrossOriginRedirects() {
  MOZ_ASSERT(NS_IsMainThread());
  // Bug 1478843
  return false;
}

void HLSDecoder::Play() {
  MOZ_ASSERT(NS_IsMainThread());
  HLS_DEBUG("HLSDecoder", "MediaElement called Play");
  mHLSResourceWrapper->Play();
  return MediaDecoder::Play();
}

void HLSDecoder::Pause() {
  MOZ_ASSERT(NS_IsMainThread());
  HLS_DEBUG("HLSDecoder", "MediaElement called Pause");
  mHLSResourceWrapper->Pause();
  return MediaDecoder::Pause();
}

void HLSDecoder::Suspend() {
  MOZ_ASSERT(NS_IsMainThread());
  HLS_DEBUG("HLSDecoder", "Should suspend the resource fetching.");
  mHLSResourceWrapper->Suspend();
}

void HLSDecoder::Resume() {
  MOZ_ASSERT(NS_IsMainThread());
  HLS_DEBUG("HLSDecoder", "Should resume the resource fetching.");
  mHLSResourceWrapper->Resume();
}

void HLSDecoder::Shutdown() {
  HLS_DEBUG("HLSDecoder", "Shutdown");
  if (mCallbackSupport) {
    mCallbackSupport->Detach();
  }
  if (mHLSResourceWrapper) {
    mHLSResourceWrapper->Destroy();
    mHLSResourceWrapper = nullptr;
  }
  if (mJavaCallbacks) {
    HLSResourceCallbacksSupport::DisposeNative(mJavaCallbacks);
    mJavaCallbacks = nullptr;
  }
  MediaDecoder::Shutdown();
}

void HLSDecoder::NotifyDataArrived() {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_DIAGNOSTIC_ASSERT(!IsShutdown());
  NotifyReaderDataArrived();
  GetOwner()->DownloadProgressed();
}

void HLSDecoder::RecordMediaUsage(const nsCString& aMimeType) {
  if (mUsageRecorded) {
    return;
  }
  // TODO: get hostname. See bug 1887053.
  glean::hls::MediaLoadExtra extra = {.mediaContentType =
                                          Some(aMimeType.get())};
  glean::hls::media_load.Record(Some(extra));
  mUsageRecorded = true;
}

// Should be called when the decoder loads media to ensure the principal of the
// media element is appropriately set for CORS.
void HLSDecoder::UpdateCurrentPrincipal(nsIPrincipal* aPrincipal) {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_DIAGNOSTIC_ASSERT(aPrincipal);

  // Check the subsumption of old and new principals. Should be either
  // equal or disjoint.
  if (!mContentPrincipal || aPrincipal->GetIsNullPrincipal()) {
    mContentPrincipal = aPrincipal;
  } else if (aPrincipal->Equals(mContentPrincipal)) {
    return;
  } else if (!aPrincipal->Subsumes(mContentPrincipal) &&
             !mContentPrincipal->Subsumes(aPrincipal)) {
    // Principals are disjoint -- no access.
    mContentPrincipal = NullPrincipal::Create(OriginAttributes());
  } else {
    MOZ_DIAGNOSTIC_CRASH("non-equal principals should be disjoint");
    mContentPrincipal = nullptr;
  }
  MediaDecoder::NotifyPrincipalChanged();
}

}  // namespace mozilla
