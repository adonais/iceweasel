/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_ChromeScriptPath_h
#define mozilla_ChromeScriptPath_h

#include <stddef.h>
#include <string.h>

namespace mozilla {

namespace detail {

// Get the full path after the URI scheme, if the URI matches the scheme.
// For example, GetFullPathForScheme("a://b/c/d/e", "a://") returns "b/c/d/e".
template <size_t LEN>
const char* GetFullPathForScheme(const char* filename,
                                 const char (&scheme)[LEN]) {
  // Account for the null terminator included in LEN.
  if (!strncmp(filename, scheme, LEN - 1)) {
    return filename + LEN - 1;
  }
  return nullptr;
}

// Get the full path after a URI component, if the URI contains the component.
// For example, GetPathAfterComponent("a://b/c/d/e", "/c/") returns "d/e".
template <size_t LEN>
const char* GetPathAfterComponent(const char* filename,
                                  const char (&component)[LEN]) {
  const char* found = nullptr;
  const char* next = strstr(filename, component);
  while (next) {
    // Move 'found' to end of the component, after the separator '/'.
    // 'LEN - 1' accounts for the null terminator included in LEN,
    found = next + LEN - 1;
    // Resume searching before the separator '/'.
    next = strstr(found - 1, component);
  }
  return found;
}

}  // namespace detail

// Returns the part of a system principal script's filename that background
// hang reports may contain, pointing into aFilename. The OmnijarCanaryFailure
// crash annotation reuses this filter. Must stay async-signal-safe.
inline const char* GetReportableChromeScriptPath(const char* aFilename) {
  // Some script names are in the form "foo -> bar -> baz".
  // Here we find the origin of these redirected scripts.
  if (const char* origin = detail::GetPathAfterComponent(aFilename, " -> ")) {
    aFilename = origin;
  }

  const char* path = detail::GetFullPathForScheme(aFilename, "chrome://");
  if (!path) {
    path = detail::GetFullPathForScheme(aFilename, "resource://");
  }
  if (!path) {
    path = detail::GetFullPathForScheme(aFilename, "moz-src:///");
  }
  if (!path) {
    // If we're in an add-on script, under the {profile}/extensions
    // directory, extract the path after the /extensions/ part.
    path = detail::GetPathAfterComponent(aFilename, "/extensions/");
  }
  if (!path) {
    // Only keep the file base name for paths outside the above formats.
    path = strrchr(aFilename, '/');
    path = path ? path + 1 : aFilename;
    // Look for Windows path separator as well.
    if (const char* leaf = strrchr(path, '\\')) {
      path = leaf + 1;
    }
  }
  return path;
}

}  // namespace mozilla

#endif  // mozilla_ChromeScriptPath_h
