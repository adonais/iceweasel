/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#import <Cocoa/Cocoa.h>

#include "nsMacSharingService.h"

#include "mozilla/MacStringHelpers.h"
#include "nsCocoaUtils.h"

#include "MOZShareURLPasteboardItem.h"
#include "Units.h"
#include "mozilla/PresShell.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/dom/Element.h"
#include "nsCOMPtr.h"
#include "nsDeviceContext.h"
#include "nsIFrame.h"
#include "nsIWidget.h"
#include "nsMacSharingCopyOverride.h"
#include "nsPresContext.h"

using namespace mozilla;

@interface NSImage (MozTintColor)
- (NSImage*)imageWithTintColor:(NSColor*)aColor;
@end

NS_IMPL_ISUPPORTS(nsMacSharingService, nsIMacSharingService)

// SharingServicePickerDelegate owns everything that has to outlive
// ShareUrlWithPicker.
//
// It owns a reference to itself and releases the ownership in
// sharingServicePicker:didChooseSharingService, which AppKit calls exactly
// once per picker, including when the user dismisses it without choosing.
// NSSharingServicePicker holds its delegate weakly, so the delegate cannot be
// autoreleased.
//
// The picker is retained here and released in dealloc, because
// ShareUrlWithPicker releases its own reference as soon as the delegate is
// attached. This leaves the delegate as the only owner for the lifetime of the
// popover.
//
// The Copy Link override is scoped to the same lifetime. It is created
// before the picker is shown and destroyed in dealloc, so it is
// active for exactly as long as the picker that needs it.
@interface SharingServicePickerDelegate
    : NSObject <NSSharingServicePickerDelegate> {
  NSSharingServicePicker* mPicker;
  NSUserActivity* mShareActivity;
  NSArray<NSSharingService*>* mCustomServices;
  mozilla::UniquePtr<MacShareCopyOverride> mCopyOverride;
  BOOL mIsMultiUrl;
}
- (id)initWithPicker:(NSSharingServicePicker*)aPicker
            activity:(NSUserActivity*)aActivity
      customServices:(NSArray<NSSharingService*>*)aCustomServices
          isMultiUrl:(BOOL)aIsMultiUrl
        copyOverride:(mozilla::UniquePtr<MacShareCopyOverride>&&)aCopyOverride;

@end

@implementation SharingServicePickerDelegate
- (id)initWithPicker:(NSSharingServicePicker*)aPicker
            activity:(NSUserActivity*)aActivity
      customServices:(NSArray<NSSharingService*>*)aCustomServices
          isMultiUrl:(BOOL)aIsMultiUrl
        copyOverride:(mozilla::UniquePtr<MacShareCopyOverride>&&)aCopyOverride {
  self = [super init];
  mPicker = [aPicker retain];
  mShareActivity = [aActivity retain];
  mCustomServices = [aCustomServices retain];
  mCopyOverride = std::move(aCopyOverride);
  mIsMultiUrl = aIsMultiUrl;
  return self;
}

// NSSharingServicePickerDelegate filters the proposed services and prepends
// custom services. Called by AppKit when the picker is about to show.
- (NSArray<NSSharingService*>*)
       sharingServicePicker:(NSSharingServicePicker*)aPicker
    sharingServicesForItems:(NSArray*)aItems
    proposedSharingServices:(NSArray<NSSharingService*>*)aProposed {
  NSMutableArray* excluded = [NSMutableArray
      arrayWithObject:@"com.apple.share.System.add-to-safari-reading-list"];
  // For multiple tab sharing, Journal's activation rule accepts the plain text
  // data type so it doesn't get filtered out of the sharing service list
  // automatically. However, it shows an empty entry upon selection, which is a
  // macOS side bug. We will filter it out of the list for now.
  if (mIsMultiUrl) {
    [excluded addObject:@"com.apple.journal.JournalShareExtension"];
  }
  NSArray* filtered = [aProposed
      filteredArrayUsingPredicate:[NSPredicate
                                      predicateWithFormat:@"NOT (name IN %@)",
                                                          excluded]];

  if (mCustomServices.count) {
    filtered = [mCustomServices arrayByAddingObjectsFromArray:filtered];
  }
  return filtered;
}

// NSSharingServicePickerDelegate picker is done (user chose or dismissed).
// `aService` is nil when the user dismissed without choosing.
- (void)sharingServicePicker:(NSSharingServicePicker*)aPicker
     didChooseSharingService:(NSSharingService*)aService {
  [self release];
}

- (void)dealloc {
  // Destroy the copy override before anything else, so the swizzled trampolines
  // are safe from this point on.
  mCopyOverride = nullptr;
  [mShareActivity resignCurrent];
  [mShareActivity invalidate];
  [mShareActivity release];
  [mPicker release];
  [mCustomServices release];
  [super dealloc];
}

