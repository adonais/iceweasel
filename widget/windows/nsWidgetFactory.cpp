/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsWidgetFactory.h"

#include "KeyboardLayout.h"
#include "WinMouseScrollHandler.h"
#include "mozilla/Components.h"
#include "mozilla/WidgetUtils.h"
#include "mozilla/widget/ScreenManager.h"
#include "nsAppShell.h"
#include "nsAppShellSingleton.h"
#include "nsISupports.h"
#include "nsLookAndFeel.h"
#include "nsToolkit.h"
#include "nsWidgetsCID.h"
#include "nsdefs.h"

// Modules that switch out based on the environment
#include "nsXULAppAPI.h"
// Desktop
#include "nsColorPicker.h"
#include "nsFilePicker.h"  // needs to be included before other shobjidl.h includes
// Content processes
#include "nsFilePickerProxy.h"

// Clipboard
#include "HeadlessClipboard.h"
#include "WindowsUIUtils.h"
#include "nsClipboard.h"
#include "nsClipboardHelper.h"

using namespace mozilla;
using namespace mozilla::widget;

NS_IMPL_COMPONENT_FACTORY(nsIClipboard) {
  nsCOMPtr<nsIClipboard> inst;
  if (gfxPlatform::IsHeadless()) {
    inst = new HeadlessClipboard();
  } else {
    inst = new nsClipboard();
  }
  return inst.forget().downcast<nsISupports>();
}

nsresult nsWidgetWindowsModuleCtor() { return nsAppShellInit(); }

void nsWidgetWindowsModuleDtor() {
  // Shutdown all XP level widget classes.
  WidgetUtils::Shutdown();

  KeyboardLayout::Shutdown();
  MouseScrollHandler::Shutdown();
  nsLookAndFeel::Shutdown();
  nsToolkit::Shutdown();
  nsAppShellShutdown();
}
