/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "scoped_ptrs_util.h"

#include <climits>
#include <cstdint>
#include <vector>

#include "der_encode.h"
#include "nss.h"
#include "prerror.h"
#include "secasn1.h"
#include "secasn1t.h"
#include "secerr.h"
#include "secitem.h"
#include "secport.h"

using nss_test::Bytes;
using nss_test::Cat;
using nss_test::DerTagged;
using nss_test::OctetStr;
using nss_test::Seq;

class SECASN1DecodeTest : public ::testing::Test {};

struct Item {
  SECItem value;
};

const SEC_ASN1Template ItemTemplate[] = {
    {SEC_ASN1_SEQUENCE, 0, NULL, sizeof(struct Item)}, {0}};

static const SEC_ASN1Template ItemsTemplate[] = {
    {SEC_ASN1_SEQUENCE_OF, 0, ItemTemplate}, {0}};

struct Container {
  struct Item** items;
};

const SEC_ASN1Template ContainerTemplate[] = {
    {SEC_ASN1_SEQUENCE, 0, NULL, sizeof(struct Container)},
    {SEC_ASN1_CONSTRUCTED | SEC_ASN1_CONTEXT_SPECIFIC | SEC_ASN1_EXPLICIT | 0,
     offsetof(struct Container, items), ItemsTemplate},
    {0}};

// clang-format off
const unsigned char kEndOfContentsInDefiniteLengthContext[] = {
    0x30, 0x06,
      0xa0, 0x04,
        0x30, 0x00,
        0x00, 0x00, // EOC in definite length context
};
// clang-format on

TEST_F(SECASN1DecodeTest, EndOfContentsInDefiniteLengthContext) {
  ScopedPLArenaPool pool(PORT_NewArena(1024));
  struct Container* decoded = reinterpret_cast<struct Container*>(
      PORT_ArenaZAlloc(pool.get(), sizeof(struct Container)));
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), decoded, ContainerTemplate);
  ASSERT_TRUE(ctx);
  ASSERT_EQ(
      SEC_ASN1DecoderUpdate(
          ctx,
          reinterpret_cast<const char*>(kEndOfContentsInDefiniteLengthContext),
          sizeof(kEndOfContentsInDefiniteLengthContext)),
      SECFailure);
  ASSERT_EQ(PR_GetError(), SEC_ERROR_BAD_DER);
  ASSERT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

// clang-format off
const unsigned char kContentsTooShort[] = {
    0x30, 0x06,
      0xa0, 0x04,
        0x30, 0x00, // There should be two more bytes after this
};
// clang-format on

TEST_F(SECASN1DecodeTest, ContentsTooShort) {
  ScopedPLArenaPool pool(PORT_NewArena(1024));
  struct Container* decoded = reinterpret_cast<struct Container*>(
      PORT_ArenaZAlloc(pool.get(), sizeof(struct Container)));
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), decoded, ContainerTemplate);
  ASSERT_TRUE(ctx);
  ASSERT_EQ(SEC_ASN1DecoderUpdate(
                ctx, reinterpret_cast<const char*>(kContentsTooShort),
                sizeof(kContentsTooShort)),
            SECFailure);
  ASSERT_EQ(PR_GetError(), SEC_ERROR_BAD_DER);
  ASSERT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

static const SEC_ASN1Template kOctetStringTemplate[] = {{SEC_ASN1_OCTET_STRING},
                                                        {0}};

// A valid 11-byte OCTET STRING (tag + 1-byte length + 9 bytes content).
// clang-format off
const unsigned char kElevenByteOctetString[] = {
    0x04, 0x09,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
};
// clang-format on

// An OCTET STRING header claiming a length that exceeds
// SEC_ASN1D_MAX_INPUT_SIZE.
// clang-format off
const unsigned char kOversizedOctetStringHeader[] = {
    0x04, 0x84,              // OCTET STRING, 4-byte length field
    0x10, 0x00, 0x00, 0x01, // 0x10000001 = 268435457 > 256MB
};
// clang-format on

