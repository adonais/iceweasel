/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMacSharingCopyOverride_h_
#define nsMacSharingCopyOverride_h_

#import <Foundation/Foundation.h>

#include "mozilla/UniquePtr.h"

// Swizzle Apple's private SHKCopyToPasteboardSharingService (the "Copy Link"
// entry in NSSharingServicePicker) so it keeps its native icon and identity
// but presents a caller-supplied label and calls a caller-supplied handler.
class MacShareCopyOverride {
 public:
  static mozilla::UniquePtr<MacShareCopyOverride> Create(
      NSString* aLabel, void (^aHandler)(void));

  ~MacShareCopyOverride();

  MacShareCopyOverride(const MacShareCopyOverride&) = delete;
  MacShareCopyOverride& operator=(const MacShareCopyOverride&) = delete;

 private:
  MacShareCopyOverride(NSString* aLabel, void (^aHandler)(void));
};

#endif  // nsMacSharingCopyOverride_h_
