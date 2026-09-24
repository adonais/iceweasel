/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/CollectorLogAnalyzer.h"
#include "mozilla/CollectorLogAnalyzerBackground.h"
#include "mozilla/RefPtr.h"

namespace mozilla {

namespace CollectorLogAnalyzerTestUtils {

// Mirrors CollectorNodeFlags from CollectorLogAnalyzer.webidl
static constexpr uint8_t FLAG_GARBAGE = 0x01;
static constexpr uint8_t FLAG_INCREMENTAL_ROOT = 0x02;
static constexpr uint8_t FLAG_ROOT = 0x04;
static constexpr uint8_t FLAG_SOFT_ROOT = 0x08;
static constexpr uint8_t FLAG_CC_MANAGED = 0x10;
static constexpr uint8_t FLAG_GC_MARKED = 0x20;
static constexpr uint8_t FLAG_GC_GRAY = 0x40;

struct TestNode {
  uint64_t mPtr;
  nsDependentCString mLabel;
  uint8_t mFlags;
  int32_t mReferenceCount;  // -1 if not CC-managed
  size_t mIndex;
};

struct TestEdge {
  size_t mFromIndex;
  size_t mToIndex;
  nsDependentCString mLabel;
};

struct ParseResult {
  bool mSuccess = false;
  nsCString mError;
  nsTArray<TestNode> mNodes;
  nsTArray<TestEdge> mEdges;
  nsTArray<size_t> mCCRootIndices;
  nsTArray<size_t> mCCSoftRootIndices;
  nsTArray<size_t> mGCRootIndices;
  nsTArray<size_t> mGCGrayRootIndices;

  // To hold the string references alive
  RefPtr<CollectorLogAnalyzerBackground> mBackground;
};

}  // namespace CollectorLogAnalyzerTestUtils

class CollectorLogAnalyzerTestHelper {
 public:
  static RefPtr<CollectorLogAnalyzerBackground> InitBackground(
      bool aHaveCC, const nsACString& aCCBuf, bool aHaveGC,
      const nsACString& aGCBuf, nsCString* aOutError = nullptr) {
    auto bg = MakeRefPtr<CollectorLogAnalyzerBackground>();
    bg->mHaveCC = aHaveCC;
    bg->mHaveGC = aHaveGC;
    if (aHaveCC) {
      bg->mCCFileSize = aCCBuf.Length();
      auto rv =
          bg->IngestCycleCollectorLog(aCCBuf, /* aContainsFileEnd */ true);
      if (rv.isErr()) {
        if (aOutError) *aOutError = rv.unwrapErr().Message();
        return nullptr;
      }
    }
    if (aHaveGC) {
      bg->mGCFileSize = aGCBuf.Length();
      auto rv =
          bg->IngestGarbageCollectorLog(aGCBuf, /* aContainsFileEnd */ true);
      if (rv.isErr()) {
        if (aOutError) *aOutError = rv.unwrapErr().Message();
        return nullptr;
      }
    }
    auto rv = bg->FinishInitialization();
    if (rv.isErr()) {
      if (aOutError) *aOutError = rv.unwrapErr().Message();
      return nullptr;
    }
    return bg;
  }

  static Result<nsTArray<dom::CollectorLogNode>, LogError> QueryNodes(
      CollectorLogAnalyzerBackground* aBg, const nsCString& aQuery) {
    return aBg->QueryNodesImpl(aQuery);
  }

  static Result<nsTArray<dom::CollectorLogNode>, LogError> SampleNodes(
      CollectorLogAnalyzerBackground* aBg) {
    return aBg->SampleNodesImpl();
  }

  static Result<dom::CollectorLogNodeAdjacents, LogError> GetNodeAdjacents(
      CollectorLogAnalyzerBackground* aBg, NodeTableIndex aIndex) {
    return aBg->GetNodeAdjacentsImpl(aIndex);
  }

  static Result<dom::CollectorLogRootPath, LogError> GetPathToRoot(
      CollectorLogAnalyzerBackground* aBg, NodeTableIndex aIndex) {
    return aBg->GetPathToRootImpl(aIndex);
  }