TEST_F(SECASN1DecodeTest, DefaultLimitRejectsOversizedElement) {
  ScopedPLArenaPool pool(PORT_NewArena(1024));
  SECItem dest = {siBuffer, nullptr, 0};
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kOctetStringTemplate);
  ASSERT_TRUE(ctx);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(kOversizedOctetStringHeader),
      sizeof(kOversizedOctetStringHeader));
  ASSERT_EQ(rv, SECFailure);
  ASSERT_EQ(PR_GetError(), SEC_ERROR_BAD_DER);
  ASSERT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, CustomLimitRejectsOversizedElement) {
  ScopedPLArenaPool pool(PORT_NewArena(1024));
  SECItem dest = {siBuffer, nullptr, 0};
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kOctetStringTemplate);
  ASSERT_TRUE(ctx);
  // Lower the limit to 8 bytes — the 11-byte string should be rejected.
  SEC_ASN1DecoderSetMaximumElementSize(ctx, 8);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(kElevenByteOctetString),
      sizeof(kElevenByteOctetString));
  ASSERT_EQ(rv, SECFailure);
  ASSERT_EQ(PR_GetError(), SEC_ERROR_BAD_DER);
  ASSERT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, ZeroLimitOptOut) {
  ScopedPLArenaPool pool(PORT_NewArena(1024));
  SECItem dest = {siBuffer, nullptr, 0};
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kOctetStringTemplate);
  ASSERT_TRUE(ctx);
  // Setting limit to 0 disables the check; the 11-byte string should succeed.
  SEC_ASN1DecoderSetMaximumElementSize(ctx, 0);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(kElevenByteOctetString),
      sizeof(kElevenByteOctetString));
  ASSERT_EQ(rv, SECSuccess);
  ASSERT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, OneShotDecodeLimitExceeded) {
  // SEC_ASN1Decode rejects input larger than SEC_ASN1D_MAX_INPUT_SIZE.
  SECItem dest = {siBuffer, nullptr, 0};
  long oversize = static_cast<long>(SEC_ASN1D_MAX_INPUT_SIZE) + 1;
  const char dummy = 0;
  SECStatus rv =
      SEC_ASN1Decode(nullptr, &dest, kOctetStringTemplate, &dummy, oversize);
  ASSERT_EQ(rv, SECFailure);
  ASSERT_EQ(PR_GetError(), SEC_ERROR_BAD_DER);
}

TEST_F(SECASN1DecodeTest, ElementSizeLimitEnforcedAcrossChunks) {
  ScopedPLArenaPool pool(PORT_NewArena(1024));
  SECItem dest = {siBuffer, nullptr, 0};
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kOctetStringTemplate);
  ASSERT_TRUE(ctx);
  // Deliver the oversized header one byte at a time to verify the limit is
  // enforced even when input arrives in small chunks.
  SECStatus rv = SECSuccess;
  for (size_t i = 0; i < sizeof(kOversizedOctetStringHeader); i++) {
    rv = SEC_ASN1DecoderUpdate(
        ctx, reinterpret_cast<const char*>(kOversizedOctetStringHeader) + i, 1);
    if (rv != SECSuccess) break;
  }
  ASSERT_EQ(rv, SECFailure);
  ASSERT_EQ(PR_GetError(), SEC_ERROR_BAD_DER);
  ASSERT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

// Template for a SEQUENCE OF SEQUENCE (each inner SEQUENCE holds one ANY).
struct TestGroupItem {
  SECItem value;
};

static const SEC_ASN1Template kTestGroupItemTemplate[] = {
    {SEC_ASN1_SEQUENCE, 0, NULL, sizeof(TestGroupItem)},
    {SEC_ASN1_ANY, offsetof(TestGroupItem, value)},
    {0}};

static const SEC_ASN1Template kTestGroupTemplate[] = {
    {SEC_ASN1_SEQUENCE_OF, 0, kTestGroupItemTemplate}, {0}};

// SET OF variant: same element type, outer tag 0x31.
static const SEC_ASN1Template kTestSetOfTemplate[] = {
    {SEC_ASN1_SET_OF, 0, kTestGroupItemTemplate}, {0}};

// Nested SEQUENCE OF: SEQUENCE OF { SEQUENCE { SEQUENCE OF { SEQUENCE { ANY }
// } } }.  Used to verify that the element-count limit is enforced per group,
// not globally.
struct NestedOuterItem {
  TestGroupItem** inner_items;
};

static const SEC_ASN1Template kNestedOuterItemTemplate[] = {
    {SEC_ASN1_SEQUENCE, 0, NULL, sizeof(NestedOuterItem)},
    {SEC_ASN1_SEQUENCE_OF, offsetof(NestedOuterItem, inner_items),
     kTestGroupItemTemplate},
    {0}};

