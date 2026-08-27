/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "TextRecognition.h"

#include "imgIContainer.h"
#include "mozilla/dom/ContentChild.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/dom/ShadowRoot.h"
#include "nsTextNode.h"

using namespace mozilla::dom;

namespace mozilla::widget {

auto TextRecognition::FindText(imgIContainer& aImage,
                               const nsTArray<nsCString>& aLanguages)
    -> RefPtr<NativePromise> {
  // TODO: Maybe decode async.
  RefPtr<gfx::SourceSurface> surface = aImage.GetFrame(
      imgIContainer::FRAME_CURRENT,
      imgIContainer::FLAG_SYNC_DECODE | imgIContainer::FLAG_ASYNC_NOTIFY);
  if (NS_WARN_IF(!surface)) {
    return NativePromise::CreateAndReject("Failed to get surface"_ns, __func__);
  }
  RefPtr<gfx::DataSourceSurface> dataSurface = surface->GetDataSurface();
  if (NS_WARN_IF(!dataSurface)) {
    return NativePromise::CreateAndReject("Failed to get data surface"_ns,
                                          __func__);
  }
  return FindText(*dataSurface, aLanguages);
}

auto TextRecognition::FindText(gfx::DataSourceSurface& aSurface,
                               const nsTArray<nsCString>& aLanguages)
    -> RefPtr<NativePromise> {
  if (!IsSupported()) {
    return NativePromise::CreateAndReject("Text recognition not available"_ns,
                                          __func__);
  }

  if (XRE_IsContentProcess()) {
    auto* contentChild = ContentChild::GetSingleton();
    auto image = nsContentUtils::SurfaceToIPCImage(aSurface);
    if (!image) {
      return NativePromise::CreateAndReject("Failed to share data surface"_ns,
                                            __func__);
    }
    auto promise = MakeRefPtr<NativePromise::Private>(__func__);
    contentChild->SendFindImageText(std::move(*image), aLanguages)
        ->Then(
            GetCurrentSerialEventTarget(), __func__,
            [promise](TextRecognitionResultOrError&& aResultOrError) {
              switch (aResultOrError.type()) {
                case TextRecognitionResultOrError::Type::TTextRecognitionResult:
                  promise->Resolve(
                      std::move(aResultOrError.get_TextRecognitionResult()),
                      __func__);
                  break;
                case TextRecognitionResultOrError::Type::TnsCString:
                  promise->Reject(std::move(aResultOrError.get_nsCString()),
                                  __func__);
                  break;
                default:
                  MOZ_ASSERT_UNREACHABLE("Unknown result?");
                  promise->Reject("Unknown error"_ns, __func__);
                  break;
              }
            },
            [promise](mozilla::ipc::ResponseRejectReason) {
              promise->Reject("IPC rejection"_ns, __func__);
            });
    return promise;
  }
  return DoFindText(aSurface, aLanguages);
}

#ifndef XP_MACOSX
auto TextRecognition::DoFindText(gfx::DataSourceSurface&,
                                 const nsTArray<nsCString>&)
    -> RefPtr<NativePromise> {
  MOZ_CRASH("DoFindText is not implemented on this platform");
}
#endif

bool TextRecognition::IsSupported() {
#ifdef XP_MACOSX
  return true;
#else
  return false;
#endif
}

}  // namespace mozilla::widget
