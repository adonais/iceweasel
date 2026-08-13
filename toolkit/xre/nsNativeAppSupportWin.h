/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This file has *public* stuff needed for the Win32 implementation of
 * the nsINativeAppSupport interface.  It has to be broken out into a
 * separate file in order to ensure that the generated .h file can be
 * used in a Win32 .rc file.  See /mozilla/xpfe/bootstrap/splash.rc.
 *
 * This file, and the generated .h, are only needed on Win32 platforms.
 */

// Constants identifying Win32 "native" resources.

#ifndef TOOLKIT_XRE_NSNATIVEAPPSUPPORTWIN_H_
#define TOOLKIT_XRE_NSNATIVEAPPSUPPORTWIN_H_

#define IDI_APPICON 1
#define IDI_DOCUMENT 2
#define IDI_NEWWINDOW 3
#define IDI_NEWTAB 4
// If IDI_PBMODE's index changes, PRIVATE_BROWSING_ICON_INDEX
// in BrowserContentHandler.sys.mjs must also be updated.
#define IDI_PBMODE 5
#define IDI_DOCUMENT_PDF 6
#ifndef IDI_APPLICATION
#  define IDI_APPLICATION 32512
#endif

// Reserved resource-ID range [1100, 1199] for user-selectable custom launcher
// icons (see CustomIconManager.sys.mjs). The catalog-id -> resource-id mapping
// is treated as ABI: once an icon ships with a given ID that mapping must never
// change or be reused, even if the icon is later retired from the picker.
// Shortcuts reference these icons by resource ID via the negative-index
// convention (firefox.exe,-<resource-id>), so the reference stays valid no
// matter what order icons are embedded in the executable.
#define IDI_CUSTOM_RETRO2004 1100
#define IDI_CUSTOM_RETRO2017 1101
// Minimal is theme-aware: dark and light are distinct embedded icons, chosen at
// apply time by the OS taskbar theme (see CustomIconManager.sys.mjs).
#define IDI_CUSTOM_MINIMAL_DARK 1102
#define IDI_CUSTOM_MINIMAL_LIGHT 1103
#define IDI_CUSTOM_PIXELATED 1104
#define IDI_CUSTOM_MOMO 1105
#define IDI_CUSTOM_PRIDE 1106
#define IDI_CUSTOM_KIT 1107

// String that goes in the WinXP Start Menu.
#define IDS_STARTMENU_APPNAME 103

#endif  // TOOLKIT_XRE_NSNATIVEAPPSUPPORTWIN_H_