static const SEC_ASN1Template kNestedGroupTemplate[] = {
    {SEC_ASN1_SEQUENCE_OF, 0, kNestedOuterItemTemplate}, {0}};

// |count| concatenated group elements, each SEQUENCE { OCTET STRING (1 byte) }.
static Bytes MakeGroupBody(size_t count) {
  Bytes body;
  for (size_t i = 0; i < count; i++) {
    Bytes element = Seq(OctetStr({static_cast<uint8_t>(i + 1)}));
    body.insert(body.end(), element.begin(), element.end());
  }
  return body;
}

// SEQUENCE OF |count| group elements.
static Bytes MakeGroupInput(size_t count) { return Seq(MakeGroupBody(count)); }

// SET OF |count| group elements.
static Bytes MakeSetOfInput(size_t count) {
  return DerTagged(0x31, MakeGroupBody(count));
}

// Indefinite-length SEQUENCE OF |count| group elements, terminated by EOC.
static Bytes MakeIndefiniteGroupInput(size_t count) {
  return Cat({Bytes{0x30, 0x80}, MakeGroupBody(count), Bytes{0x00, 0x00}});
}

// SEQUENCE OF |outer_count| items, each SEQUENCE { SEQUENCE OF |inner_count|
// group elements }.
static Bytes MakeNestedGroupInput(size_t outer_count, size_t inner_count) {
  Bytes outer_item = Seq(MakeGroupInput(inner_count));
  Bytes body;
  for (size_t i = 0; i < outer_count; i++) {
    body.insert(body.end(), outer_item.begin(), outer_item.end());
  }
  return Seq(body);
}

TEST_F(SECASN1DecodeTest, ElementCountLimitRejected) {
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  TestGroupItem* dest = nullptr;
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kTestGroupTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumNumberOfElements(ctx, 2);
  Bytes input = MakeGroupInput(3);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(input.data()), input.size());
  ASSERT_EQ(rv, SECFailure);
  ASSERT_EQ(PR_GetError(), SEC_ERROR_BAD_DER);
  ASSERT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, ElementCountLimitAccepted) {
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  TestGroupItem* dest = nullptr;
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kTestGroupTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumNumberOfElements(ctx, 3);
  Bytes input = MakeGroupInput(3);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(input.data()), input.size());
  ASSERT_EQ(rv, SECSuccess);
  ASSERT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, ZeroElementCountLimitDisablesCheck) {
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  TestGroupItem* dest = nullptr;
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kTestGroupTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumNumberOfElements(ctx, 0);
  Bytes input = MakeGroupInput(5);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(input.data()), input.size());
  ASSERT_EQ(rv, SECSuccess);
  ASSERT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, QuickDERGroupEnforcesElementCountLimit) {
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  void* dest = nullptr;
  Bytes input = MakeGroupInput(3);
  SECItem src = {siBuffer, input.data(),
                 static_cast<unsigned int>(input.size())};
  // Limit of 2 should reject 3 elements.
  ASSERT_EQ(SECFailure, SEC_QuickDERDecodeItemWithLimits(
                            pool.get(), &dest, kTestGroupTemplate, &src, 0, 2));
  ASSERT_EQ(SEC_ERROR_BAD_DER, PR_GetError());
}

TEST_F(SECASN1DecodeTest, QuickDERZeroMaxElementsUnlimited) {
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  void* dest = nullptr;
  Bytes input = MakeGroupInput(5);
  SECItem src = {siBuffer, input.data(),
                 static_cast<unsigned int>(input.size())};
  // Limit of 0 disables the check.
  ASSERT_EQ(SECSuccess, SEC_QuickDERDecodeItemWithLimits(
                            pool.get(), &dest, kTestGroupTemplate, &src, 0, 0));
}

