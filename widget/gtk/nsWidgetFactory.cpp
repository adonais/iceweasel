/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsWidgetFactory.h"

#include "HeadlessClipboard.h"
#include "IMContextWrapper.h"
#include "NativeKeyBindings.h"
#include "TaskbarProgress.h"
#include "WakeLockListener.h"
#include "mozilla/Components.h"
#include "mozilla/WidgetUtils.h"
#include "nsAppShell.h"
#include "nsAppShellSingleton.h"
#include "nsClipboard.h"
#include "nsFilePicker.h"
#include "nsGTKToolkit.h"
#include "nsGtkKeyUtils.h"
#include "nsHTMLFormatConverter.h"
#include "nsIWidget.h"
#include "nsLookAndFeel.h"
#include "nsSound.h"
#include "nsWidgetsCID.h"
#include "nsWindow.h"
#if defined(MOZ_WAYLAND) && defined(MOZ_ENABLE_DBUS)
#  include "FileTransferPortal.h"
#endif
#include <gtk/gtk.h>

#include "DMABufDevice.h"
#include "mozilla/gfx/2D.h"
#include "mozilla/widget/ScreenManager.h"

using namespace mozilla;
using namespace mozilla::widget;

NS_IMPL_COMPONENT_FACTORY(nsIClipboard) {
  nsCOMPtr<nsIClipboard> inst;
  if (gfxPlatform::IsHeadless()) {
    inst = new HeadlessClipboard();
  } else {
    auto clipboard = MakeRefPtr<nsClipboard>();
    if (NS_FAILED(clipboard->Init())) {
      return nullptr;
    }
    inst = std::move(clipboard);
  }

  return inst.forget().downcast<nsISupports>();
}

nsresult nsWidgetGtk2ModuleCtor() { return nsAppShellInit(); }

void nsWidgetGtk2ModuleDtor() {
  // Shutdown all XP level widget classes.
  DMABufDeviceLock::Shutdown();
  WidgetUtils::Shutdown();
#if defined(MOZ_WAYLAND) && defined(MOZ_ENABLE_DBUS)
  FileTransferPortal::Shutdown();
#endif
  NativeKeyBindings::Shutdown();
  nsLookAndFeel::Shutdown();
  nsFilePicker::Shutdown();
  nsSound::Shutdown();
  nsWindow::ReleaseGlobals();
  IMContextWrapper::Shutdown();
  KeymapWrapper::Shutdown();
  nsGTKToolkit::Shutdown();
  nsAppShellShutdown();
}
