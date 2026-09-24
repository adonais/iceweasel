/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHTRACKLISTENER_H_
#define DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHTRACKLISTENER_H_

#include "AudioSegment.h"
#include "MediaTrackGraph.h"
#include "MediaTrackListener.h"
#include "mozilla/MozPromise.h"

namespace mozilla {

class AudioSegment;

namespace dom {

class SpeechRecognitionBackend;

class SpeechTrackListener : public MediaTrackListener {
 private:
  explicit SpeechTrackListener(SpeechRecognitionBackend* aBackend);

 public:
  static already_AddRefed<SpeechTrackListener> Create(
      SpeechRecognitionBackend* aBackend);

  ~SpeechTrackListener() = default;

  void NotifyQueuedChanges(MediaTrackGraph* aGraph, TrackTime aTrackOffset,
                           const MediaSegment& aQueuedMedia) override;

  void NotifyEnded(MediaTrackGraph* aGraph) override;

  void NotifyRemoved(MediaTrackGraph* aGraph) override;

 private:
  // Written on main thread (constructor, cleared after NotifyRemoved)
  // Read on graph thread (NotifyQueuedChanges, before NotifyRemoved)
  // Safe: All graph thread access completes before main thread clears this
  RefPtr<SpeechRecognitionBackend> mBackend;
  MozPromiseHolder<GenericNonExclusivePromise> mRemovedHolder;

 public:
  const RefPtr<GenericNonExclusivePromise> mRemovedPromise;
};

}  // namespace dom
}  // namespace mozilla

#endif  // DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHTRACKLISTENER_H_