TEST_F(SECASN1DecodeTest, NestedGroupLimitIsPerGroupNotCumulative) {
  // Outer: 2 elements, each containing inner: 2 elements.  Limit = 2.
  // Each individual group stays at the limit (2 <= 2), so both must succeed.
  // Total inner elements decoded = 4, which is 2× the per-group limit.
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  NestedOuterItem* dest = nullptr;
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kNestedGroupTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumNumberOfElements(ctx, 2);
  Bytes input = MakeNestedGroupInput(2, 2);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(input.data()), input.size());
  EXPECT_EQ(rv, SECSuccess);
  EXPECT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, NestedGroupOuterExceedsLimitFails) {
  // Outer: 3 elements (> limit of 2), inner: 1 element each.
  // The outer group limit must fire when the 3rd outer element completes.
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  NestedOuterItem* dest = nullptr;
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kNestedGroupTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumNumberOfElements(ctx, 2);
  Bytes input = MakeNestedGroupInput(3, 1);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(input.data()), input.size());
  EXPECT_EQ(rv, SECFailure);
  EXPECT_EQ(SEC_ERROR_BAD_DER, PR_GetError());
  EXPECT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, NestedGroupInnerExceedsLimitFails) {
  // Outer: 1 element, inner: 3 elements (> limit of 2).
  // The inner group limit must fire when the 3rd inner element completes,
  // even though the outer group is within its limit.
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  NestedOuterItem* dest = nullptr;
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kNestedGroupTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumNumberOfElements(ctx, 2);
  Bytes input = MakeNestedGroupInput(1, 3);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(input.data()), input.size());
  EXPECT_EQ(rv, SECFailure);
  EXPECT_EQ(SEC_ERROR_BAD_DER, PR_GetError());
  EXPECT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, SetOfElementCountLimitEnforced) {
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  TestGroupItem* dest = nullptr;
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kTestSetOfTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumNumberOfElements(ctx, 2);
  Bytes input = MakeSetOfInput(3);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(input.data()), input.size());
  EXPECT_EQ(rv, SECFailure);
  EXPECT_EQ(SEC_ERROR_BAD_DER, PR_GetError());
  EXPECT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, SetOfElementCountAtLimitSucceeds) {
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  TestGroupItem* dest = nullptr;
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kTestSetOfTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumNumberOfElements(ctx, 2);
  Bytes input = MakeSetOfInput(2);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(input.data()), input.size());
  EXPECT_EQ(rv, SECSuccess);
  EXPECT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, IndefiniteLengthGroupElementCountLimitEnforced) {
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  TestGroupItem* dest = nullptr;
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kTestGroupTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumNumberOfElements(ctx, 2);
  Bytes input = MakeIndefiniteGroupInput(3);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(input.data()), input.size());
  EXPECT_EQ(rv, SECFailure);
  EXPECT_EQ(SEC_ERROR_BAD_DER, PR_GetError());
  EXPECT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, IndefiniteLengthGroupExactLimitSucceeds) {
  // Exactly max_elements items in an indefinite-length group must succeed;
  // the EOC terminator must not itself be counted as an element.
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  TestGroupItem* dest = nullptr;
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kTestGroupTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumNumberOfElements(ctx, 2);
  Bytes input = MakeIndefiniteGroupInput(2);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(input.data()), input.size());
  EXPECT_EQ(rv, SECSuccess);
  EXPECT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, ElementSizeCheckDoesNotApplyToSequenceContainer) {
  // SEQUENCE { OCTET STRING(5 bytes) } — total TLV is 9 bytes.
  // Set max_element_size = 7 (larger than the OCTET STRING content of 5, but
  // smaller than the outer SEQUENCE TLV span of 9).  The SEQUENCE container
  // itself is not size-checked, so this decode must succeed.
  // clang-format off
  static const uint8_t kInput[] = {
      0x30, 0x07,              // SEQUENCE, length 7
      0x04, 0x05,              // OCTET STRING, length 5
      0x01, 0x02, 0x03, 0x04, 0x05,
  };
  // clang-format on
  static const SEC_ASN1Template kSeqTemplate[] = {
      {SEC_ASN1_SEQUENCE, 0, NULL, sizeof(SECItem)},
      {SEC_ASN1_OCTET_STRING, 0},
      {0}};
  ScopedPLArenaPool pool(PORT_NewArena(1024));
  SECItem dest = {siBuffer, nullptr, 0};
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kSeqTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumElementSize(ctx, 7);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(kInput), sizeof(kInput));
  EXPECT_EQ(rv, SECSuccess);
  EXPECT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, ElementSizeCheckAppliesInsideSequenceContainer) {
  // Same SEQUENCE, but max_element_size = 4 — the inner OCTET STRING has
  // 5 bytes of content which exceeds the limit.  The leaf check must fire
  // even though the leaf is inside a SEQUENCE wrapper.
  // clang-format off
  static const uint8_t kInput[] = {
      0x30, 0x07,
      0x04, 0x05,
      0x01, 0x02, 0x03, 0x04, 0x05,
  };
  // clang-format on
  static const SEC_ASN1Template kSeqTemplate[] = {
      {SEC_ASN1_SEQUENCE, 0, NULL, sizeof(SECItem)},
      {SEC_ASN1_OCTET_STRING, 0},
      {0}};
  ScopedPLArenaPool pool(PORT_NewArena(1024));
  SECItem dest = {siBuffer, nullptr, 0};
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kSeqTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumElementSize(ctx, 4);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(kInput), sizeof(kInput));
  EXPECT_EQ(rv, SECFailure);
  EXPECT_EQ(SEC_ERROR_BAD_DER, PR_GetError());
  EXPECT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, QuickDERNestedGroupLimitIsPerGroupNotCumulative) {
  // Same multiplicative-nesting check for the QuickDER path: outer=2,
  // inner=2, limit=2.  Each group stays at the limit, so both succeed.
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  void* dest = nullptr;
  Bytes input = MakeNestedGroupInput(2, 2);
  SECItem src = {siBuffer, input.data(),
                 static_cast<unsigned int>(input.size())};
  EXPECT_EQ(SECSuccess,
            SEC_QuickDERDecodeItemWithLimits(pool.get(), &dest,
                                             kNestedGroupTemplate, &src, 0, 2));
}

