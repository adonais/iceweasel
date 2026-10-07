/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_LIBWEBRTCOVERRIDES_API_WEBRTCLOCATION_H_
#define DOM_MEDIA_WEBRTC_LIBWEBRTCOVERRIDES_API_WEBRTCLOCATION_H_

#include <cstdint>
#include <source_location>

namespace mozilla {
class WebrtcLocation {
 private:
  WebrtcLocation(const char* aFunction, const char* aFile, uint32_t aLine)
      : mFunction(aFunction), mFile(aFile), mLine(aLine) {}

 public:
  static WebrtcLocation Current(
      const std::source_location& aLoc = std::source_location::current()) {
    return WebrtcLocation(aLoc.function_name(), aLoc.file_name(), aLoc.line());
  }

  const char* const mFunction;
  const char* const mFile;
  const uint32_t mLine;
};

}  // namespace mozilla

namespace webrtc {
using Location = mozilla::WebrtcLocation;
}  // namespace webrtc

#endif  // DOM_MEDIA_WEBRTC_LIBWEBRTCOVERRIDES_API_WEBRTCLOCATION_H_
