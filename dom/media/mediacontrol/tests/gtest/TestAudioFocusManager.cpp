/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AudioFocusManager.h"
#include "MediaControlService.h"
#include "gtest/gtest.h"
#include "mozilla/Preferences.h"
#include "mozilla/gtest/ScopedPrefSetter.h"

using namespace mozilla::dom;

#define FIRST_CONTROLLER_ID 0
#define SECOND_CONTROLLER_ID 1

TEST(AudioFocusManager, TestRequestAudioFocus)
{
  AudioFocusManager manager;
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);

  RefPtr<MediaController> controller = new MediaController(FIRST_CONTROLLER_ID);

  manager.RequestAudioFocus(controller);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 1);

  manager.RevokeAudioFocus(controller);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);
}

TEST(AudioFocusManager, TestAudioFocusNumsWhenEnableAudioFocusManagement)
{
  // When enabling audio focus management, we only allow one controller owing
  // audio focus at a time when the audio competing occurs. As the mechanism of
  // handling the audio competing involves multiple components, we can't test it
  // simply by using the APIs from AudioFocusManager.
  mozilla::ScopedPrefSetter prefSetter("media.audioFocus.management", true);

  AudioFocusManager manager;
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);

  RefPtr<MediaController> controller1 =
      new MediaController(FIRST_CONTROLLER_ID);

  RefPtr<MediaController> controller2 =
      new MediaController(SECOND_CONTROLLER_ID);

  manager.RequestAudioFocus(controller1);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 1);

  // When controller2 starts, it would win the audio focus from controller1. So
  // only one audio focus would exist.
  manager.RequestAudioFocus(controller2);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 1);

  manager.RevokeAudioFocus(controller2);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);
}

TEST(AudioFocusManager, TestAudioFocusNumsWhenDisableAudioFocusManagement)
{
  // When disabling audio focus management, we won't handle the audio competing,
  // so we allow multiple audio focus existing at the same time.
  mozilla::ScopedPrefSetter prefSetter("media.audioFocus.management", false);

  AudioFocusManager manager;
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);

  RefPtr<MediaController> controller1 =
      new MediaController(FIRST_CONTROLLER_ID);

  RefPtr<MediaController> controller2 =
      new MediaController(SECOND_CONTROLLER_ID);

  manager.RequestAudioFocus(controller1);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 1);

  manager.RequestAudioFocus(controller2);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 2);

  manager.RevokeAudioFocus(controller1);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 1);

  manager.RevokeAudioFocus(controller2);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);
}

TEST(AudioFocusManager, TestRequestAudioFocusRepeatedly)
{
  AudioFocusManager manager;
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);

  RefPtr<MediaController> controller = new MediaController(FIRST_CONTROLLER_ID);

  manager.RequestAudioFocus(controller);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 1);

  manager.RequestAudioFocus(controller);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 1);
}

TEST(AudioFocusManager, TestRevokeAudioFocusRepeatedly)
{
  AudioFocusManager manager;
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);

  RefPtr<MediaController> controller = new MediaController(FIRST_CONTROLLER_ID);

  manager.RequestAudioFocus(controller);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 1);

  manager.RevokeAudioFocus(controller);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);

  manager.RevokeAudioFocus(controller);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);
}

TEST(AudioFocusManager, TestRevokeAudioFocusWithoutRequestAudioFocus)
{
  AudioFocusManager manager;
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);

  RefPtr<MediaController> controller = new MediaController(FIRST_CONTROLLER_ID);

  manager.RevokeAudioFocus(controller);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);
}

TEST(AudioFocusManager,
     TestRevokeAudioFocusForControllerWithoutOwningAudioFocus)
{
  AudioFocusManager manager;
  ASSERT_TRUE(manager.GetAudioFocusNums() == 0);

  RefPtr<MediaController> controller1 =
      new MediaController(FIRST_CONTROLLER_ID);

  RefPtr<MediaController> controller2 =
      new MediaController(SECOND_CONTROLLER_ID);

  manager.RequestAudioFocus(controller1);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 1);

  manager.RevokeAudioFocus(controller2);
  ASSERT_TRUE(manager.GetAudioFocusNums() == 1);
}
