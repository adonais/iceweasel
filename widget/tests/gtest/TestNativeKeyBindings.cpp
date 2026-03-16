/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifdef XP_MACOSX

#  include "gtest/gtest.h"
#  include "mozilla/EventForwards.h"
#  include "mozilla/Maybe.h"
#  include "mozilla/NativeKeyBindingsType.h"
#  include "mozilla/TextEvents.h"
#  include "NativeKeyBindings.h"

// The tests here check that you get what you expect in terms of edit commands
// when you feed key presses through GetEditCommandsForTests.
//
// Basically, you specify a key combination, that gets mapped to an Obj-C
// method selector in NativeKeyBindings::GetEditCommandsForTests, which
// is then converted into a set of Gecko edit commands by
// NativeKeyBindings::AppendEditCommandsForSelector. Those edit commands
// are checked against an expected set in the test case.

namespace mozilla {

using widget::NativeKeyBindings;

struct NativeKeyBindingsTestCase {
  uint32_t mKeyCode;
  KeyNameIndex mKeyNameIndex;
  Modifiers mModifiers;
  // For KEY_NAME_INDEX_USE_STRING events.
  uint32_t mPseudoCharCode;
  NativeKeyBindingsType mEditorType;
  nsTArray<Command> mExpectedCommands;
  const char* mDescription;
};

static nsTArray<CommandInt> GetEditCommands(
    const NativeKeyBindingsTestCase& aTest) {
  WidgetKeyboardEvent event(true, eKeyDown, nullptr);
  event.mKeyCode = aTest.mKeyCode;
  event.mKeyNameIndex = aTest.mKeyNameIndex;
  event.mModifiers = aTest.mModifiers;
  event.mPseudoCharCode = aTest.mPseudoCharCode;
  event.mFlags.mIsSynthesizedForTests = true;

  nsTArray<CommandInt> commands;
  NativeKeyBindings::GetEditCommandsForTests(aTest.mEditorType, event,
                                             Nothing(), commands);
  return commands;
}

static void CheckCommands(const NativeKeyBindingsTestCase& aTest) {
  nsTArray<CommandInt> commands = GetEditCommands(aTest);
  ASSERT_EQ(commands.Length(), aTest.mExpectedCommands.Length())
      << aTest.mDescription;
  for (size_t i = 0; i < commands.Length(); i++) {
    ASSERT_EQ(commands[i], static_cast<CommandInt>(aTest.mExpectedCommands[i]))
        << aTest.mDescription << " command[" << i << "]";
  }
}

TEST(NativeKeyBindings, MetaShiftArrowUp)
{
  NativeKeyBindingsTestCase test{
      NS_VK_UP,
      KEY_NAME_INDEX_ArrowUp,
      MODIFIER_META | MODIFIER_SHIFT,
      0,
      NativeKeyBindingsType::MultiLineEditor,
      {Command::SelectTop},
      "Meta+Shift+ArrowUp should select to beginning of document"};
  CheckCommands(test);
}

TEST(NativeKeyBindings, MetaShiftArrowDown)
{
  NativeKeyBindingsTestCase test{
      NS_VK_DOWN,
      KEY_NAME_INDEX_ArrowDown,
      MODIFIER_META | MODIFIER_SHIFT,
      0,
      NativeKeyBindingsType::MultiLineEditor,
      {Command::SelectBottom},
      "Meta+Shift+ArrowDown should select to end of document"};
  CheckCommands(test);
}

TEST(NativeKeyBindings, AltArrowLeftWordMovement)
{
  NativeKeyBindingsTestCase test{NS_VK_LEFT,
                                 KEY_NAME_INDEX_ArrowLeft,
                                 MODIFIER_ALT,
                                 0,
                                 NativeKeyBindingsType::MultiLineEditor,
                                 {Command::WordPrevious},
                                 "Alt+ArrowLeft should move word left"};
  CheckCommands(test);
}

TEST(NativeKeyBindings, AltArrowRightWordMovement)
{
  NativeKeyBindingsTestCase test{NS_VK_RIGHT,
                                 KEY_NAME_INDEX_ArrowRight,
                                 MODIFIER_ALT,
                                 0,
                                 NativeKeyBindingsType::MultiLineEditor,
                                 {Command::WordNext},
                                 "Alt+ArrowRight should move word right"};
  CheckCommands(test);
}

TEST(NativeKeyBindings, AltShiftArrowLeftWordSelection)
{
  NativeKeyBindingsTestCase test{NS_VK_LEFT,
                                 KEY_NAME_INDEX_ArrowLeft,
                                 MODIFIER_ALT | MODIFIER_SHIFT,
                                 0,
                                 NativeKeyBindingsType::MultiLineEditor,
                                 {Command::SelectWordPrevious},
                                 "Alt+Shift+ArrowLeft should select word left"};
  CheckCommands(test);
}

TEST(NativeKeyBindings, AltShiftArrowRightWordSelection)
{
  NativeKeyBindingsTestCase test{
      NS_VK_RIGHT,
      KEY_NAME_INDEX_ArrowRight,
      MODIFIER_ALT | MODIFIER_SHIFT,
      0,
      NativeKeyBindingsType::MultiLineEditor,
      {Command::SelectWordNext},
      "Alt+Shift+ArrowRight should select word right"};
  CheckCommands(test);
}

TEST(NativeKeyBindings, AltMetaArrowLeftNoOp)
{
  NativeKeyBindingsTestCase test{
      NS_VK_LEFT,
      KEY_NAME_INDEX_ArrowLeft,
      MODIFIER_ALT | MODIFIER_META,
      0,
      NativeKeyBindingsType::MultiLineEditor,
      {},
      "Alt+Meta+ArrowLeft should produce no commands"};
  CheckCommands(test);
}

TEST(NativeKeyBindings, AltMetaArrowRightNoOp)
{
  NativeKeyBindingsTestCase test{
      NS_VK_RIGHT,
      KEY_NAME_INDEX_ArrowRight,
      MODIFIER_ALT | MODIFIER_META,
      0,
      NativeKeyBindingsType::MultiLineEditor,
      {},
      "Alt+Meta+ArrowRight should produce no commands"};
  CheckCommands(test);
}

}  // namespace mozilla

#endif  // XP_MACOSX