TEST_F(SECASN1DecodeTest, QuickDERNestedGroupOuterExceedsLimitFails) {
  // Outer=3 (> limit 2), inner=1: the outer group check must fire.
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  void* dest = nullptr;
  Bytes input = MakeNestedGroupInput(3, 1);
  SECItem src = {siBuffer, input.data(),
                 static_cast<unsigned int>(input.size())};
  EXPECT_EQ(SECFailure,
            SEC_QuickDERDecodeItemWithLimits(pool.get(), &dest,
                                             kNestedGroupTemplate, &src, 0, 2));
  EXPECT_EQ(SEC_ERROR_BAD_DER, PR_GetError());
}

TEST_F(SECASN1DecodeTest, QuickDERNestedGroupInnerExceedsLimitFails) {
  // Outer=1, inner=3 (> limit 2): the inner group check must fire even though
  // the outer group itself would pass.
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  void* dest = nullptr;
  Bytes input = MakeNestedGroupInput(1, 3);
  SECItem src = {siBuffer, input.data(),
                 static_cast<unsigned int>(input.size())};
  EXPECT_EQ(SECFailure,
            SEC_QuickDERDecodeItemWithLimits(pool.get(), &dest,
                                             kNestedGroupTemplate, &src, 0, 2));
  EXPECT_EQ(SEC_ERROR_BAD_DER, PR_GetError());
}

TEST_F(SECASN1DecodeTest, QuickDERSetOfElementCountLimitEnforced) {
  // SET OF (tag 0x31) must go through DecodeGroup and honour max_elements.
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  void* dest = nullptr;
  Bytes input = MakeSetOfInput(3);
  SECItem src = {siBuffer, input.data(),
                 static_cast<unsigned int>(input.size())};
  EXPECT_EQ(SECFailure, SEC_QuickDERDecodeItemWithLimits(
                            pool.get(), &dest, kTestSetOfTemplate, &src, 0, 2));
  EXPECT_EQ(SEC_ERROR_BAD_DER, PR_GetError());
}

TEST_F(SECASN1DecodeTest, QuickDERSetOfElementCountAtLimitSucceeds) {
  ScopedPLArenaPool pool(PORT_NewArena(4096));
  void* dest = nullptr;
  Bytes input = MakeSetOfInput(2);
  SECItem src = {siBuffer, input.data(),
                 static_cast<unsigned int>(input.size())};
  EXPECT_EQ(SECSuccess, SEC_QuickDERDecodeItemWithLimits(
                            pool.get(), &dest, kTestSetOfTemplate, &src, 0, 2));
}

