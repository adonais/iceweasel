/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#import <AppKit/AppKit.h>
#import <dlfcn.h>
#import <objc/runtime.h>

#include "nsMacSharingCopyOverride.h"

#include "mozilla/Assertions.h"

namespace {

NSString* const kShareKitFrameworkPath =
    @"/System/Library/PrivateFrameworks/ShareKit.framework/Versions/A/ShareKit";
NSString* const kCopyToPasteboardServiceClass =
    @"SHKCopyToPasteboardSharingService";
NSString* const kSharingServiceClass = @"SHKSharingService";

// Process-wide state consulted by the swizzled trampolines below.
// MacShareCopyOverride's ctor/dtor own their lifetime.
NSString* gCopyLabel = nil;
void (^gCopyHandler)(void) = nil;

bool gCopyServiceSwizzled = false;
IMP gOrigCopyServiceTitle = nullptr;
BOOL (*gOrigCopyServiceCanPerform)(id, SEL, id) = nullptr;
void (*gOrigCopyServicePerform)(id, SEL, id) = nullptr;

id CopyServiceTitle(id aSelf, SEL aCmd) {
  if (gCopyLabel) {
    return gCopyLabel;
  }
  return ((id (*)(id, SEL))gOrigCopyServiceTitle)(aSelf, aCmd);
}

BOOL CopyServiceCanPerform(id aSelf, SEL aCmd, id aItems) {
  if (gCopyHandler) {
    return YES;
  }
  return gOrigCopyServiceCanPerform(aSelf, aCmd, aItems);
}

void CopyServicePerform(id aSelf, SEL aCmd, id aItems) {
  if (gCopyHandler) {
    // We run our handler on the next turn of the event loop instead of
    // immediately. After this method returns, ShareKit could also write to
    // the clipboard, which would overwrite ours. Deferring one turn makes
    // our write land last.
    void (^handler)(void) = [gCopyHandler copy];
    dispatch_async(dispatch_get_main_queue(), ^{
      handler();
      [handler release];
    });
    return;
  }
  gOrigCopyServicePerform(aSelf, aCmd, aItems);
}

bool EnsureCopyServiceSwizzled() {
  if (gCopyServiceSwizzled) {
    return true;
  }
  dlopen([kShareKitFrameworkPath fileSystemRepresentation], RTLD_LAZY);

  Class copyClass = NSClassFromString(kCopyToPasteboardServiceClass);
  Class baseClass = NSClassFromString(kSharingServiceClass);
  if (!copyClass || !baseClass) {
    return false;
  }

  // -title lives on the base class; add a subclass override so we can
  // shadow it without touching the shared implementation.
  Method baseTitle = class_getInstanceMethod(baseClass, @selector(title));
  Method canPerform =
      class_getInstanceMethod(copyClass, @selector(canPerformWithItems:));
  Method perform =
      class_getInstanceMethod(copyClass, @selector(performWithItems:));
  if (!baseTitle || !canPerform || !perform) {
    return false;
  }

  gOrigCopyServiceTitle = method_getImplementation(baseTitle);
  if (!class_addMethod(copyClass, @selector(title), (IMP)CopyServiceTitle,
                       method_getTypeEncoding(baseTitle))) {
    return false;
  }

  gOrigCopyServiceCanPerform =
      (BOOL (*)(id, SEL, id))method_getImplementation(canPerform);
  method_setImplementation(canPerform, (IMP)CopyServiceCanPerform);

  gOrigCopyServicePerform =
      (void (*)(id, SEL, id))method_getImplementation(perform);
  method_setImplementation(perform, (IMP)CopyServicePerform);

  gCopyServiceSwizzled = true;
  return true;
}

}  // namespace

mozilla::UniquePtr<MacShareCopyOverride> MacShareCopyOverride::Create(
    NSString* aLabel, void (^aHandler)(void)) {
  if (!aLabel.length || !aHandler || !EnsureCopyServiceSwizzled()) {
    return nullptr;
  }
  return mozilla::WrapUnique(new MacShareCopyOverride(aLabel, aHandler));
}

MacShareCopyOverride::MacShareCopyOverride(NSString* aLabel,
                                           void (^aHandler)(void)) {
  MOZ_ASSERT(!gCopyLabel && !gCopyHandler,
             "prior override must be destroyed before installing a new one");
  gCopyLabel = [aLabel copy];
  gCopyHandler = [aHandler copy];
}

MacShareCopyOverride::~MacShareCopyOverride() {
  [gCopyLabel release];
  gCopyLabel = nil;
  [gCopyHandler release];
  gCopyHandler = nil;
}
