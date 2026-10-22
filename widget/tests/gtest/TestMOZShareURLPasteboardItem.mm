/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifdef XP_MACOSX

#  import <AppKit/AppKit.h>

#  include "MOZShareURLPasteboardItem.h"
#  include "gtest/gtest.h"
#  include "nsCocoaUtils.h"

// Composition tests for MOZShareURLPasteboardItem. This object is handed
// to NSSharingServicePicker for a multi-URL share and generates the
// pasteboard representations (public.utf8-plain-text, public.html).

#  define EXPECT_NSEQ(actual, expected)                          \
    do {                                                         \
      NSString* _a = (actual);                                   \
      NSString* _e = (expected);                                 \
      EXPECT_TRUE(_a && [_a isEqualToString:_e])                 \
          << "Expected: " << (_e ? [_e UTF8String] : "(nil)")    \
          << "\n  Actual: " << (_a ? [_a UTF8String] : "(nil)"); \
    } while (0)

namespace {

MOZShareURLPasteboardItem* MakeItem(NSArray<NSString*>* aUrls,
                                    NSArray<NSString*>* aTitles) {
  return [[[MOZShareURLPasteboardItem alloc] initWithURLs:aUrls
                                                   titles:aTitles] autorelease];
}

}  // namespace

TEST(MOZShareURLPasteboardItem, AdvertisesTextAndHtmlOnly)
{
  @autoreleasepool {
    MOZShareURLPasteboardItem* item = MakeItem(
        @[ @"https://a.example/", @"https://b.example/" ], @[ @"A", @"B" ]);
    NSPasteboard* pboard = [NSPasteboard pasteboardWithUniqueName];
    NSArray<NSPasteboardType>* types = [item writableTypesForPasteboard:pboard];
    EXPECT_EQ(types.count, 2u);
    EXPECT_TRUE([types containsObject:NSPasteboardTypeString]);
    EXPECT_TRUE([types containsObject:NSPasteboardTypeHTML]);
    // URL-aware types must not appear, otherwise share targets that read them
    // (Reading List, etc.) would receive only the first URL.
    EXPECT_FALSE([types containsObject:kPublicUrlPboardType]);
    EXPECT_FALSE([types containsObject:kPublicUrlNamePboardType]);
    [pboard releaseGlobally];
  }
}

TEST(MOZShareURLPasteboardItem, PlainTextAlternatesTitleAndUrl)
{
  @autoreleasepool {
    MOZShareURLPasteboardItem* item = MakeItem(
        @[
          @"https://a.example/", @"https://b.example/", @"https://c.example/"
        ],
        @[ @"First", @"Second", @"Third" ]);
    NSString* expected = @"First\nhttps://a.example/\n"
                         @"Second\nhttps://b.example/\n"
                         @"Third\nhttps://c.example/";
    EXPECT_NSEQ([item pasteboardPropertyListForType:NSPasteboardTypeString],
                expected);
  }
}

TEST(MOZShareURLPasteboardItem, HtmlJoinsAnchorsWithBr)
{
  @autoreleasepool {
    MOZShareURLPasteboardItem* item = MakeItem(
        @[ @"https://a.example/", @"https://b.example/" ], @[ @"A", @"B" ]);
    // Anchors joined with "<br>\n": <br> is the visible line break in
    // rendered HTML; the "\n" is source-formatting so the raw HTML is legible
    // if any receiver logs or displays it verbatim.
    NSString* expected = @"<a href=\"https://a.example/\">A</a><br>\n"
                         @"<a href=\"https://b.example/\">B</a>";
    EXPECT_NSEQ([item pasteboardPropertyListForType:NSPasteboardTypeHTML],
                expected);
  }
}

TEST(MOZShareURLPasteboardItem, HtmlEscapesSpecialCharacters)
{
  @autoreleasepool {
    // Query strings carry unescaped `&` between parameters, and a page can
    // set a hostile title. Both must be escaped so the href parses correctly
    // and the title renders as inert text rather than markup.
    // nsAppendEscapedHTML uses &#39; for apostrophe (universally valid),
    // not &apos; (undefined in HTML4).
    MOZShareURLPasteboardItem* item = MakeItem(
        @[ @"https://example.com/?a=1&b=2", @"https://example.org/" ],
        @[ @"Cats < Dogs & \"friends\" 'etc'", @"Hi<script>evil()</script>" ]);
    NSString* html = [item pasteboardPropertyListForType:NSPasteboardTypeHTML];
    EXPECT_NSEQ(html,
                @"<a href=\"https://example.com/?a=1&amp;b=2\">"
                @"Cats &lt; Dogs &amp; &quot;friends&quot; &#39;etc&#39;</a>"
                @"<br>\n"
                @"<a href=\"https://example.org/\">"
                @"Hi&lt;script&gt;evil()&lt;/script&gt;</a>");
  }
}

TEST(MOZShareURLPasteboardItem, MissingOrEmptyTitleFallsBackToUrlInHtml)
{
  @autoreleasepool {
    // Index 1 has an empty title; index 2 has none at all because the titles
    // array is shorter than urls. Both fall back to the URL as anchor text.
    MOZShareURLPasteboardItem* item = MakeItem(
        @[ @"https://a/", @"https://b/", @"https://c/" ], @[ @"A", @"" ]);
    NSString* html = [item pasteboardPropertyListForType:NSPasteboardTypeHTML];
    EXPECT_NSEQ(html, @"<a href=\"https://a/\">A</a><br>\n"
                      @"<a href=\"https://b/\">https://b/</a><br>\n"
                      @"<a href=\"https://c/\">https://c/</a>");
  }
}

TEST(MOZShareURLPasteboardItem, EmptyOrMissingTitleSkipsPlaintextLine)
{
  @autoreleasepool {
    // Empty title in the middle (index 1) and a missing title at the end
    // (index 2). In both cases the URL still appears on its own line; no
    // stray blank line is produced.
    MOZShareURLPasteboardItem* item = MakeItem(
        @[ @"https://a/", @"https://b/", @"https://c/" ], @[ @"A", @"" ]);
    NSString* text =
        [item pasteboardPropertyListForType:NSPasteboardTypeString];
    EXPECT_NSEQ(text, @"A\nhttps://a/\nhttps://b/\nhttps://c/");
  }
}

TEST(MOZShareURLPasteboardItem, PlainTextIsNotEscaped)
{
  @autoreleasepool {
    // Plain-text receivers get raw text; escaping there would produce
    // visible entity references in Notes/Messages/etc. Only the HTML
    // representation is escaped.
    MOZShareURLPasteboardItem* item =
        MakeItem(@[ @"https://a/", @"https://b/" ], @[ @"A & B", @"<script>" ]);
    NSString* text =
        [item pasteboardPropertyListForType:NSPasteboardTypeString];
    EXPECT_NSEQ(text, @"A & B\nhttps://a/\n<script>\nhttps://b/");
  }
}

#endif  // XP_MACOSX
