/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "jsapi/RTCEncodedFrameBase.h"

#include "api/frame_transformer_interface.h"
#include "js/ArrayBuffer.h"
#include "js/GCAPI.h"
#include "mozilla/dom/ScriptSettings.h"
#include "nsIGlobalObject.h"

namespace mozilla::dom {
NS_IMPL_CYCLE_COLLECTION_WITH_JS_MEMBERS(RTCEncodedFrameBase, (mGlobal),
                                         (mData))
NS_IMPL_CYCLE_COLLECTING_ADDREF(RTCEncodedFrameBase)
NS_IMPL_CYCLE_COLLECTING_RELEASE(RTCEncodedFrameBase)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(RTCEncodedFrameBase)
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

RTCEncodedFrameBase::RTCEncodedFrameBase(nsIGlobalObject* aGlobal,
                                         RTCEncodedFrameState& aState)
    : mGlobal(aGlobal), mState(aState), mData(nullptr) {
  mState.mTimestamp = mState.mFrame->GetTimestamp();
  AutoJSAPI jsapi;
  if (NS_WARN_IF(!jsapi.Init(mGlobal))) {
    return;
  }

  // Avoid a copy
  mData = JS::NewArrayBufferWithUserOwnedContents(
      jsapi.cx(), mState.mFrame->GetData().size(),
      (void*)(mState.mFrame->GetData().data()));
}

RTCEncodedFrameBase::~RTCEncodedFrameBase() = default;

unsigned long RTCEncodedFrameBase::Timestamp() const {
  return mState.mTimestamp;
}

void RTCEncodedFrameBase::SetData(const ArrayBuffer& aData) {
  mData.set(aData.Obj());
  if (mState.mFrame) {
    aData.ProcessData([&](const Span<uint8_t>& aData, JS::AutoCheckCannotGC&&) {
      mState.mFrame->SetData(
          webrtc::ArrayView<const uint8_t>(aData.Elements(), aData.Length()));
    });
  }
}

void RTCEncodedFrameBase::GetData(JSContext* aCx,
                                  JS::Rooted<JSObject*>* aObj) const {
  aObj->set(mData);
}

uint64_t RTCEncodedFrameBase::GetCounter() const { return mState.mCounter; }

std::unique_ptr<webrtc::TransformableFrameInterface>
RTCEncodedFrameBase::TakeFrame() {
  if (mState.mFrame) {
    AutoJSAPI jsapi;
    if (!jsapi.Init(mGlobal)) {
      MOZ_CRASH("Could not init JSAPI!");
    }
    // If the JS buffer was transferred (or otherwise detached), neuter native.
    JS::Rooted<JSObject*> rootedData(jsapi.cx(), mData);
    if (rootedData && JS::IsDetachedArrayBufferObject(rootedData)) {
      mState.mFrame.reset();
      return nullptr;
    }
    // Still attached: detach now since we're consuming the frame.
    JS::DetachArrayBuffer(jsapi.cx(), rootedData);
  }
  return std::move(mState.mFrame);
}

RTCEncodedFrameState::~RTCEncodedFrameState() = default;

}  // namespace mozilla::dom
