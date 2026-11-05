/*
 *  Copyright (c) 2026 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#ifndef CALL_SFRAME_OPTIONS_H_
#define CALL_SFRAME_OPTIONS_H_

namespace webrtc {

// Options for Sframe end-to-end encryption on a send channel.
// Once required, encryption is enforced and cannot be disabled.
struct SframeSendOptions {
  bool required = false;
  // TODO(bugs.webrtc.org/479862368): Add Sframe encryptor once the type is
  // defined.
};

// Options for Sframe end-to-end encryption on a receive channel.
// Once required, decryption is enforced and cannot be disabled.
struct SframeReceiveOptions {
  bool required = false;
  // TODO(bugs.webrtc.org/479862368): Add Sframe decryptor once the type is
  // defined.
};

}  // namespace webrtc

#endif  // CALL_SFRAME_OPTIONS_H_
