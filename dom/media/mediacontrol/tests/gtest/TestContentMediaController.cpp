/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ContentMediaController.h"
#include "gtest/gtest.h"
#include "mozilla/dom/MediaSessionBinding.h"

using namespace mozilla::dom;

// A test-only receiver that records every media key it has been given so
// tests can assert which keys reached it.
class FakeContentReceiver final : public ContentMediaControlKeyReceiver {
 public:
  NS_INLINE_DECL_REFCOUNTING(FakeContentReceiver, override)

  void HandleMediaKey(MediaControlKey aKey,
                      const MediaControlActionParams& aParams = {}) override {
    mReceivedKeys.AppendElement(aKey);
  }

  bool IsPlaying() const override { return mIsPlaying; }

  bool HasReceivedKey(MediaControlKey aKey) const {
    return mReceivedKeys.Contains(aKey);
  }

  void ClearKeys() { mReceivedKeys.Clear(); }

  void SuspendForInterrupt() override { mSuspended = true; }
  void ResumeFromInterrupt() override { mResumed = true; }

  bool mIsPlaying = false;
  bool mSuspended = false;
  bool mResumed = false;

 private:
  ~FakeContentReceiver() = default;
  nsTArray<MediaControlKey> mReceivedKeys;
};

// RAII helper that registers a receiver with the controller on construction
// and removes it on destruction, so each test does not repeat the
// AddReceiver/RemoveReceiver pair.
class ScopedReceiver final {
 public:
  ScopedReceiver(ContentMediaController* aController,
                 FakeContentReceiver* aReceiver,
                 ControlType aType = ControlType::eControllable)
      : mController(aController), mReceiver(aReceiver), mType(aType) {
    mController->AddReceiver(mReceiver, mType);
  }
  ~ScopedReceiver() { mController->RemoveReceiver(mReceiver, mType); }

 private:
  RefPtr<ContentMediaController> mController;
  RefPtr<FakeContentReceiver> mReceiver;
  ControlType mType;
};

// ContentMediaController uses BrowsingContext internally for IPC, but in gtest
// there is no content process, so we use ID 0 and rely on the
// ContentChild::GetSingleton() null guard to skip IPC.
#define FAKE_BC_ID 0

// Keys that are routed to controllable receivers only — these manipulate
// playback state, which only fully-controllable sources (HTMLMediaElement)
// support.
static const MediaControlKey kControlOnlyKeys[] = {
    MediaControlKey::Play, MediaControlKey::Pause, MediaControlKey::Seekforward,
    MediaControlKey::Seekbackward};

// Keys that are routed to both controllable and uncontrollable receivers —
// these affect audibility (silencing or volume) and so apply to every audio
// source.
static const MediaControlKey kSharedKeys[] = {
    MediaControlKey::Stop, MediaControlKey::Setvolume, MediaControlKey::Mute,
    MediaControlKey::Unmute};

// All media keys that ContentMediaController dispatches via HandleMediaKey.
static const MediaControlKey kAllKeys[] = {
    MediaControlKey::Play,         MediaControlKey::Pause,
    MediaControlKey::Stop,         MediaControlKey::Seekforward,
    MediaControlKey::Seekbackward, MediaControlKey::Setvolume,
    MediaControlKey::Mute,         MediaControlKey::Unmute};

TEST(ContentMediaController, ControllableReceiverGetsAllKeys)
{
  RefPtr<ContentMediaController> controller =
      new ContentMediaController(FAKE_BC_ID);
  RefPtr<FakeContentReceiver> receiver = new FakeContentReceiver();
  ScopedReceiver scoped(controller, receiver);

  for (MediaControlKey key : kAllKeys) {
    receiver->ClearKeys();
    controller->HandleMediaKey(key);
    EXPECT_TRUE(receiver->HasReceivedKey(key))
        << "Controllable receiver should get key";
  }
}

TEST(ContentMediaController, OnlyGetUncontrolKeys)
{
  RefPtr<ContentMediaController> controller =
      new ContentMediaController(FAKE_BC_ID);
  RefPtr<FakeContentReceiver> receiver = new FakeContentReceiver();
  ScopedReceiver scoped(controller, receiver, ControlType::eUncontrollable);

  for (MediaControlKey key : kControlOnlyKeys) {
    receiver->ClearKeys();
    controller->HandleMediaKey(key);
    EXPECT_FALSE(receiver->HasReceivedKey(key))
        << "Uncontrollable receiver must not get control-only key";
  }

  for (MediaControlKey key : kSharedKeys) {
    receiver->ClearKeys();
    controller->HandleMediaKey(key);
    EXPECT_TRUE(receiver->HasReceivedKey(key))
        << "Uncontrollable receiver should get shared key";
  }
}