  static CollectorLogAnalyzerTestUtils::ParseResult ParseFromBuffers(
      bool aHaveCC, const nsACString& aCCBuf, bool aHaveGC,
      const nsACString& aGCBuf) {
    CollectorLogAnalyzerTestUtils::ParseResult result;
    auto bg = MakeRefPtr<CollectorLogAnalyzerBackground>();
    result.mBackground = bg;
    bg->mHaveCC = aHaveCC;
    bg->mHaveGC = aHaveGC;
    if (aHaveCC) {
      bg->mCCFileSize = aCCBuf.Length();
      auto rv =
          bg->IngestCycleCollectorLog(aCCBuf, /* aContainsFileEnd */ true);
      if (rv.isErr()) {
        result.mError = rv.unwrapErr().Message();
        return result;
      }
    }
    if (aHaveGC) {
      bg->mGCFileSize = aGCBuf.Length();
      auto rv =
          bg->IngestGarbageCollectorLog(aGCBuf, /* aContainsFileEnd */ true);
      if (rv.isErr()) {
        result.mError = rv.unwrapErr().Message();
        return result;
      }
    }
    auto rv = bg->FinishInitialization();
    if (rv.isErr()) {
      result.mError = rv.unwrapErr().Message();
      return result;
    }

    for (NodeTableIndex i = 0; i < bg->mNodeLabels.length(); ++i) {
      CollectorLogAnalyzerTestUtils::TestNode node;
      node.mPtr = bg->mNodeIds[i];
      node.mFlags = bg->mNodeFlags[i];
      auto rcPtr = bg->mCCReferenceCounts.lookup(i);
      node.mReferenceCount = rcPtr ? int32_t(rcPtr->value()) : -1;
      node.mIndex = i;

      if (bg->mNodeLabels[i] != INVALID_STRING) {
        node.mLabel.Rebind(&bg->mStrings[bg->mNodeLabels[i]]);
      }

      result.mNodes.AppendElement(std::move(node));
    }

    for (NodeTableIndex i = 0; i < bg->mNodeEdges.length(); ++i) {
      const NodeEdgesDescriptor& edges = bg->mNodeEdges[i];
      for (size_t j = 0; j < edges.mCCCount; j++) {
        CollectorLogAnalyzerTestUtils::TestEdge edge;
        edge.mFromIndex = i;
        edge.mToIndex = bg->mEdges[edges.mCC + j];
        edge.mLabel.Rebind(&bg->mStrings[bg->mEdgeLabels[edges.mCC + j]]);
        result.mEdges.AppendElement(std::move(edge));
      }
      for (size_t j = 0; j < edges.mGCCount; j++) {
        CollectorLogAnalyzerTestUtils::TestEdge edge;
        edge.mFromIndex = i;
        edge.mToIndex = bg->mEdges[edges.mGC + j];
        edge.mLabel.Rebind(&bg->mStrings[bg->mEdgeLabels[edges.mGC + j]]);
        result.mEdges.AppendElement(std::move(edge));
      }
    }

    for (NodeTableIndex idx : bg->mCCRoots) {
      result.mCCRootIndices.AppendElement(idx);
    }
    for (NodeTableIndex idx : bg->mCCSoftRoots) {
      result.mCCSoftRootIndices.AppendElement(idx);
    }
    for (NodeTableIndex idx : bg->mGCRoots) {
      result.mGCRootIndices.AppendElement(idx);
    }
    for (NodeTableIndex idx : bg->mGCGrayRoots) {
      result.mGCGrayRootIndices.AppendElement(idx);
    }

    result.mSuccess = true;
    return result;
  }
};

namespace CollectorLogAnalyzerTestUtils {

ParseResult ParseCCLog(const nsACString& aLog) {
  return CollectorLogAnalyzerTestHelper::ParseFromBuffers(
      /* aHaveCC */ true, aLog, /* aHaveGC */ false, EmptyCString());
}

ParseResult ParseGCLog(const nsACString& aLog) {
  return CollectorLogAnalyzerTestHelper::ParseFromBuffers(
      /* aHaveCC */ false, EmptyCString(), /* aHaveGC */ true, aLog);
}

ParseResult ParseBothLogs(const nsACString& aCCLog, const nsACString& aGCLog) {
  return CollectorLogAnalyzerTestHelper::ParseFromBuffers(
      /* aHaveCC */ true, aCCLog, /* aHaveGC */ true, aGCLog);
}

}  // namespace CollectorLogAnalyzerTestUtils

}  // namespace mozilla

using namespace mozilla::CollectorLogAnalyzerTestUtils;
using mozilla::CollectorLogAnalyzerBackground;
using mozilla::CollectorLogAnalyzerTestHelper;
using namespace mozilla::dom;

static RefPtr<CollectorLogAnalyzerBackground> InitCCAnalyzer(
    const nsACString& aLog) {
  return CollectorLogAnalyzerTestHelper::InitBackground(
      /* aHaveCC */ true, aLog, /* aHaveGC */ false, EmptyCString());
}

static RefPtr<CollectorLogAnalyzerBackground> InitBothAnalyzer(
    const nsACString& aCCLog, const nsACString& aGCLog) {
  return CollectorLogAnalyzerTestHelper::InitBackground(
      /* aHaveCC */ true, aCCLog, /* aHaveGC */ true, aGCLog);
}

static const mozilla::dom::CollectorLogNode* FindResultNodeByLabel(
    const nsTArray<mozilla::dom::CollectorLogNode>& aNodes,
    const nsACString& aLabel) {
  for (const auto& node : aNodes) {
    if (node.mLabel.Equals(aLabel)) {
      return &node;
    }
  }
  return nullptr;
}

static const TestNode* FindNodeByLabel(const ParseResult& aResult,
                                       const nsACString& aLabel) {
  for (const TestNode& node : aResult.mNodes) {
    if (node.mLabel.Equals(aLabel)) {
      return &node;
    }
  }
  return nullptr;
}

static const TestNode* FindNodeByPtr(const ParseResult& aResult,
                                     uint64_t aPtr) {
  for (const TestNode& node : aResult.mNodes) {
    if (node.mPtr == aPtr) {
      return &node;
    }
  }
  return nullptr;
}

static bool HasEdge(const ParseResult& aResult, size_t aFromIndex,
                    size_t aToIndex) {
  for (const TestEdge& edge : aResult.mEdges) {
    if (edge.mFromIndex == aFromIndex && edge.mToIndex == aToIndex) {
      return true;
    }
  }
  return false;
}

static bool HasEdgeWithLabel(const ParseResult& aResult, size_t aFromIndex,
                             size_t aToIndex, const nsACString& aLabel) {
  for (const TestEdge& edge : aResult.mEdges) {
    if (edge.mFromIndex == aFromIndex && edge.mToIndex == aToIndex &&
        edge.mLabel.Equals(aLabel)) {
      return true;
    }
  }
  return false;
}

// --- CC log tests ---