TEST_F(SECASN1DecodeTest, StreamingDecoderRejectsInputExceedingMaxInputSize) {
  // clang-format off
  static const uint8_t kInput[] = {
      0x30, 0x06,
      0x04, 0x04,
      0x01, 0x02, 0x03, 0x04,
  };
  // clang-format on
  static const SEC_ASN1Template kSeqTemplate[] = {
      {SEC_ASN1_SEQUENCE, 0, NULL, sizeof(SECItem)},
      {SEC_ASN1_OCTET_STRING, 0},
      {0}};
  ScopedPLArenaPool pool(PORT_NewArena(1024));
  SECItem dest = {siBuffer, nullptr, 0};
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kSeqTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumInputSize(ctx, 4);
  SECStatus rv =
      SEC_ASN1DecoderUpdate(ctx, reinterpret_cast<const char*>(kInput), 4);
  EXPECT_EQ(rv, SECSuccess);
  rv = SEC_ASN1DecoderUpdate(ctx, reinterpret_cast<const char*>(kInput + 4), 4);
  EXPECT_EQ(rv, SECFailure);
  EXPECT_EQ(SEC_ERROR_BAD_DER, PR_GetError());
  SEC_ASN1DecoderFinish(ctx);
}

TEST_F(SECASN1DecodeTest, StreamingDecoderAcceptsInputWithinMaxInputSize) {
  // clang-format off
  static const uint8_t kInput[] = {
      0x30, 0x06,
      0x04, 0x04,
      0x01, 0x02, 0x03, 0x04,
  };
  // clang-format on
  static const SEC_ASN1Template kSeqTemplate[] = {
      {SEC_ASN1_SEQUENCE, 0, NULL, sizeof(SECItem)},
      {SEC_ASN1_OCTET_STRING, 0},
      {0}};
  ScopedPLArenaPool pool(PORT_NewArena(1024));
  SECItem dest = {siBuffer, nullptr, 0};
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kSeqTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumInputSize(ctx, sizeof(kInput));
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(kInput), sizeof(kInput));
  EXPECT_EQ(rv, SECSuccess);
  EXPECT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

TEST_F(SECASN1DecodeTest, StreamingDecoderInputSizeLimitCanBeDisabled) {
  // clang-format off
  static const uint8_t kInput[] = {
      0x30, 0x06,
      0x04, 0x04,
      0x01, 0x02, 0x03, 0x04,
  };
  // clang-format on
  static const SEC_ASN1Template kSeqTemplate[] = {
      {SEC_ASN1_SEQUENCE, 0, NULL, sizeof(SECItem)},
      {SEC_ASN1_OCTET_STRING, 0},
      {0}};
  ScopedPLArenaPool pool(PORT_NewArena(1024));
  SECItem dest = {siBuffer, nullptr, 0};
  SEC_ASN1DecoderContext* ctx =
      SEC_ASN1DecoderStart(pool.get(), &dest, kSeqTemplate);
  ASSERT_TRUE(ctx);
  SEC_ASN1DecoderSetMaximumInputSize(ctx, 0);
  SECStatus rv = SEC_ASN1DecoderUpdate(
      ctx, reinterpret_cast<const char*>(kInput), sizeof(kInput));
  EXPECT_EQ(rv, SECSuccess);
  EXPECT_EQ(SECSuccess, SEC_ASN1DecoderFinish(ctx));
}

// clang-format off
const unsigned char kNestedConstructedOctetString[] = {
    0x24, 0x80,             // indefinite-length constructed OCTET STRING
      0x24, 0x03,           // definite-length constructed OCTET STRING
        0x04, 0x01, 0x41,
      0x00, 0x00,
};

const unsigned char kSplitConstructedOctetString[] = {
    0x24, 0x80,             // indefinite-length constructed OCTET STRING
      0x04, 0x01, 0x41,
      0x04, 0x01, 0x42,
      0x00, 0x00,
};

const unsigned char kNestedIndefiniteOctetString[] = {
    0x24, 0x80,             // indefinite-length constructed OCTET STRING
      0x24, 0x80,           // indefinite-length constructed OCTET STRING
        0x04, 0x01, 0x41,
      0x00, 0x00,
      0x04, 0x01, 0x42,
      0x00, 0x00,
};

const unsigned char kNestedIndefiniteOctetStringWithBadSubstring[] = {
    0x24, 0x80,             // indefinite-length constructed OCTET STRING
      0x24, 0x80,           // indefinite-length constructed OCTET STRING
        0x04, 0x01, 0x41,
      0x00, 0x00,
      0x02, 0x01, 0x00,     // INTEGER is not a valid substring
      0x00, 0x00,
};