@end

namespace {

// Build the share item passed to NSSharingServicePicker.
// For Single URL: return the NSURL directly, so AppKit fetches the webpage
//   preview and Apple's Copy Link service stays in the list.
// For Multiple URLs: return a MOZShareURLPasteboardItem wrapped in
//   NSPreviewRepresentingActivityItem (macOS 13+) so the preview shows a
//   link icon and custom share title (X Links).
static id MakeMultiUrlShareItem(const nsTArray<nsString>& aUrls,
                                const nsTArray<nsString>& aTitles,
                                NSString* aShareTitle) {
  NSMutableArray<NSString*>* urls =
      [NSMutableArray arrayWithCapacity:aUrls.Length()];
  for (const auto& u : aUrls) {
    [urls addObject:nsCocoaUtils::ToNSString(u)];
  }
  NSMutableArray<NSString*>* titles =
      [NSMutableArray arrayWithCapacity:aTitles.Length()];
  for (const auto& t : aTitles) {
    [titles addObject:nsCocoaUtils::ToNSString(t)];
  }
  MOZShareURLPasteboardItem* pasteboardItem =
      [[[MOZShareURLPasteboardItem alloc] initWithURLs:urls
                                                titles:titles] autorelease];
  if (@available(macOS 13.0, *)) {
    NSImage* linkImage = [NSImage imageWithSystemSymbolName:@"link"
                                   accessibilityDescription:nil];
    NSImageSymbolConfiguration* config = [NSImageSymbolConfiguration
        configurationWithPointSize:24
                            weight:NSFontWeightRegular];
    linkImage = [linkImage imageWithSymbolConfiguration:config];
    linkImage = [linkImage
        imageWithTintColor:[[NSColor labelColor] colorWithAlphaComponent:0.50]];
    return [[[NSPreviewRepresentingActivityItem alloc]
        initWithItem:pasteboardItem
               title:aShareTitle
               image:linkImage
                icon:nil] autorelease];
  }
  return pasteboardItem;
}

// Convert each XPCOM custom item into an NSSharingService whose handler
// block holds a strong reference to the JS callback. Returns an autoreleased
// array. Used for inserting custom sharing services (like Create QR Code)
// into native Picker.
static NSArray<NSSharingService*>* BuildCustomServices(
    const nsTArray<RefPtr<nsIMacShareCustomItem>>& aCustomItems) {
  NSMutableArray<NSSharingService*>* services = [NSMutableArray array];
  for (const auto& item : aCustomItems) {
    nsAutoString label, icon;
    item->GetLabel(label);
    item->GetIcon(icon);
    nsCOMPtr<nsIMacShareCustomItemHandler> handler;
    item->GetHandler(getter_AddRefs(handler));
    if (label.IsEmpty() || !handler) {
      continue;
    }
    NSImage* iconImage = nil;
    if (!icon.IsEmpty()) {
      if (@available(macOS 11.0, *)) {
        iconImage =
            [NSImage imageWithSystemSymbolName:nsCocoaUtils::ToNSString(icon)
                      accessibilityDescription:nil];
      }
    }
    nsCOMPtr<nsIMacShareCustomItemHandler> handlerRef = handler;
    NSSharingService* service =
        [[[NSSharingService alloc] initWithTitle:nsCocoaUtils::ToNSString(label)
                                           image:iconImage
                                  alternateImage:iconImage
                                         handler:^{
                                           handlerRef->Handle();
                                         }] autorelease];
    [services addObject:service];
  }
  return services;
}

// Resolve a DOM anchor element to the NSView + rect (in the view's local
// coordinates) that NSSharingServicePicker should attach to. Same coordinate
// conversion path nsCocoaWindow.mm uses for NSPopover anchoring.
static nsresult ResolveAnchorViewRect(mozilla::dom::Element* aAnchor,
                                      NSView*& aView, NSRect& aRect) {
  nsIFrame* frame = aAnchor->GetPrimaryFrame();
  if (!frame) {
    return NS_ERROR_FAILURE;
  }
  nsIWidget* widget = frame->GetNearestWidget();
  if (!widget) {
    return NS_ERROR_FAILURE;
  }
  NSView* view = (NSView*)widget->GetNativeData(NS_NATIVE_WIDGET);
  if (!view) {
    return NS_ERROR_FAILURE;
  }
  NSWindow* window = [view window];
  if (!window) {
    return NS_ERROR_FAILURE;
  }

  nsRect anchorRectAppUnits = frame->GetScreenRectInAppUnits();
  nsPresContext* pc = frame->PresContext();
  int32_t appUnitsPerDevPixel = pc->AppUnitsPerDevPixel();
  DesktopToLayoutDeviceScale desktopToLayoutScale =
      pc->DeviceContext()->GetDesktopToDeviceScale();
  DesktopIntRect anchorRectDesktop = DesktopIntRect::RoundOut(
      LayoutDeviceRect::FromAppUnits(anchorRectAppUnits, appUnitsPerDevPixel) /
      desktopToLayoutScale);

  NSRect cocoaScreenRect =
      nsCocoaUtils::GeckoRectToCocoaRect(anchorRectDesktop);
  NSRect windowRect = [window convertRectFromScreen:cocoaScreenRect];
  aView = view;
  aRect = [view convertRect:windowRect fromView:nil];
  return NS_OK;
}

// Build an NSUserActivity for a single URL share. Reminders and Handoff read
// from the activity rather than the pasteboard. Returns nil for multi-URL
// shares.
static NSUserActivity* MakeSingleUrlActivity(NSURL* aURL, NSString* aTitle) {
  if (!aURL) {
    return nil;
  }
  NSUserActivity* activity = [[[NSUserActivity alloc]
      initWithActivityType:NSUserActivityTypeBrowsingWeb] autorelease];
  if ([aURL.scheme hasPrefix:@"http"]) {
    [activity setWebpageURL:aURL];
  }
  [activity setEligibleForHandoff:NO];
  [activity setTitle:aTitle];
  [activity becomeCurrent];
  return activity;
}

// Build the Copy Link swizzle override from an XPCOM custom item. Returns
// null if aCopyItem is null or its fields are missing. The returned scope
// object is transferred to the picker delegate.
static mozilla::UniquePtr<MacShareCopyOverride> MakeCopyOverride(
    nsIMacShareCustomItem* aCopyItem) {
  if (!aCopyItem) {
    return nullptr;
  }
  nsAutoString label;
  aCopyItem->GetLabel(label);
  nsCOMPtr<nsIMacShareCustomItemHandler> handler;
  aCopyItem->GetHandler(getter_AddRefs(handler));
  if (label.IsEmpty() || !handler) {
    return nullptr;
  }
  nsCOMPtr<nsIMacShareCustomItemHandler> handlerRef = handler;
  return MacShareCopyOverride::Create(nsCocoaUtils::ToNSString(label), ^{
    handlerRef->Handle();
  });
}

}  // namespace