TEST(ContentMediaController, AudioFocusInterruptSuspendsBothBuckets)
{
  RefPtr<ContentMediaController> controller =
      new ContentMediaController(FAKE_BC_ID);
  RefPtr<FakeContentReceiver> controllable = new FakeContentReceiver();
  RefPtr<FakeContentReceiver> uncontrollable = new FakeContentReceiver();
  ScopedReceiver scopedControllable(controller, controllable,
                                    ControlType::eControllable);
  ScopedReceiver scopedUncontrollable(controller, uncontrollable,
                                      ControlType::eUncontrollable);

  controller->HandleAudioFocusInterrupt(AudioFocusInterruptAction::Suspend);

  EXPECT_TRUE(controllable->mSuspended)
      << "Interrupt suspend should reach controllable receiver";
  EXPECT_TRUE(uncontrollable->mSuspended)
      << "Interrupt suspend should reach uncontrollable receiver";
}

TEST(ContentMediaController, AudioFocusInterruptResumesBothBuckets)
{
  RefPtr<ContentMediaController> controller =
      new ContentMediaController(FAKE_BC_ID);
  RefPtr<FakeContentReceiver> controllable = new FakeContentReceiver();
  RefPtr<FakeContentReceiver> uncontrollable = new FakeContentReceiver();
  ScopedReceiver scopedControllable(controller, controllable,
                                    ControlType::eControllable);
  ScopedReceiver scopedUncontrollable(controller, uncontrollable,
                                      ControlType::eUncontrollable);

  controller->HandleAudioFocusInterrupt(AudioFocusInterruptAction::Resume);

  EXPECT_TRUE(controllable->mResumed)
      << "Interrupt resume should reach controllable receiver";
  EXPECT_TRUE(uncontrollable->mResumed)
      << "Interrupt resume should reach uncontrollable receiver";
}

TEST(ContentMediaController, AudioFocusInterruptTogglesInterruptedFlag)
{
  RefPtr<ContentMediaController> controller =
      new ContentMediaController(FAKE_BC_ID);

  EXPECT_FALSE(controller->IsAudioInterruptedByPlatform())
      << "Interrupted flag should start clear";

  controller->HandleAudioFocusInterrupt(AudioFocusInterruptAction::Suspend);
  EXPECT_TRUE(controller->IsAudioInterruptedByPlatform())
      << "Suspend interrupt should set the interrupted flag";

  controller->HandleAudioFocusInterrupt(AudioFocusInterruptAction::Resume);
  EXPECT_FALSE(controller->IsAudioInterruptedByPlatform())
      << "Resume interrupt should clear the interrupted flag";
}

TEST(ContentMediaController, UserPauseDoesNotSuspendUncontrollable)
{
  RefPtr<ContentMediaController> controller =
      new ContentMediaController(FAKE_BC_ID);
  RefPtr<FakeContentReceiver> controllable = new FakeContentReceiver();
  RefPtr<FakeContentReceiver> uncontrollable = new FakeContentReceiver();
  ScopedReceiver scopedControllable(controller, controllable,
                                    ControlType::eControllable);
  ScopedReceiver scopedUncontrollable(controller, uncontrollable,
                                      ControlType::eUncontrollable);

  controller->HandleMediaKey(MediaControlKey::Pause);

  EXPECT_FALSE(uncontrollable->mSuspended)
      << "User pause must not interrupt-suspend uncontrollable receiver";
  EXPECT_FALSE(uncontrollable->HasReceivedKey(MediaControlKey::Pause))
      << "User pause must stay controllable-only";
}

// Symmetric anti-conflation guard to UserPauseDoesNotSuspendUncontrollable: a
// user Play must drive the media-key path, never the interrupt-resume path.
// (Reviving only the receivers an interrupt actually suspended is the
// receiver's responsibility, e.g. AudioContext's suspended-by-interrupt
// guard, and is exercised end-to-end by the Track D WPT, not here.)
TEST(ContentMediaController, UserPlayDoesNotTriggerInterruptResume)
{
  RefPtr<ContentMediaController> controller =
      new ContentMediaController(FAKE_BC_ID);
  RefPtr<FakeContentReceiver> controllable = new FakeContentReceiver();
  RefPtr<FakeContentReceiver> uncontrollable = new FakeContentReceiver();
  ScopedReceiver scopedControllable(controller, controllable,
                                    ControlType::eControllable);
  ScopedReceiver scopedUncontrollable(controller, uncontrollable,
                                      ControlType::eUncontrollable);

  controller->HandleMediaKey(MediaControlKey::Play);

  EXPECT_FALSE(controllable->mResumed)
      << "User Play must not trigger an interrupt resume";
  EXPECT_FALSE(uncontrollable->mResumed)
      << "User Play must not reach the uncontrollable bucket";
}
