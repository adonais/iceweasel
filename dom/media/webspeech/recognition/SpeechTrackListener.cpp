/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SpeechTrackListener.h"

#include "SpeechRecognitionBackend.h"

namespace mozilla::dom {

SpeechTrackListener::SpeechTrackListener(SpeechRecognitionBackend* aBackend)
    : mBackend(aBackend),
      mRemovedPromise(
          mRemovedHolder.Ensure("SpeechTrackListener::mRemovedPromise")) {
  MOZ_ASSERT(NS_IsMainThread());
}

already_AddRefed<SpeechTrackListener> SpeechTrackListener::Create(
    SpeechRecognitionBackend* aBackend) {
  MOZ_ASSERT(NS_IsMainThread());
  RefPtr<SpeechTrackListener> listener = new SpeechTrackListener(aBackend);

  listener->mRemovedPromise->Then(GetCurrentSerialEventTarget(), __func__,
                                  [listener]() {
                                    // Safe to clear: NotifyRemoved was the last
                                    // graph thread callback
                                    listener->mBackend = nullptr;
                                  });

  return listener.forget();
}

void SpeechTrackListener::NotifyQueuedChanges(
    MediaTrackGraph* aGraph, TrackTime aTrackOffset,
    const MediaSegment& aQueuedMedia) {
  if (!mBackend) {
    return;
  }

  const AudioSegment* audio = static_cast<const AudioSegment*>(&aQueuedMedia);

  TrackTime offsetForChunk = aTrackOffset;
  AudioSegment::ConstChunkIterator chunk(*audio);
  while (!chunk.IsEnded()) {
    mBackend->DataCallback(aGraph, offsetForChunk + chunk->mDuration, *chunk);
    chunk.Next();
  }
}

void SpeechTrackListener::NotifyEnded(MediaTrackGraph* aGraph) {
  if (mBackend) {
    mBackend->NotifyTrackEnded();
  }
}

void SpeechTrackListener::NotifyRemoved(MediaTrackGraph* aGraph) {
  mRemovedHolder.ResolveIfExists(true, __func__);
}

}  // namespace mozilla::dom