const unsigned char kConstructedOctetStringWithBadSubstring[] = {
    0x24, 0x80,             // indefinite-length constructed OCTET STRING
      0x24, 0x03,           // definite-length constructed OCTET STRING
        0x02, 0x01, 0x00,   // INTEGER is not a valid substring
      0x00, 0x00,
};
// clang-format on

// Decoding without an arena is supported, so the caller owns and frees the
// output. Anything the decoder leaves behind must therefore be safe to pass to
// SECITEM_FreeItem, whether the decode succeeded or failed.

TEST_F(SECASN1DecodeTest, NoArenaNestedConstructedOctetString) {
  SECItem input = {siBuffer,
                   const_cast<unsigned char*>(kNestedConstructedOctetString),
                   sizeof(kNestedConstructedOctetString)};
  SECItem output = {siBuffer, nullptr, 0};
  ASSERT_EQ(SECSuccess,
            SEC_ASN1DecodeItem(nullptr, &output,
                               SEC_ASN1_GET(SEC_OctetStringTemplate), &input));
  EXPECT_EQ(1U, output.len);
  ASSERT_NE(nullptr, output.data);
  EXPECT_EQ(0x41, output.data[0]);
  SECITEM_FreeItem(&output, PR_FALSE);
}

TEST_F(SECASN1DecodeTest, NoArenaSplitConstructedOctetString) {
  SECItem input = {siBuffer,
                   const_cast<unsigned char*>(kSplitConstructedOctetString),
                   sizeof(kSplitConstructedOctetString)};
  SECItem output = {siBuffer, nullptr, 0};
  ASSERT_EQ(SECSuccess,
            SEC_ASN1DecodeItem(nullptr, &output,
                               SEC_ASN1_GET(SEC_OctetStringTemplate), &input));
  ASSERT_EQ(2U, output.len);
  ASSERT_NE(nullptr, output.data);
  EXPECT_EQ(0x41, output.data[0]);
  EXPECT_EQ(0x42, output.data[1]);
  SECITEM_FreeItem(&output, PR_FALSE);
}

TEST_F(SECASN1DecodeTest, NoArenaNestedIndefiniteOctetString) {
  SECItem input = {siBuffer,
                   const_cast<unsigned char*>(kNestedIndefiniteOctetString),
                   sizeof(kNestedIndefiniteOctetString)};
  SECItem output = {siBuffer, nullptr, 0};
  ASSERT_EQ(SECSuccess,
            SEC_ASN1DecodeItem(nullptr, &output,
                               SEC_ASN1_GET(SEC_OctetStringTemplate), &input));
  ASSERT_EQ(2U, output.len);
  ASSERT_NE(nullptr, output.data);
  EXPECT_EQ(0x41, output.data[0]);
  EXPECT_EQ(0x42, output.data[1]);
  SECITEM_FreeItem(&output, PR_FALSE);
}

TEST_F(SECASN1DecodeTest, NoArenaNestedIndefiniteOctetStringFailure) {
  SECItem input = {
      siBuffer,
      const_cast<unsigned char*>(kNestedIndefiniteOctetStringWithBadSubstring),
      sizeof(kNestedIndefiniteOctetStringWithBadSubstring)};
  SECItem output = {siBuffer, nullptr, 0};
  ASSERT_EQ(SECFailure,
            SEC_ASN1DecodeItem(nullptr, &output,
                               SEC_ASN1_GET(SEC_OctetStringTemplate), &input));
  EXPECT_EQ(nullptr, output.data);
  EXPECT_EQ(0U, output.len);
  SECITEM_FreeItem(&output, PR_FALSE);
}

TEST_F(SECASN1DecodeTest, NoArenaConstructedOctetStringFailure) {
  SECItem input = {
      siBuffer,
      const_cast<unsigned char*>(kConstructedOctetStringWithBadSubstring),
      sizeof(kConstructedOctetStringWithBadSubstring)};
  SECItem output = {siBuffer, nullptr, 0};
  ASSERT_EQ(SECFailure,
            SEC_ASN1DecodeItem(nullptr, &output,
                               SEC_ASN1_GET(SEC_OctetStringTemplate), &input));
  EXPECT_EQ(nullptr, output.data);
  EXPECT_EQ(0U, output.len);
  SECITEM_FreeItem(&output, PR_FALSE);
}
