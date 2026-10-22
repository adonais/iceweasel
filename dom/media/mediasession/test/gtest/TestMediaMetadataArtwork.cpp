/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <initializer_list>

#include "MediaMetadata.h"
#include "gtest/gtest.h"
#include "nsString.h"

using mozilla::dom::GetMediaArtworkArea;
using mozilla::dom::GetMediaArtworkFetchOrder;
using mozilla::dom::kAnyArtworkArea;
using mozilla::dom::kMaxArtworkDimension;
using mozilla::dom::MediaImageData;
using mozilla::dom::MediaMetadataBase;

TEST(MediaMetadataArtwork, Area)
{
  nsString sizes;
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));

  // "any" indicates scalable/vector artwork and is given highest priority.
  sizes.AssignLiteral(u"any");
  EXPECT_EQ(kAnyArtworkArea, GetMediaArtworkArea(sizes));

  sizes.AssignLiteral(u"ANY");
  EXPECT_EQ(kAnyArtworkArea, GetMediaArtworkArea(sizes));

  sizes.AssignLiteral(u"60x60");
  EXPECT_EQ(int64_t(3600), GetMediaArtworkArea(sizes));

  sizes.AssignLiteral(u"544X544");
  EXPECT_EQ(int64_t(544) * 544, GetMediaArtworkArea(sizes));

  // Largest of several wins.
  sizes.AssignLiteral(u"60x60 120x120 226x226 544x544");
  EXPECT_EQ(int64_t(544) * 544, GetMediaArtworkArea(sizes));

  // Area, not width, decides.
  sizes.AssignLiteral(u"500x50 200x200");
  EXPECT_EQ(int64_t(40000), GetMediaArtworkArea(sizes));

  // Garbage entries are skipped.
  sizes.AssignLiteral(u"foo 120x120");
  EXPECT_EQ(int64_t(14400), GetMediaArtworkArea(sizes));

  // Degenerate dimensions.
  sizes.AssignLiteral(u"0x10");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));
  sizes.AssignLiteral(u"60x0");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));
  sizes.AssignLiteral(u"-10x10");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));
  sizes.AssignLiteral(u"60x");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));
  sizes.AssignLiteral(u"x60");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));

  // Extra whitespace is fine, including tabs and newlines.
  sizes.AssignLiteral(u"  60x60 \t 120x120\n ");
  EXPECT_EQ(int64_t(14400), GetMediaArtworkArea(sizes));
  sizes.AssignLiteral(u" \t\n ");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));

  // Comma-separated sizes are not valid entries.
  sizes.AssignLiteral(u"60x60,120x120");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));

  // Trailing junk disqualifies the entry.
  sizes.AssignLiteral(u"60x60abc");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));
  sizes.AssignLiteral(u"60x60px");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));

  // Valid dimensions up to 1K (1024x1024).
  sizes.AssignLiteral(u"1024x1024");
  EXPECT_EQ(int64_t(1024) * 1024, GetMediaArtworkArea(sizes));

  // Dimensions exceeding 1K (1024) are rejected.
  sizes.AssignLiteral(u"1025x1025");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));
  sizes.AssignLiteral(u"100000x100000");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));
  sizes.AssignLiteral(u"2147483647x1");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));

  // Overflow is rejected.
  sizes.AssignLiteral(u"9999999999x9999999999");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));
  sizes.AssignLiteral(u"2147483648x1");
  EXPECT_EQ(int64_t(0), GetMediaArtworkArea(sizes));

  // "any" wins over fixed dimensions within the same sizes attribute.
  sizes.AssignLiteral(u"any 60x60");
  EXPECT_EQ(kAnyArtworkArea, GetMediaArtworkArea(sizes));
  sizes.AssignLiteral(u"60x60 any");
  EXPECT_EQ(kAnyArtworkArea, GetMediaArtworkArea(sizes));

  // Uppercase X in multi-token input.
  sizes.AssignLiteral(u"60X60 120X120");
  EXPECT_EQ(int64_t(14400), GetMediaArtworkArea(sizes));
}

namespace {

MediaMetadataBase MakeArtwork(std::initializer_list<const char16_t*> aSizes) {
  MediaMetadataBase data;
  for (const char16_t* sizes : aSizes) {
    MediaImageData image;
    image.mSizes.Assign(sizes);
    image.mSrc.AssignLiteral(u"https://example.com/art");
    image.mSrc.AppendInt(int32_t(data.mArtwork.Length()));
    data.mArtwork.AppendElement(image);
  }
  return data;
}

}  // namespace

TEST(MediaMetadataArtwork, FetchOrderLargestFirst)
{
  MediaMetadataBase data =
      MakeArtwork({u"60x60", u"120x120", u"226x226", u"544x544"});
  CopyableTArray<size_t> order = GetMediaArtworkFetchOrder(data);
  ASSERT_EQ(4u, order.Length());
  EXPECT_EQ(3u, order[0]);
  EXPECT_EQ(2u, order[1]);
  EXPECT_EQ(1u, order[2]);
  EXPECT_EQ(0u, order[3]);
}

TEST(MediaMetadataArtwork, FetchOrderAnySelectedFirst)
{
  MediaMetadataBase data =
      MakeArtwork({u"60x60", u"any", u"544x544", u"invalid"});
  CopyableTArray<size_t> order = GetMediaArtworkFetchOrder(data);
  // "any" is highest priority (scalable/vector), followed by largest area
  // (544x544), then 60x60, and finally unparseable/missing sizes in page order.
  ASSERT_EQ(4u, order.Length());
  EXPECT_EQ(1u, order[0]);  // any
  EXPECT_EQ(2u, order[1]);  // 544x544
  EXPECT_EQ(0u, order[2]);  // 60x60
  EXPECT_EQ(3u, order[3]);  // invalid
}

TEST(MediaMetadataArtwork, FetchOrderMultipleAnyKeepsPageOrder)
{
  MediaMetadataBase data = MakeArtwork({u"any", u"544x544", u"ANY"});
  CopyableTArray<size_t> order = GetMediaArtworkFetchOrder(data);
  // Both "any" artworks sort first, preserving page order between each other.
  ASSERT_EQ(3u, order.Length());
  EXPECT_EQ(0u, order[0]);  // any (first)
  EXPECT_EQ(2u, order[1]);  // ANY (second)
  EXPECT_EQ(1u, order[2]);  // 544x544
}

TEST(MediaMetadataArtwork, FetchOrderUnknownKeepsPageOrder)
{
  MediaMetadataBase data = MakeArtwork({u"", u"invalid", u"60x60"});
  CopyableTArray<size_t> order = GetMediaArtworkFetchOrder(data);
  ASSERT_EQ(3u, order.Length());
  EXPECT_EQ(2u, order[0]);
  EXPECT_EQ(0u, order[1]);
  EXPECT_EQ(1u, order[2]);
}

TEST(MediaMetadataArtwork, FetchOrderTiedAreasKeepPageOrder)
{
  MediaMetadataBase data = MakeArtwork({u"120x120", u"60x60", u"120x120"});
  CopyableTArray<size_t> order = GetMediaArtworkFetchOrder(data);
  ASSERT_EQ(3u, order.Length());
  EXPECT_EQ(0u, order[0]);
  EXPECT_EQ(2u, order[1]);
  EXPECT_EQ(1u, order[2]);
}

TEST(MediaMetadataArtwork, FetchOrderEmpty)
{
  MediaMetadataBase data;
  CopyableTArray<size_t> order = GetMediaArtworkFetchOrder(data);
  EXPECT_EQ(0u, order.Length());
}
