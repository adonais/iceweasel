/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZShareURLPasteboardItem_h_
#define MOZShareURLPasteboardItem_h_

#import <AppKit/AppKit.h>

// The share item handed to NSSharingServicePicker for a multi-URL share.
// Advertises plain text and HTML so text-aware services receive every URL.
// Single-URL shares bypass this class and go to the picker as a plain NSURL.
@interface MOZShareURLPasteboardItem : NSObject <NSPasteboardWriting> {
  NSArray<NSString*>* mUrls;
  NSArray<NSString*>* mTitles;
}
- (id)initWithURLs:(NSArray<NSString*>*)aUrls
            titles:(NSArray<NSString*>*)aTitles;
@end

#endif  // MOZShareURLPasteboardItem_h_
