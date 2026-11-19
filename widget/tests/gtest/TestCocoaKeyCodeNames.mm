/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

#include "gtest/gtest.h"
#include "nsCocoaUtils.h"
#include "nsString.h"

// The key equivalent characters AppKit reports for shortcuts assigned in
// System Settings, and the keycode attribute a XUL key element takes for them.
TEST(CocoaKeyCodeNames, KnownKeys)
{
  struct {
    uint32_t mCharCode;
    const char* mKeyCodeName;
  } cases[] = {
      {NSF1FunctionKey, "VK_F1"},
      {NSF13FunctionKey, "VK_F13"},
      {NSF24FunctionKey, "VK_F24"},
      {NSDeleteFunctionKey, "VK_DELETE"},
      {NSBackspaceCharacter, "VK_BACK"},
      {NSDeleteCharacter, "VK_BACK"},
      {NSTabCharacter, "VK_TAB"},
      {NSEnterCharacter, "VK_RETURN"},
      {NSCarriageReturnCharacter, "VK_RETURN"},
      {NSNewlineCharacter, "VK_RETURN"},
      {0x1B, "VK_ESCAPE"},
      {' ', "VK_SPACE"},
      {NSHomeFunctionKey, "VK_HOME"},
      {NSLeftArrowFunctionKey, "VK_LEFT"},
  };
  for (const auto& testCase : cases) {
    nsAutoString name;
    EXPECT_TRUE(nsCocoaUtils::GetGeckoKeyCodeNameForMacCharCode(
        testCase.mCharCode, name))
        << "char code " << testCase.mCharCode;
    EXPECT_TRUE(name.EqualsASCII(testCase.mKeyCodeName))
        << "char code " << testCase.mCharCode << " gave "
        << NS_ConvertUTF16toUTF8(name).get();
  }
}

TEST(CocoaKeyCodeNames, UnknownKeys)
{
  nsAutoString name;
  EXPECT_FALSE(nsCocoaUtils::GetGeckoKeyCodeNameForMacCharCode(0, name));
  // Printable characters go into the key attribute instead.
  EXPECT_FALSE(nsCocoaUtils::GetGeckoKeyCodeNameForMacCharCode('a', name));
  EXPECT_FALSE(nsCocoaUtils::GetGeckoKeyCodeNameForMacCharCode(0xF8FF, name));
}