TEST(CollectorLogLoading, CCEmptyLog)
{
  // A CC log with only the section separator is valid but produces no nodes.
  auto result = ParseCCLog("==========\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mNodes.Length(), 0u);
  EXPECT_EQ(result.mEdges.Length(), 0u);
}

TEST(CollectorLogLoading, CCCommentLinesSkipped)
{
  auto result = ParseCCLog(
      "# This is a comment\n"
      "# Another comment\n"
      "==========\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mNodes.Length(), 0u);
}

TEST(CollectorLogLoading, CCSingleRCNode)
{
  auto result = ParseCCLog(
      "0x1000 [rc=3] nsDocument\n"
      "==========\n"
      "0x1000 [known=2]\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  ASSERT_EQ(result.mNodes.Length(), 1u);

  const TestNode* node = FindNodeByLabel(result, "nsDocument"_ns);
  ASSERT_NE(node, nullptr);
  EXPECT_EQ(node->mPtr, uint64_t(0x1000));
  EXPECT_EQ(node->mReferenceCount, 3);
  EXPECT_TRUE(node->mFlags & FLAG_CC_MANAGED);
  EXPECT_TRUE(node->mFlags & FLAG_ROOT);
}

TEST(CollectorLogLoading, CCGarbageNode)
{
  auto result = ParseCCLog(
      "0x2000 [rc=1] nsWindow\n"
      "==========\n"
      "0x2000 [garbage]\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  ASSERT_EQ(result.mNodes.Length(), 1u);

  const TestNode* node = FindNodeByPtr(result, 0x2000);
  ASSERT_NE(node, nullptr);
  EXPECT_TRUE(node->mFlags & FLAG_GARBAGE);
  EXPECT_FALSE(node->mFlags & FLAG_ROOT);
}

TEST(CollectorLogLoading, CCNodeWithEdges)
{
  auto result = ParseCCLog(
      "0x1000 [rc=2] nsDocument\n"
      "> 0xDEADBEEF mWindow\n"
      "> 0xDEADBEEF01010101 mChild\n"
      "0xDEADBEEF [rc=1] nsWindow\n"
      "0xDEADBEEF01010101 [rc=1] nsElement\n"
      "==========\n"
      "0x1000 [known=1]\n"
      "0xDEADBEEF [known=1]\n"
      "0xDEADBEEF01010101 [known=1]\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mNodes.Length(), 3u);
  EXPECT_EQ(result.mEdges.Length(), 2u);

  const TestNode* doc = FindNodeByLabel(result, "nsDocument"_ns);
  const TestNode* win = FindNodeByLabel(result, "nsWindow"_ns);
  const TestNode* elem = FindNodeByLabel(result, "nsElement"_ns);
  ASSERT_NE(doc, nullptr);
  ASSERT_NE(win, nullptr);
  ASSERT_NE(elem, nullptr);

  EXPECT_TRUE(HasEdgeWithLabel(result, doc->mIndex, win->mIndex, "mWindow"_ns));
  EXPECT_TRUE(HasEdgeWithLabel(result, doc->mIndex, elem->mIndex, "mChild"_ns));
}

TEST(CollectorLogLoading, CCGCThingMarked)
{
  // GC things appear in CC log as [gc.marked] or [gc]
  auto result = ParseCCLog(
      "0x5000 [gc.marked] JSObject\n"
      "0x6000 [gc] JSFunction\n"
      "==========\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mNodes.Length(), 2u);

  const TestNode* obj = FindNodeByLabel(result, "JSObject"_ns);
  const TestNode* func = FindNodeByLabel(result, "JSFunction"_ns);
  ASSERT_NE(obj, nullptr);
  ASSERT_NE(func, nullptr);
  EXPECT_TRUE(obj->mFlags & FLAG_GC_MARKED);
  EXPECT_TRUE(func->mFlags & FLAG_GC_MARKED);
  EXPECT_TRUE(func->mFlags & FLAG_GC_GRAY);
  EXPECT_FALSE(obj->mFlags & FLAG_CC_MANAGED);
}

TEST(CollectorLogLoading, CCIncrementalRoot)
{
  auto result = ParseCCLog(
      "IncrementalRoot 0xABCD\n"
      "==========\n"_ns);
  EXPECT_TRUE(result.mSuccess);
  ASSERT_EQ(result.mNodes.Length(), 1u);
  EXPECT_TRUE(result.mNodes[0].mFlags & FLAG_INCREMENTAL_ROOT);
}

TEST(CollectorLogLoading, CCWeakEdgeSkipped)
{
  // Weak edges should not appear in the edge list
  auto result = ParseCCLog(
      "0x1000 [rc=1] nsDocument\n"
      "> 0x2000 [weak] mWeakRef\n"
      "0x2000 [rc=1] nsWindow\n"
      "==========\n"
      "0x1000 [known=1]\n"
      "0x2000 [known=1]\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mEdges.Length(), 0u);
}

TEST(CollectorLogLoading, CCWeakMapEntry)
{
  auto result = ParseCCLog(
      "WeakMapEntry map=0x1000 key=0x2000 keyDelegate=(nil) value=0x3000\n"
      "==========\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  // WeakMapEntry creates nodes for all non-nil addresses
  EXPECT_GE(result.mNodes.Length(), 3u);
}

TEST(CollectorLogLoading, SoftRootFromGCEdge)
{
  // Soft roots arise when a GC edge provides the reference that makes observed
  // refcount match declared refcount. In CC-only mode, CC nodes with a known
  // entry always have rc > CC-internal edges, so soft roots require a GC log.
  //
  // nsDocument: rc=2, 1 CC edge from nsWindow, 1 GC edge from JSObject.
  // Observed = 2, declared = 2 -> soft root.
  auto result = ParseBothLogs(
      "0x1000 [rc=2] nsDocument\n"
      "0x2000 [rc=1] nsWindow\n"
      "> 0x1000 mDoc\n"
      "==========\n"
      "0x1000 [known=1]\n"
      "0x2000 [known=1]\n"_ns,
      "==========\n"
      "0x5000 B JSObject\n"
      "> 0x1000 B mWrapped\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();

  const TestNode* doc = FindNodeByLabel(result, "nsDocument"_ns);
  ASSERT_NE(doc, nullptr);
  EXPECT_TRUE(doc->mFlags & FLAG_SOFT_ROOT);
  EXPECT_FALSE(doc->mFlags & FLAG_ROOT);
  EXPECT_TRUE(result.mCCSoftRootIndices.Contains(doc->mIndex));
}

TEST(CollectorLogLoading, CCHardRoot)
{
  // A node whose observed refcount < declared refcount retains ROOT flag
  auto result = ParseCCLog(
      "0x1000 [rc=2] nsDocument\n"
      "==========\n"
      "0x1000 [known=1]\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();

  const TestNode* doc = FindNodeByLabel(result, "nsDocument"_ns);
  ASSERT_NE(doc, nullptr);
  // rc=2, no incoming edges observed, so this is a hard root
  EXPECT_TRUE(doc->mFlags & FLAG_ROOT);
  EXPECT_FALSE(doc->mFlags & FLAG_SOFT_ROOT);
  EXPECT_TRUE(result.mCCRootIndices.Contains(doc->mIndex));
}

TEST(CollectorLogLoading, CCMalformedLine)
{
  auto result = ParseCCLog("this is not valid CC log content\n"_ns);
  EXPECT_FALSE(result.mSuccess);
  EXPECT_FALSE(result.mError.IsEmpty());
}

TEST(CollectorLogLoading, CCNilPointer)
{
  // (nil) pointers should parse as address 0
  auto result = ParseCCLog(
      "(nil) [rc=0] NullObject\n"
      "==========\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  const TestNode* node = FindNodeByLabel(result, "NullObject"_ns);
  ASSERT_NE(node, nullptr);
  EXPECT_EQ(node->mPtr, uint64_t(0));
}

TEST(CollectorLogLoading, CCDuplicateNodeError)
{
  // The same node address appearing twice in the graph section is an error
  auto result = ParseCCLog(
      "0x1000 [rc=1] nsDocument\n"
      "0x1000 [rc=1] nsDocument\n"
      "==========\n"_ns);
  EXPECT_FALSE(result.mSuccess);
}

TEST(CollectorLogLoading, CCEdgeBeforeNodeError)
{
  auto result = ParseCCLog(
      "> 0x2000 mWindow\n"
      "==========\n"_ns);
  EXPECT_FALSE(result.mSuccess);
}

TEST(CollectorLogLoading, CCCRLFLineEndings)
{
  auto result = ParseCCLog(
      "0x1000 [rc=1] nsDocument\r\n"
      "==========\r\n"
      "0x1000 [known=1]\r\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mNodes.Length(), 1u);
}

TEST(CollectorLogLoading, CCStringDeduplication)
{
  // Two nodes with the same label should share the interned string
  auto result = ParseCCLog(
      "0x1000 [rc=1] nsDocument\n"
      "0x2000 [rc=1] nsDocument\n"
      "==========\n"
      "0x1000 [known=1]\n"
      "0x2000 [known=1]\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mNodes.Length(), 2u);
  EXPECT_EQ(result.mNodes[0].mLabel, "nsDocument"_ns);
  EXPECT_EQ(result.mNodes[1].mLabel, "nsDocument"_ns);
  // Both labels should point to the same interned string buffer location.
  EXPECT_EQ(result.mNodes[0].mLabel.get(), result.mNodes[1].mLabel.get());
}

TEST(CollectorLogLoading, CCEdgeLabelDeduplication)
{
  // Two edges with the same label should share the interned string
  auto result = ParseCCLog(
      "0x1000 [rc=1] nsDocument\n"
      "> 0x2000 mChild\n"
      "0x3000 [rc=1] nsWindow\n"
      "> 0x4000 mChild\n"
      "0x2000 [rc=1] nsElement\n"
      "0x4000 [rc=1] nsFrame\n"
      "==========\n"
      "0x1000 [known=1]\n"
      "0x2000 [known=1]\n"
      "0x3000 [known=1]\n"
      "0x4000 [known=1]\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mEdges.Length(), 2u);
  EXPECT_EQ(result.mEdges[0].mLabel, "mChild"_ns);
  EXPECT_EQ(result.mEdges[1].mLabel, "mChild"_ns);
  // Both labels should point to the same interned string buffer location.
  EXPECT_EQ(result.mEdges[0].mLabel.get(), result.mEdges[1].mLabel.get());
}

// --- GC log tests ---

TEST(CollectorLogLoading, GCEmptyBlackRoots)
{
  auto result = ParseGCLog("==========\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mNodes.Length(), 0u);
}

TEST(CollectorLogLoading, GCBlackRoot)
{
  auto result = ParseGCLog(
      "0xA000 B\n"
      "==========\n"
      "0xA000 B JSScript\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  ASSERT_EQ(result.mNodes.Length(), 1u);

  const TestNode* node = FindNodeByLabel(result, "JSScript"_ns);
  ASSERT_NE(node, nullptr);
  EXPECT_EQ(node->mPtr, uint64_t(0xA000));
  EXPECT_TRUE((node->mFlags & FLAG_ROOT) != 0);
  EXPECT_FALSE(node->mFlags & FLAG_SOFT_ROOT);
  EXPECT_TRUE(result.mGCRootIndices.Contains(node->mIndex));
}

TEST(CollectorLogLoading, GCGrayRoot)
{
  // Gray roots in the black roots section trigger a switch to gray root
  // mode when labeled with one of the known gray root labels.
  // Roots after the switch are soft roots.
  auto result = ParseGCLog(
      "0xA000 B\n"
      "0xB000 G mAnonymousGlobalScopes[i]\n"
      "0xC000 G\n"
      "==========\n"
      "0xA000 B JSScript\n"
      "0xB000 G mAnonymousGlobalScopes[i]\n"
      "0xC000 G JSObject\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();

  const TestNode* black = FindNodeByLabel(result, "JSScript"_ns);
  const TestNode* gray1 =
      FindNodeByLabel(result, "mAnonymousGlobalScopes[i]"_ns);
  const TestNode* gray2 = FindNodeByLabel(result, "JSObject"_ns);
  ASSERT_NE(black, nullptr);
  ASSERT_NE(gray1, nullptr);
  ASSERT_NE(gray2, nullptr);

  EXPECT_FALSE(black->mFlags & FLAG_SOFT_ROOT);
  EXPECT_TRUE(black->mFlags & FLAG_ROOT);

  EXPECT_TRUE(gray1->mFlags & FLAG_SOFT_ROOT);
  EXPECT_TRUE(gray2->mFlags & FLAG_SOFT_ROOT);
  EXPECT_TRUE(result.mGCGrayRootIndices.Contains(gray1->mIndex));
  EXPECT_TRUE(result.mGCGrayRootIndices.Contains(gray2->mIndex));
}

TEST(CollectorLogLoading, GCGraphSection)
{
  auto result = ParseGCLog(
      "==========\n"
      "0xA000 B JSScript\n"
      "> 0xB000 B mParent\n"
      "0xB000 G JSObject\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mNodes.Length(), 2u);

  const TestNode* script = FindNodeByLabel(result, "JSScript"_ns);
  const TestNode* obj = FindNodeByLabel(result, "JSObject"_ns);
  ASSERT_NE(script, nullptr);
  ASSERT_NE(obj, nullptr);

  EXPECT_TRUE(script->mFlags & FLAG_GC_MARKED);
  EXPECT_FALSE(script->mFlags & FLAG_GC_GRAY);
  EXPECT_TRUE(obj->mFlags & FLAG_GC_MARKED);
  EXPECT_TRUE(obj->mFlags & FLAG_GC_GRAY);

  EXPECT_TRUE(
      HasEdgeWithLabel(result, script->mIndex, obj->mIndex, "mParent"_ns));
}

TEST(CollectorLogLoading, GCWhiteNode)
{
  auto result = ParseGCLog(
      "==========\n"
      "0xA000 W DeadObject\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();

  const TestNode* node = FindNodeByLabel(result, "DeadObject"_ns);
  ASSERT_NE(node, nullptr);
  EXPECT_FALSE(node->mFlags & FLAG_GC_MARKED);
  EXPECT_FALSE(node->mFlags & FLAG_GC_GRAY);
}

TEST(CollectorLogLoading, GCWeakEdgeSkipped)
{
  auto result = ParseGCLog(
      "==========\n"
      "0xA000 B JSScript\n"
      "> 0xB000 B [weak] mWeak\n"
      "0xB000 B JSObject\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mEdges.Length(), 0u);
}

TEST(CollectorLogLoading, GCWeakMapEntry)
{
  auto result = ParseGCLog(
      "WeakMapEntry map=0x1000 key=0x2000 keyDelegate=0x3000 value=0x4000\n"
      "==========\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_GE(result.mNodes.Length(), 4u);
}

TEST(CollectorLogLoading, GCDuplicateNodeError)
{
  auto result = ParseGCLog(
      "==========\n"
      "0xA000 B JSScript\n"
      "0xA000 B JSScript\n"_ns);
  EXPECT_FALSE(result.mSuccess);
}

TEST(CollectorLogLoading, GCEdgeBeforeNodeError)
{
  auto result = ParseGCLog(
      "==========\n"
      "> 0xB000 B mParent\n"_ns);
  EXPECT_FALSE(result.mSuccess);
}

TEST(CollectorLogLoading, GCMalformedLine)
{
  auto result = ParseGCLog("not valid gc log content\n"_ns);
  EXPECT_FALSE(result.mSuccess);
  EXPECT_FALSE(result.mError.IsEmpty());
}

TEST(CollectorLogLoading, GCCommentLines)
{
  auto result = ParseGCLog(
      "# GC log header\n"
      "# timestamp: 2025-01-01\n"
      "==========\n"
      "0xA000 B JSScript\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();
  EXPECT_EQ(result.mNodes.Length(), 1u);
}

// --- Combined CC+GC log tests ---

TEST(CollectorLogLoading, CombinedCCAndGCLogs)
{
  // GC things in CC log get GC_MARKED flag set from GC log data when both
  // are loaded together.
  auto result = ParseBothLogs(
      "0x1000 [rc=1] nsDocument\n"
      "> 0x5000 mJSObj\n"
      "0x5000 [gc.marked] JSObject\n"
      "==========\n"
      "0x1000 [known=1]\n"_ns,
      "==========\n"
      "0x5000 B JSObject\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();

  const TestNode* doc = FindNodeByLabel(result, "nsDocument"_ns);
  const TestNode* obj = FindNodeByLabel(result, "JSObject"_ns);
  ASSERT_NE(doc, nullptr);
  ASSERT_NE(obj, nullptr);

  EXPECT_TRUE(doc->mFlags & FLAG_CC_MANAGED);
  EXPECT_TRUE(obj->mFlags & FLAG_GC_MARKED);
  EXPECT_TRUE(HasEdge(result, doc->mIndex, obj->mIndex));
}

TEST(CollectorLogLoading, CCDuplicateEdgesToSameTarget)
{
  // A node can have multiple references to the same target (different fields).
  auto result = ParseCCLog(
      "0x1000 [rc=2] nsWindow\n"
      "> 0x2000 mDoc\n"
      "> 0x2000 mOwner\n"
      "0x2000 [rc=2] nsDocument\n"
      "==========\n"
      "0x1000 [known=1]\n"
      "0x2000 [known=1]\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();

  const TestNode* win = FindNodeByLabel(result, "nsWindow"_ns);
  const TestNode* doc = FindNodeByLabel(result, "nsDocument"_ns);
  ASSERT_NE(win, nullptr);
  ASSERT_NE(doc, nullptr);

  // Both edges should exist
  EXPECT_TRUE(HasEdgeWithLabel(result, win->mIndex, doc->mIndex, "mDoc"_ns));
  EXPECT_TRUE(HasEdgeWithLabel(result, win->mIndex, doc->mIndex, "mOwner"_ns));
}

TEST(CollectorLogLoading, CombinedNestingEdgesSkipped)
{
  // When a GC log is present, CC edges with nesting != 0 should be skipped
  auto result = ParseBothLogs(
      "0x1000 [rc=1] nsDocument\n"
      "> 0x2000 [nesting=1] mNested\n"
      "> 0x3000 mDirect\n"
      "0x2000 [rc=1] nsElement\n"
      "0x3000 [rc=1] nsWindow\n"
      "==========\n"
      "0x1000 [known=1]\n"
      "0x2000 [known=1]\n"
      "0x3000 [known=1]\n"_ns,
      "==========\n"_ns);
  EXPECT_TRUE(result.mSuccess) << result.mError.get();

  const TestNode* doc = FindNodeByLabel(result, "nsDocument"_ns);
  const TestNode* nested = FindNodeByLabel(result, "nsElement"_ns);
  const TestNode* direct = FindNodeByLabel(result, "nsWindow"_ns);
  ASSERT_NE(doc, nullptr);
  ASSERT_NE(nested, nullptr);
  ASSERT_NE(direct, nullptr);

  EXPECT_FALSE(HasEdge(result, doc->mIndex, nested->mIndex));
  EXPECT_TRUE(HasEdge(result, doc->mIndex, direct->mIndex));
}

// --- Query tests ---

TEST(CollectorLogLoading, QueryNodesByLabelSubstring)
{
  auto bg = InitCCAnalyzer(
      "0x1000 [rc=1] nsDocument\n"
      "0x2000 [rc=1] nsDocumentViewer\n"
      "0x3000 [rc=1] nsWindow\n"
      "==========\n"
      "0x1000 [known=1]\n"
      "0x2000 [known=1]\n"
      "0x3000 [known=1]\n"_ns);
  ASSERT_NE(bg, nullptr);

  auto rv = CollectorLogAnalyzerTestHelper::QueryNodes(bg, "nsDoc"_ns);
  ASSERT_TRUE(rv.isOk());
  auto& nodes = rv.inspect();
  EXPECT_EQ(nodes.Length(), 2u);
  EXPECT_NE(FindResultNodeByLabel(nodes, "nsDocument"_ns), nullptr);
  EXPECT_NE(FindResultNodeByLabel(nodes, "nsDocumentViewer"_ns), nullptr);
}

TEST(CollectorLogLoading, QueryNodesByExactPointer)
{
  auto bg = InitCCAnalyzer(
      "0xABCD [rc=1] nsDocument\n"
      "0x2000 [rc=1] nsWindow\n"
      "==========\n"
      "0xABCD [known=1]\n"
      "0x2000 [known=1]\n"_ns);
  ASSERT_NE(bg, nullptr);

  auto rv = CollectorLogAnalyzerTestHelper::QueryNodes(bg, "0xABCD"_ns);
  ASSERT_TRUE(rv.isOk());
  auto& nodes = rv.inspect();
  EXPECT_EQ(nodes.Length(), 1u);
  EXPECT_EQ(nodes[0].mLabel, "nsDocument"_ns);
}

TEST(CollectorLogLoading, QueryNodesNoMatch)
{
  auto bg = InitCCAnalyzer(
      "0x1000 [rc=1] nsDocument\n"
      "==========\n"
      "0x1000 [known=1]\n"_ns);
  ASSERT_NE(bg, nullptr);

  auto rv = CollectorLogAnalyzerTestHelper::QueryNodes(bg, "NoSuchLabel"_ns);
  ASSERT_TRUE(rv.isOk());
  EXPECT_EQ(rv.inspect().Length(), 0u);
}

TEST(CollectorLogLoading, QueryNodesGarbageLast)
{
  auto bg = InitCCAnalyzer(
      "0x1000 [rc=1] nsDocument\n"
      "0x2000 [rc=1] nsDocumentGarbage\n"
      "==========\n"
      "0x1000 [known=1]\n"
      "0x2000 [garbage]\n"_ns);
  ASSERT_NE(bg, nullptr);

  auto rv = CollectorLogAnalyzerTestHelper::QueryNodes(bg, "nsDocument"_ns);
  ASSERT_TRUE(rv.isOk());
  auto& nodes = rv.inspect();
  EXPECT_EQ(nodes.Length(), 2u);
  // Non-garbage node should come first
  EXPECT_FALSE(nodes[0].mFlags &
               mozilla::dom::CollectorNodeFlags_Binding::GARBAGE);
  EXPECT_TRUE(nodes[1].mFlags &
              mozilla::dom::CollectorNodeFlags_Binding::GARBAGE);
}

TEST(CollectorLogLoading, SampleNodesReturnsNonGarbage)
{
  // Build a graph with enough nodes and some garbage
  nsAutoCString log;
  for (int i = 0; i < 30; i++) {
    log.AppendPrintf("0x%x [rc=1] Node%d\n", 0x1000 + i * 0x10, i);
  }
  log.Append("==========\n"_ns);
  for (int i = 0; i < 30; i++) {
    if (i < 5) {
      log.AppendPrintf("0x%x [garbage]\n", 0x1000 + i * 0x10);
    } else {
      log.AppendPrintf("0x%x [known=1]\n", 0x1000 + i * 0x10);
    }
  }

  auto bg = InitCCAnalyzer(log);
  ASSERT_NE(bg, nullptr);

  auto rv = CollectorLogAnalyzerTestHelper::SampleNodes(bg);
  ASSERT_TRUE(rv.isOk());
  auto& nodes = rv.inspect();
  EXPECT_EQ(nodes.Length(), 20u);
  for (const auto& node : nodes) {
    EXPECT_FALSE(node.mFlags &
                 mozilla::dom::CollectorNodeFlags_Binding::GARBAGE);
  }
}

// --- Adjacents tests ---

TEST(CollectorLogLoading, GetNodeAdjacentsBasic)
{
  auto bg = InitCCAnalyzer(
      "0x1000 [rc=2] nsDocument\n"
      "> 0x2000 mWindow\n"
      "0x2000 [rc=1] nsWindow\n"
      "> 0x1000 mDoc\n"
      "==========\n"
      "0x1000 [known=1]\n"
      "0x2000 [known=1]\n"_ns);
  ASSERT_NE(bg, nullptr);

  // Query adjacents for nsDocument (node index 0)
  auto rv = CollectorLogAnalyzerTestHelper::GetNodeAdjacents(bg, 0);
  ASSERT_TRUE(rv.isOk());
  auto& adj = rv.inspect();

  // nsDocument has one outgoing edge (mWindow -> nsWindow)
  EXPECT_EQ(adj.mFromSelf.Length(), 1u);
  EXPECT_EQ(adj.mFromSelf[0].mLabel, "mWindow"_ns);
  EXPECT_EQ(adj.mFromSelf[0].mOther.mLabel, "nsWindow"_ns);

  // nsDocument has one incoming edge (nsWindow -> mDoc)
  EXPECT_EQ(adj.mToSelf.Length(), 1u);
  EXPECT_EQ(adj.mToSelf[0].mLabel, "mDoc"_ns);
  EXPECT_EQ(adj.mToSelf[0].mOther.mLabel, "nsWindow"_ns);
}

TEST(CollectorLogLoading, GetNodeAdjacentsDeduplicatesGCEdges)
{
  // When both CC and GC logs have an edge to the same target, GC edges should
  // be deduplicated in fromSelf.
  auto bg = InitBothAnalyzer(
      "0x1000 [rc=1] nsDocument\n"
      "> 0x2000 mJSObj\n"
      "0x2000 [gc.marked] JSObject\n"
      "==========\n"
      "0x1000 [known=1]\n"_ns,
      "==========\n"
      "0x2000 B JSObject\n"
      "> 0x1000 B mDoc\n"_ns);
  ASSERT_NE(bg, nullptr);

  // Find nsDocument's index
  auto qrv = CollectorLogAnalyzerTestHelper::QueryNodes(bg, "nsDocument"_ns);
  ASSERT_TRUE(qrv.isOk());
  ASSERT_GE(qrv.inspect().Length(), 1u);
  uint64_t docIndex = qrv.inspect()[0].mIndex;

  auto rv = CollectorLogAnalyzerTestHelper::GetNodeAdjacents(bg, docIndex);
  ASSERT_TRUE(rv.isOk());
  auto& adj = rv.inspect();

  // nsDocument -> JSObject via CC edge mJSObj (only one, not duplicated)
  EXPECT_EQ(adj.mFromSelf.Length(), 1u);
  EXPECT_EQ(adj.mFromSelf[0].mLabel, "mJSObj"_ns);
}

// --- Path to root tests ---

TEST(CollectorLogLoading, PathToRootHard)
{
  // Root -> A -> B, where Root has unexplained references (hard root)
  auto bg = InitCCAnalyzer(
      "0x1000 [rc=2] Root\n"
      "> 0x2000 mChild\n"
      "0x2000 [rc=1] ChildA\n"
      "> 0x3000 mChild\n"
      "0x3000 [rc=1] ChildB\n"
      "==========\n"
      "0x1000 [known=1]\n"
      "0x2000 [known=1]\n"
      "0x3000 [known=1]\n"_ns);
  ASSERT_NE(bg, nullptr);

  // Find ChildB
  auto qrv = CollectorLogAnalyzerTestHelper::QueryNodes(bg, "ChildB"_ns);
  ASSERT_TRUE(qrv.isOk());
  ASSERT_EQ(qrv.inspect().Length(), 1u);
  uint64_t childBIndex = qrv.inspect()[0].mIndex;

  auto rv = CollectorLogAnalyzerTestHelper::GetPathToRoot(bg, childBIndex);
  ASSERT_TRUE(rv.isOk());
  auto& pathResult = rv.inspect();

  EXPECT_EQ(pathResult.mKind, mozilla::dom::CollectorLogRootKind::Hard);
  // Path: Root -> ChildA -> ChildB (3 nodes in the path)
  ASSERT_EQ(pathResult.mPath.Length(), 3u);
  EXPECT_EQ(pathResult.mPath[0].mOther.mLabel, "Root"_ns);
  EXPECT_EQ(pathResult.mPath[1].mOther.mLabel, "ChildA"_ns);
  EXPECT_EQ(pathResult.mPath[2].mOther.mLabel, "ChildB"_ns);
}

TEST(CollectorLogLoading, PathToRootSoft)
{
  // SoftRoot has all references accounted for (soft root).
  // No hard roots exist, so path-to-root falls back to soft roots.
  auto bg = InitBothAnalyzer(
      "0x1000 [rc=1] SoftRoot\n"
      "> 0x2000 mChild\n"
      "0x2000 [rc=1] Child\n"
      "==========\n"
      "0x1000 [known=0]\n"_ns,

      "0xB000 B\n"
      "==========\n"
      "0xB000 B Map\n"
      "0xA000 B Map\n"
      "> 0x1000 B mSlot\n"_ns);
  ASSERT_NE(bg, nullptr);

  auto qrv = CollectorLogAnalyzerTestHelper::QueryNodes(bg, "Child"_ns);
  ASSERT_TRUE(qrv.isOk());
  ASSERT_EQ(qrv.inspect().Length(), 1u);
  uint64_t childIndex = qrv.inspect()[0].mIndex;

  auto rv = CollectorLogAnalyzerTestHelper::GetPathToRoot(bg, childIndex);
  ASSERT_TRUE(rv.isOk());
  EXPECT_EQ(rv.inspect().mKind, mozilla::dom::CollectorLogRootKind::Soft);
  EXPECT_GE(rv.inspect().mPath.Length(), 2u);
}

TEST(CollectorLogLoading, PathToRootNone)
{
  // A garbage node with no root path should return kind=None.
  auto bg = InitCCAnalyzer(
      "0x1000 [rc=1] Garbage\n"
      "==========\n"
      "0x1000 [garbage]\n"_ns);
  ASSERT_NE(bg, nullptr);

  auto qrv = CollectorLogAnalyzerTestHelper::QueryNodes(bg, "Garbage"_ns);
  ASSERT_TRUE(qrv.isOk());
  ASSERT_EQ(qrv.inspect().Length(), 1u);
  uint64_t garbageIndex = qrv.inspect()[0].mIndex;

  auto rv = CollectorLogAnalyzerTestHelper::GetPathToRoot(bg, garbageIndex);
  ASSERT_TRUE(rv.isOk());
  EXPECT_EQ(rv.inspect().mKind, mozilla::dom::CollectorLogRootKind::None);
}

TEST(CollectorLogLoading, PathToRootViaWeakMap)
{
  // Test that path-to-root can traverse WeakMap edges.
  // WeakMap semantics: value is reachable if both map and key are reachable.
  //
  // Graph:
  //   GC root 0xA000 (map) --edge--> 0xB000
  //   GC root 0xC000 (key)
  //   WeakMapEntry map=0xA000 key=0xC000 value=0xD000
  //   0xD000 -> 0xE000 (the node we query)
  //
  // 0xE000 is reachable: root->0xA000 (map alive), root->0xC000 (key alive),
  // so weakmap value 0xD000 is alive, then 0xD000->0xE000.
  auto bg = InitBothAnalyzer(
      "WeakMapEntry map=0xA000 key=0xC000 keyDelegate=(nil) value=0xD000\n"
      "==========\n"_ns,
      "0xA000 B\n"
      "0xC000 B\n"
      "==========\n"
      "0xA000 B Map\n"
      "> 0xB000 B mSlot\n"
      "0xB000 B MapChild\n"
      "0xC000 B Key\n"
      "0xD000 B Value\n"
      "> 0xE000 B mTarget\n"
      "0xE000 B Target\n"_ns);
  ASSERT_NE(bg, nullptr);

  auto qrv = CollectorLogAnalyzerTestHelper::QueryNodes(bg, "Target"_ns);
  ASSERT_TRUE(qrv.isOk());
  ASSERT_EQ(qrv.inspect().Length(), 1u);
  uint64_t targetIndex = qrv.inspect()[0].mIndex;

  auto rv = CollectorLogAnalyzerTestHelper::GetPathToRoot(bg, targetIndex);
  ASSERT_TRUE(rv.isOk());
  auto& pathResult = rv.inspect();

  EXPECT_EQ(pathResult.mKind, mozilla::dom::CollectorLogRootKind::Hard);
  // The path should exist and reach Target
  ASSERT_GE(pathResult.mPath.Length(), 1u);
  EXPECT_EQ(pathResult.mPath.LastElement().mOther.mLabel, "Target"_ns);

  // There should be a WeakMap path for the key
  EXPECT_GE(pathResult.mWeakMapPaths.Length(), 1u);
}