NS_IMETHODIMP
nsMacSharingService::ShareUrlWithPicker(
    mozilla::dom::Element* aAnchor, const nsTArray<nsString>& aUrls,
    const nsTArray<nsString>& aTitles, const nsAString& aShareTitle,
    const nsTArray<RefPtr<nsIMacShareCustomItem>>& aCustomItems,
    nsIMacShareCustomItem* aCopyItem) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;
  if (!aAnchor || aUrls.IsEmpty()) {
    return NS_ERROR_INVALID_ARG;
  }

  bool isSingle = aUrls.Length() == 1;
  NSString* shareTitle = nsCocoaUtils::ToNSString(aShareTitle);
  NSURL* singleURL = isSingle ? nsCocoaUtils::ToNSURL(aUrls[0]) : nil;
  if (isSingle && !singleURL) {
    return NS_ERROR_FAILURE;
  }

  id shareItem =
      singleURL ? singleURL : MakeMultiUrlShareItem(aUrls, aTitles, shareTitle);

  NSView* anchorView = nil;
  NSRect anchorRect = NSZeroRect;
  nsresult rv = ResolveAnchorViewRect(aAnchor, anchorView, anchorRect);
  NS_ENSURE_SUCCESS(rv, rv);

  NSArray<NSSharingService*>* customServices =
      BuildCustomServices(aCustomItems);
  NSUserActivity* shareActivity = MakeSingleUrlActivity(singleURL, shareTitle);
  mozilla::UniquePtr<MacShareCopyOverride> copyOverride =
      MakeCopyOverride(aCopyItem);

  NSSharingServicePicker* picker =
      [[NSSharingServicePicker alloc] initWithItems:@[ shareItem ]];

  SharingServicePickerDelegate* delegate = [[SharingServicePickerDelegate alloc]
      initWithPicker:picker
            activity:shareActivity
      customServices:customServices
          isMultiUrl:!isSingle
        copyOverride:std::move(copyOverride)];
  // The delegate retains the picker, so releasing our reference here is safe.
  // The delegate releases itself in
  // sharingServicePicker:didChooseSharingService.
  [picker setDelegate:delegate];
  [picker release];

  // The picker is invoked from a menuitem command, and at that point Cocoa
  // is still tearing down the source NSMenu. Showing the picker
  // synchronously from inside that runloop turn fails.
  // Defer one runloop turn so the menu finishes dismissing.
  dispatch_async(dispatch_get_main_queue(), ^{
    [picker showRelativeToRect:anchorRect
                        ofView:anchorView
                 preferredEdge:NSMinYEdge];
  });

  return NS_OK;
  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}
