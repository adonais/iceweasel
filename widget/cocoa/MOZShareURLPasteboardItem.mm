/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#import "MOZShareURLPasteboardItem.h"

#include "nsCocoaUtils.h"
#include "nsEscape.h"
#include "nsString.h"

static NSString* HtmlEscape(NSString* aStr) {
  if (!aStr) {
    return @"";
  }
  nsAutoString utf16;
  nsCocoaUtils::GetStringForNSString(aStr, utf16);
  nsAutoCString src, dst;
  CopyUTF16toUTF8(utf16, src);
  nsAppendEscapedHTML(src, dst);
  return nsCocoaUtils::ToNSString(dst);
}

@implementation MOZShareURLPasteboardItem

- (id)initWithURLs:(NSArray<NSString*>*)aUrls
            titles:(NSArray<NSString*>*)aTitles {
  self = [super init];
  mUrls = [aUrls copy];
  mTitles = [aTitles copy];
  return self;
}

- (void)dealloc {
  [mUrls release];
  [mTitles release];
  [super dealloc];
}

- (NSArray<NSPasteboardType>*)writableTypesForPasteboard:
    (NSPasteboard*)aPasteboard {
  return @[ NSPasteboardTypeString, NSPasteboardTypeHTML ];
}

- (id)pasteboardPropertyListForType:(NSPasteboardType)aType {
  if ([aType isEqualToString:NSPasteboardTypeHTML]) {
    NSMutableArray<NSString*>* anchors =
        [NSMutableArray arrayWithCapacity:mUrls.count];
    for (NSUInteger i = 0; i < mUrls.count; ++i) {
      NSString* url = mUrls[i] ?: @"";
      NSString* title =
          i < mTitles.count && mTitles[i].length ? mTitles[i] : url;
      [anchors addObject:[NSString stringWithFormat:@"<a href=\"%@\">%@</a>",
                                                    HtmlEscape(url),
                                                    HtmlEscape(title)]];
    }
    return [anchors componentsJoinedByString:@"<br>\n"];
  }
  // NSPasteboardTypeString (public.utf8-plain-text).
  NSMutableArray<NSString*>* lines = [NSMutableArray array];
  for (NSUInteger i = 0; i < mUrls.count; ++i) {
    NSString* title = i < mTitles.count ? (mTitles[i] ?: @"") : @"";
    if (title.length) {
      [lines addObject:title];
    }
    [lines addObject:(mUrls[i] ?: @"")];
  }
  return [lines componentsJoinedByString:@"\n"];
}

@end
