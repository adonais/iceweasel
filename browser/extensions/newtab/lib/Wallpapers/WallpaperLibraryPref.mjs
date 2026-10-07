/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF_WALLPAPER_LIBRARY_ENABLED =
  "newtabWallpapers.customWallpaper.library.enabled";

// The default that matters is the one in firefox.js, not PREFS_CONFIG.
export const isWallpaperLibraryEnabled = prefValues =>
  !!prefValues?.[PREF_WALLPAPER_LIBRARY_ENABLED];
