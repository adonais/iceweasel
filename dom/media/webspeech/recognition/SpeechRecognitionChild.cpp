/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8  et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SpeechRecognitionChild.h"

#include "SpeechRecognitionBackend.h"
#include "mozilla/Logging.h"
#include "mozilla/MozPromise.h"
#include "mozilla/ipc/ProtocolUtils.h"
#include "nsDebug.h"

static mozilla::LazyLogModule gSpeechRecognitionChildLog(
    "SpeechRecognitionChild");
#define LOG(level, ...) \
  MOZ_LOG_FMT(gSpeechRecognitionChildLog, level, ##__VA_ARGS__)

namespace mozilla::hwinference {

SpeechRecognitionChild::SpeechRecognitionChild(
    already_AddRefed<dom::SpeechRecognitionIPCActorUserGuard>
        aIPCActorUserGuard)
    : mIPCActorUserGuard(std::move(aIPCActorUserGuard)) {
  LOG(LogLevel::Debug, "Constructor called");
}

SpeechRecognitionChild::~SpeechRecognitionChild() {
  LOG(LogLevel::Debug, "Destructor called");
}

void SpeechRecognitionChild::ActorDestroy(ActorDestroyReason aReason) {
  LOG(LogLevel::Info, "ActorDestroy called, reason={}",
      static_cast<int>(aReason));

  if (mResultCallback || mErrorCallback || mSpeechChangeCallback) {
    LOG(LogLevel::Debug,
        "Clearing callbacks (result={}, error={}, speechChange={})",
        mResultCallback ? "set" : "null", mErrorCallback ? "set" : "null",
        mSpeechChangeCallback ? "set" : "null");
  }
  mResultCallback = nullptr;
  mErrorCallback = nullptr;
  mSpeechChangeCallback = nullptr;

  if (mDestroyedCallback) {
    DestroyedCallback callback = std::move(mDestroyedCallback);
    mDestroyedCallback = nullptr;
    callback(this);
  }
  mIPCActorUserGuard = nullptr;
}

void SpeechRecognitionChild::SetResultCallback(
    RecognitionResultCallback&& aCallback) {
  LOG(LogLevel::Debug, "SetResultCallback called");
  mResultCallback = std::move(aCallback);
}

void SpeechRecognitionChild::SetErrorCallback(
    RecognitionErrorCallback&& aCallback) {
  LOG(LogLevel::Debug, "SetErrorCallback called");
  mErrorCallback = std::move(aCallback);
}

void SpeechRecognitionChild::SetSpeechChangeCallback(
    SpeechChangeCallback&& aCallback) {
  LOG(LogLevel::Debug, "SetSpeechChangeCallback called");
  mSpeechChangeCallback = std::move(aCallback);
}

void SpeechRecognitionChild::SetDestroyedCallback(
    DestroyedCallback&& aCallback) {
  LOG(LogLevel::Debug, "SetDestroyedCallback called");
  mDestroyedCallback = std::move(aCallback);
}

mozilla::ipc::IPCResult SpeechRecognitionChild::RecvOnRecognitionResult(
    const nsCString& aTranscript, const bool& aIsFinal,
    const float& aConfidence, const TimeStamp& aEventTime) {
  LOG(LogLevel::Info, "RecvOnRecognitionResult: '{}' (final={}, conf={})",
      aTranscript.get(), aIsFinal ? "true" : "false", aConfidence);

  if (mResultCallback) {
    LOG(LogLevel::Debug, "Invoking result callback");
    mResultCallback(aTranscript, aIsFinal, aConfidence, aEventTime);
  } else {
    LOG(LogLevel::Warning, "Received result but no callback set");
  }
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechRecognitionChild::RecvOnRecognitionError(
    const nsCString& aError) {
  LOG(LogLevel::Warning, "RecvOnRecognitionError: '{}'", aError.get());

  if (mErrorCallback) {
    LOG(LogLevel::Debug, "Invoking error callback");
    mErrorCallback(aError);
  } else {
    LOG(LogLevel::Warning, "Received error but no callback set");
  }
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechRecognitionChild::RecvOnSpeechChange(
    const bool& aSpeechDetected, const TimeStamp& aEventTime) {
  LOG(LogLevel::Info, "RecvOnSpeechChange: speechDetected={}",
      aSpeechDetected ? "true" : "false");

  if (mSpeechChangeCallback) {
    LOG(LogLevel::Debug, "Invoking speech change callback");
    mSpeechChangeCallback(aSpeechDetected, aEventTime);
  } else {
    LOG(LogLevel::Warning, "Received speech change but no callback set");
  }
  return IPC_OK();
}

}  // namespace mozilla::hwinference

#undef LOG
