/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "CollectorLogAnalyzer.h"

#include <cinttypes>
#include <queue>

#include "CollectorLogAnalyzerBackground.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/HashTable.h"
#include "mozilla/SIMD.h"
#include "mozilla/Vector.h"
#include "mozilla/dom/ChromeUtils.h"
#include "mozilla/dom/FileCreatorHelper.h"
#include "mozilla/dom/Promise.h"
#include "nsFileStreams.h"
#include "nsIFile.h"
#include "nsIGlobalObject.h"
#include "nsXULAppAPI.h"
#include "prio.h"

namespace mozilla {

static constexpr auto MAX_QUERY_RESULTS =
    dom::CollectorLogAnalyzer_Binding::MAX_QUERY_RESULTS;
static constexpr auto SAMPLE_COUNT =
    dom::CollectorLogAnalyzer_Binding::SAMPLE_COUNT;

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(CollectorLogAnalyzer, mGlobal)
NS_IMPL_CYCLE_COLLECTING_ADDREF(CollectorLogAnalyzer)
NS_IMPL_CYCLE_COLLECTING_RELEASE(CollectorLogAnalyzer)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(CollectorLogAnalyzer)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

CollectorLogAnalyzer::CollectorLogAnalyzer(nsIGlobalObject* aGlobal,
                                           const nsAString& aCCLogPath,
                                           const nsAString& aGCLogPath)
    : mGlobal(aGlobal), mCCLogPath(aCCLogPath), mGCLogPath(aGCLogPath) {
  MOZ_ALWAYS_SUCCEEDS(
      NS_CreateBackgroundTaskQueue("CollectorLogAnalyzer::BackgroundTaskQueue",
                                   getter_AddRefs(mBackgroundEventTarget)));
  MOZ_RELEASE_ASSERT(mBackgroundEventTarget);
  mBackground = MakeRefPtr<CollectorLogAnalyzerBackground>();
}

JSObject* CollectorLogAnalyzer::WrapObject(JSContext* aCx,
                                           JS::Handle<JSObject*> aGivenProto) {
  return dom::CollectorLogAnalyzer_Binding::Wrap(aCx, this, aGivenProto);
}

template <typename T>
static void ResolveJSPromise(dom::Promise* aPromise, T&& aValue) {
  if constexpr (std::is_same_v<T, Ok>) {
    aPromise->MaybeResolveWithUndefined();
  } else {
    aPromise->MaybeResolve(std::forward<T>(aValue));
  }
}

static nsCString FormatErrorMessage(nsresult aError,
                                    const nsCString& aMessage) {
  nsAutoCString errorName;
  GetErrorName(aError, errorName);

  nsCString msg(aMessage);
  msg.AppendPrintf(" (%s)", errorName.get());

  return msg;
}

static void RejectJSPromise(dom::Promise* aPromise, const LogError& aError) {
  const auto errMsg = FormatErrorMessage(aError.Code(), aError.Message());
  aPromise->MaybeRejectWithUnknownError(errMsg);
}

template <typename OkT, typename Fn>
already_AddRefed<dom::Promise> CollectorLogAnalyzer::DispatchToBackground(
    ErrorResult& aError, Fn aFunc) {
  MOZ_RELEASE_ASSERT(XRE_IsParentProcess());
  MOZ_RELEASE_ASSERT(mBackgroundEventTarget);

  RefPtr<dom::Promise> jsPromise = dom::Promise::Create(mGlobal, aError);
  if (aError.Failed()) {
    return nullptr;
  }
  MOZ_ASSERT(jsPromise);

  auto nativePromise =
      MakeRefPtr<typename MozPromise<OkT, LogError, true>::Private>(__func__);
  mBackgroundEventTarget->Dispatch(
      NS_NewRunnableFunction(
          "CollectorLogAnalyzer::BackgroundTaskQueue::Dispatch",
          [nativePromise, func = std::move(aFunc)] {
            Result<OkT, LogError> result = func();
            if (result.isErr()) {
              nativePromise->Reject(result.unwrapErr(), __func__);
            } else {
              nativePromise->Resolve(result.unwrap(), __func__);
            }
          }),
      NS_DISPATCH_EVENT_MAY_BLOCK);

  nativePromise->Then(
      GetCurrentSerialEventTarget(), __func__,
      [promise = RefPtr(jsPromise)](OkT&& ok) {
        ResolveJSPromise(promise, std::forward<OkT>(ok));
      },
      [promise = RefPtr(jsPromise)](const LogError& err) {
        RejectJSPromise(promise, err);
      });

  return jsPromise.forget();
}

enum class GCThingKind {
  None,
  Marked,
  Unmarked,
};

Result<Ok, LogError> CollectorLogAnalyzerBackground::EnsureInitialized() {
  if (!mInitialized) {
    return Err(LogError(NS_ERROR_NOT_INITIALIZED,
                        "The CollectorLogAnalyzer is not initialized"));
  }
  return Ok();
}

template <typename TMap, typename TKey, typename TValue>
Result<Ok, LogError> PutInMap(TMap& aMap, TKey&& aKey, TValue&& aValue) {
  if (!aMap.put(std::forward<TKey>(aKey), std::forward<TValue>(aValue))) {
    return Err(
        LogError(NS_ERROR_OUT_OF_MEMORY, "Out of memory growing hash map"));
  }
  return Ok();
}

template <typename TMap, typename TKey, typename TValue>
Result<Ok, LogError> AddToMap(TMap& aMap, typename TMap::AddPtr& aAddPtr,
                              TKey&& aKey, TValue&& aValue) {
  if (!aMap.add(aAddPtr, std::forward<TKey>(aKey),
                std::forward<TValue>(aValue))) {
    return Err(
        LogError(NS_ERROR_OUT_OF_MEMORY, "Out of memory growing hash map"));
  }
  return Ok();
}

template <typename TSet, typename TValue>
Result<Ok, LogError> PutInSet(TSet& set, TValue&& aValue) {
  if (!set.put(std::forward<TValue>(aValue))) {
    return Err(
        LogError(NS_ERROR_OUT_OF_MEMORY, "Out of memory growing hash set"));
  }
  return Ok();
}

template <typename TVector, typename TValue>
Result<Ok, LogError> AppendToVector(TVector& vec, TValue&& aValue) {
  if (!vec.append(std::forward<TValue>(aValue))) {
    return Err(LogError(NS_ERROR_OUT_OF_MEMORY,
                        "Out of memory growing vector. Length: %zu",
                        vec.length()));
  }
  return Ok();
}

[[nodiscard]] static bool SkipCommentLine(const nsACString& aBuf,
                                          size_t* aCurrChar) {
  if (aBuf[*aCurrChar] != '#') {
    return false;
  }
  const char* start = aBuf.BeginReading();
  const char* newline =
      SIMD::memchr8(start + *aCurrChar, '\n', aBuf.Length() - *aCurrChar);
  if (!newline) {
    return false;
  }
  *aCurrChar = newline - start + 1;
  return true;
}

[[nodiscard]] static bool MatchLiteral(const nsACString& aBuf,
                                       size_t* aCurrChar,
                                       const nsLiteralCString& aLiteral) {
  size_t currChar = *aCurrChar;
  if (aLiteral.Length() >= aBuf.Length() - currChar) {
    return false;
  }
  if (memcmp(aBuf.BeginReading() + currChar, aLiteral.get(),
             aLiteral.Length()) != 0) {
    return false;
  }
  *aCurrChar += aLiteral.Length();
  return true;
}

[[nodiscard]] static bool ParsePointer(const nsACString& aBuf,
                                       size_t* aCurrChar, uint64_t* aPtr) {
  size_t currChar = *aCurrChar;

  if (MatchLiteral(aBuf, &currChar, "(nil)"_ns)) {
    *aPtr = 0;
    *aCurrChar = currChar;
    return true;
  }

  char* end = nullptr;
  const char* begin = aBuf.BeginReading() + currChar;
  *aPtr = strtoull(begin, &end, 16);
  if (end == begin) {
    return false;
  }

  *aCurrChar = currChar + (end - begin);
  return true;
}

[[nodiscard]] static bool ParseDecimal(const nsACString& aBuf,
                                       size_t* aCurrChar, int32_t* aValue) {
  size_t currChar = *aCurrChar;

  char* end = nullptr;
  const char* begin = aBuf.BeginReading() + currChar;
  *aValue = strtol(begin, &end, 10);
  if (end == begin) {
    return false;
  }

  *aCurrChar = currChar + (end - begin);
  return true;
}

static void SkipTabsAndSpaces(const nsACString& aBuf, size_t* aCurrChar) {
  size_t currChar = *aCurrChar;
  while (currChar < aBuf.Length() &&
         (aBuf[currChar] == ' ' || aBuf[currChar] == '\t')) {
    currChar++;
  }
  *aCurrChar = currChar;
}

[[nodiscard]] static bool MatchLineEnd(const nsACString& aBuf,
                                       size_t* aCurrChar) {
  size_t currChar = *aCurrChar;
  if (currChar < aBuf.Length() && aBuf[currChar] == '\r') {
    currChar++;
  }
  if (currChar >= aBuf.Length() || aBuf[currChar] != '\n') {
    return false;
  }
  currChar++;
  *aCurrChar = currChar;
  return true;
}

// If we have a newline character after the current character in the
// buffer, this will collect the contents of the buffer starting at
// *aCurrChar up until the first newline.
[[nodiscard]] static bool MatchRemainingLine(const nsACString& aBuf,
                                             size_t* aCurrChar,
                                             nsACString* aResult) {
  size_t currChar = *aCurrChar;
  size_t resultStart = currChar;
  while (currChar < aBuf.Length() && aBuf[currChar] != '\r' &&
         aBuf[currChar] != '\n') {
    currChar++;
  }
  size_t resultEnd = currChar;

  if (!MatchLineEnd(aBuf, &currChar)) {
    return false;
  }

  aResult->Assign(Substring(aBuf, resultStart, resultEnd - resultStart));

  *aCurrChar = currChar;
  return true;
}

[[nodiscard]] static bool MatchEndSection(const nsACString& aBuf,
                                          size_t* aCurrChar) {
  size_t currChar = *aCurrChar;
  if (!MatchLiteral(aBuf, &currChar, "=========="_ns)) {
    return false;
  }
  if (!MatchLineEnd(aBuf, &currChar)) {
    return false;
  }
  *aCurrChar = currChar;
  return true;
}

[[nodiscard]] static bool ParseCCNode(const nsACString& aBuf, size_t* aCurrChar,
                                      uint64_t* aPtr, int32_t* aRefCnt,
                                      GCThingKind* aGCKind,
                                      nsACString* aLabel) {
  size_t currChar = *aCurrChar;
  if (!ParsePointer(aBuf, &currChar, aPtr)) {
    return false;
  }

  if (MatchLiteral(aBuf, &currChar, " [gc"_ns)) {
    *aRefCnt = -1;
    if (MatchLiteral(aBuf, &currChar, ".marked]"_ns)) {
      *aGCKind = GCThingKind::Marked;
    } else if (MatchLiteral(aBuf, &currChar, "]"_ns)) {
      *aGCKind = GCThingKind::Unmarked;
    } else {
      return false;
    }
  } else if (MatchLiteral(aBuf, &currChar, " [rc="_ns)) {
    *aGCKind = GCThingKind::None;
    if (!ParseDecimal(aBuf, &currChar, aRefCnt)) {
      return false;
    }
    if (!MatchLiteral(aBuf, &currChar, "]"_ns)) {
      return false;
    }
  } else {
    return false;
  }

  SkipTabsAndSpaces(aBuf, &currChar);

  if (!MatchRemainingLine(aBuf, &currChar, aLabel)) {
    return false;
  }

  *aCurrChar = currChar;
  return true;
}

enum class GCColor {
  Black,
  Gray,
  White,
};

[[nodiscard]] static bool ParseGCNode(const nsACString& aBuf, size_t* aCurrChar,
                                      uint64_t* aPtr, GCColor* aColor,
                                      nsACString* aLabel) {
  size_t currChar = *aCurrChar;
  if (!ParsePointer(aBuf, &currChar, aPtr)) {
    return false;
  }

  if (MatchLiteral(aBuf, &currChar, " B"_ns)) {
    *aColor = GCColor::Black;
  } else if (MatchLiteral(aBuf, &currChar, " G"_ns)) {
    *aColor = GCColor::Gray;
  } else if (MatchLiteral(aBuf, &currChar, " W"_ns)) {
    *aColor = GCColor::White;
  } else {
    return false;
  }

  SkipTabsAndSpaces(aBuf, &currChar);

  if (!MatchRemainingLine(aBuf, &currChar, aLabel)) {
    return false;
  }

  *aCurrChar = currChar;
  return true;
}

[[nodiscard]] static bool ParseCCEdge(const nsACString& aBuf, size_t* aCurrChar,
                                      uint64_t* aPtr, int32_t* aNesting,
                                      bool* aWeak, nsACString* aLabel) {
  size_t currChar = *aCurrChar;

  if (!MatchLiteral(aBuf, &currChar, "> "_ns)) {
    return false;
  }

  if (!ParsePointer(aBuf, &currChar, aPtr)) {
    return false;
  }

  if (MatchLiteral(aBuf, &currChar, " [weak]"_ns)) {
    *aWeak = true;
  }

  if (MatchLiteral(aBuf, &currChar, " [nesting="_ns)) {
    if (!ParseDecimal(aBuf, &currChar, aNesting)) {
      return false;
    }
    if (!MatchLiteral(aBuf, &currChar, "]"_ns)) {
      return false;
    }
  }

  SkipTabsAndSpaces(aBuf, &currChar);

  if (!MatchRemainingLine(aBuf, &currChar, aLabel)) {
    return false;
  }

  *aCurrChar = currChar;
  return true;
}

[[nodiscard]] static bool ParseGCEdge(const nsACString& aBuf, size_t* aCurrChar,
                                      uint64_t* aPtr, bool* aWeak,
                                      nsACString* aLabel) {
  size_t currChar = *aCurrChar;

  if (!MatchLiteral(aBuf, &currChar, "> "_ns)) {
    return false;
  }

  if (!ParsePointer(aBuf, &currChar, aPtr)) {
    return false;
  }

  if (!MatchLiteral(aBuf, &currChar, " B"_ns) &&
      !MatchLiteral(aBuf, &currChar, " G"_ns) &&
      !MatchLiteral(aBuf, &currChar, " W"_ns)) {
    return false;
  }

  if (MatchLiteral(aBuf, &currChar, " [weak]"_ns)) {
    *aWeak = true;
  }

  SkipTabsAndSpaces(aBuf, &currChar);

  if (!MatchRemainingLine(aBuf, &currChar, aLabel)) {
    return false;
  }

  *aCurrChar = currChar;
  return true;
}

[[nodiscard]] static bool ParseIncrementalRoot(const nsACString& aBuf,
                                               size_t* aCurrChar,
                                               uint64_t* aPtr) {
  size_t currChar = *aCurrChar;

  if (!MatchLiteral(aBuf, &currChar, "IncrementalRoot "_ns)) {
    return false;
  }

  if (!ParsePointer(aBuf, &currChar, aPtr)) {
    return false;
  }

  if (!MatchLineEnd(aBuf, &currChar)) {
    return false;
  }

  *aCurrChar = currChar;
  return true;
}

[[nodiscard]] static bool ParseWeakMapEntry(const nsACString& aBuf,
                                            size_t* aCurrChar,
                                            WeakMapEntry* aEntry) {
  size_t currChar = *aCurrChar;

  if (!MatchLiteral(aBuf, &currChar, "WeakMapEntry map="_ns)) {
    return false;
  }

  if (!ParsePointer(aBuf, &currChar, &aEntry->mMap)) {
    return false;
  }

  if (!MatchLiteral(aBuf, &currChar, " key="_ns)) {
    return false;
  }

  if (!ParsePointer(aBuf, &currChar, &aEntry->mKey)) {
    return false;
  }

  if (!MatchLiteral(aBuf, &currChar, " keyDelegate="_ns)) {
    return false;
  }

  if (!ParsePointer(aBuf, &currChar, &aEntry->mKeyDelegate)) {
    return false;
  }

  if (!MatchLiteral(aBuf, &currChar, " value="_ns)) {
    return false;
  }

  if (!ParsePointer(aBuf, &currChar, &aEntry->mValue)) {
    return false;
  }

  if (!MatchLineEnd(aBuf, &currChar)) {
    return false;
  }

  *aCurrChar = currChar;
  return true;
}

[[nodiscard]] static bool ParseResult(const nsACString& aBuf, size_t* aCurrChar,
                                      uint64_t* aPtr, int32_t* aKnown) {
  size_t currChar = *aCurrChar;

  if (!ParsePointer(aBuf, &currChar, aPtr)) {
    return false;
  }

  if (MatchLiteral(aBuf, &currChar, " [garbage]"_ns)) {
    *aKnown = -1;
  } else if (MatchLiteral(aBuf, &currChar, " [known="_ns)) {
    if (!ParseDecimal(aBuf, &currChar, aKnown)) {
      return false;
    }
    if (!MatchLiteral(aBuf, &currChar, "]"_ns)) {
      return false;
    }
  } else {
    return false;
  }

  if (!MatchLineEnd(aBuf, &currChar)) {
    return false;
  }

  *aCurrChar = currChar;
  return true;
}

// Find and return the index of aNeedle within aHaystack. If aNeedle can't be
// found, this returns -1
static int64_t FindMatch(mozilla::Span<const char> aHaystack,
                         const nsCString& aNeedle) {
  MOZ_ASSERT(aNeedle.Length() > 0);

  if (aNeedle.Length() == 1) {
    const char* pos =
        SIMD::memchr8(aHaystack.Elements(), aNeedle[0], aHaystack.Length());
    if (pos) {
      return pos - aHaystack.Elements();
    }
    return -1;
  }

  size_t index = 0;
  while (aHaystack.Length() >= aNeedle.Length()) {
    const char* pos;
    const size_t inlineLookaheadChars = 2;

    size_t searchLen =
        aHaystack.Length() - aNeedle.Length() + inlineLookaheadChars;
    pos = SIMD::memchr2x8(aHaystack.Elements(), aNeedle[0], aNeedle[1],
                          searchLen);
    if (!pos) {
      return -1;
    }

    size_t localIndex = pos - aHaystack.Elements();
    aHaystack = aHaystack.Subspan(localIndex);
    index += localIndex;
    if (memcmp(aNeedle.get() + inlineLookaheadChars,
               aHaystack.Elements() + inlineLookaheadChars,
               aNeedle.Length() - inlineLookaheadChars) == 0) {
      return int64_t(index);
    }

    aHaystack = aHaystack.Subspan(1);
    index += 1;
  }
  return -1;
}

// Since we store all the strings in one contiguous buffer for search purposes
// (i.e., aHaystack), we expose this helper to get the boundaries of a string
// based on the start index (aInnerIndex) of a substring within it. We return
// the start and end index of the string in aStart and aEnd respectively. The
// boundaries of a string are determined either by the presence of a null
// character or the limits of the buffer.
static void GetStringBoundaries(mozilla::Span<const char> aHaystack,
                                size_t aInnerIndex, size_t* aStart,
                                size_t* aEnd) {
  MOZ_ASSERT(aInnerIndex < aHaystack.Length());
  MOZ_ASSERT(aHaystack[aInnerIndex] != '\0');
  MOZ_ASSERT(uint64_t(aHaystack.Length()) <=
             uint64_t(std::numeric_limits<int64_t>::max()));

  *aStart = 0;
  for (int64_t i = int64_t(aInnerIndex) - 1; i >= 0; --i) {
    if (aHaystack[i] == '\0') {
      *aStart = i + 1;
      break;
    }
  }
  const char* endPtr = SIMD::memchr8(aHaystack.Elements() + aInnerIndex, '\0',
                                     aHaystack.Length() - aInnerIndex);
  if (endPtr == nullptr) {
    *aEnd = aHaystack.Length();
  } else {
    *aEnd = endPtr - aHaystack.Elements();
  }
}

// This finds every occurrence of aQuery in a contiguous buffer of strings
// delimited by null characters. For example, if aQuery is "Global", then in a
// typical log's processed string buffer this should find the index of
// "nsGlobalWindowInner" and the index of "nsGlobalWindowOuter", among others.
static Result<HashSet<size_t>, LogError> FindStringIndices(
    const Vector<char>& aStrings, const nsCString& aQuery) {
  HashSet<size_t> result;
  mozilla::Span<const char> haystack = aStrings;
  size_t offset = 0;
  int64_t match = -1;

  while (offset < haystack.Length() &&
         (match = FindMatch(haystack.subspan(offset), aQuery)) != -1) {
    size_t start;
    size_t end;
    GetStringBoundaries(haystack, match + offset, &start, &end);
    MOZ_TRY(PutInSet(result, start));
    offset = end;
  }
  return result;
}

// There are typically a lot of duplicated strings within a GC/CC log, so we
// intern strings into one contiguous buffer and represent node/edge labels
// as indexes into this buffer. If two nodes have the same label, they will
// have the same index. This function takes aStr and returns the index at
// which the string can be found in the contiguous buffer (mStrings). If aStr
// does not already exist within mStrings, this will add it.
Result<StringBufferIndex, LogError>
CollectorLogAnalyzerBackground::InternString(const nsCString& aStr) {
  auto p = mStringTable.lookupForAdd(aStr);
  if (!p) {
    size_t res = mStrings.length();
    size_t reserveLength = aStr.Length() + 1;
    if (!mStrings.growByUninitialized(reserveLength)) {
      return Err(LogError(NS_ERROR_OUT_OF_MEMORY,
                          "Out of memory growing string buffer"));
    }
    char* writePtr = mStrings.end() - reserveLength;
    memcpy(writePtr, aStr.get(), aStr.Length());
    writePtr[reserveLength - 1] = '\0';
    MOZ_TRY(AddToMap(mStringTable, p, aStr, res));
  }
  return p->value();
}

Result<NodeTableIndex, LogError> CollectorLogAnalyzerBackground::EnsureNode(
    NodeId aNodeId) {
  auto p = mNodeIdsToIndices.lookupForAdd(aNodeId);
  if (!p) {
    NodeTableIndex index = mNodeIds.length();
    MOZ_TRY(AppendToVector(mNodeIds, aNodeId));
    MOZ_TRY(AddToMap(mNodeIdsToIndices, p, aNodeId, index));
    MOZ_TRY(AppendToVector(mNodeLabels, INVALID_STRING));
    MOZ_TRY(AppendToVector(mNodeFlags, 0));
    MOZ_TRY(AppendToVector(mObservedReferenceCounts, 0));
    NodeEdgesDescriptor edges = {};
    edges.mCC = INVALID_NODE;
    edges.mGC = INVALID_NODE;
    edges.mWeakMap = INVALID_NODE;
    MOZ_TRY(AppendToVector(mNodeEdges, edges));
  }
  return p->value();
}

Result<Ok, LogError> CollectorLogAnalyzerBackground::AddWeakMapEdge(
    NodeTableIndex aKey, NodeTableIndex aMap, NodeTableIndex aValue,
    bool aKeyDelegate, bool aKeyIsSource) {
  WeakMapEdge edge = {};
  edge.mKey = aKey;
  edge.mMap = aMap;
  edge.mValue = aValue;
  if (aKeyDelegate) {
    edge.mKind = WeakMapEdgeKind::WeakMapKeyDelegate;
  } else {
    edge.mKind = WeakMapEdgeKind::WeakMapKey;
  }
  edge.mKeyIsSource = aKeyIsSource;
  MOZ_TRY(AppendToVector(mWeakMapEdges, edge));
  mNodeEdges[edge.source()].mWeakMapCount++;
  return Ok();
}

Result<Ok, LogError> CollectorLogAnalyzerBackground::AddWeakMapEntry(
    const WeakMapEntry& aEntry) {
  NodeTableIndex keyIndex = MOZ_TRY(EnsureNode(aEntry.mKey));
  NodeTableIndex mapIndex = MOZ_TRY(EnsureNode(aEntry.mMap));
  NodeTableIndex valueIndex = MOZ_TRY(EnsureNode(aEntry.mValue));

  MOZ_TRY(AddWeakMapEdge(keyIndex, mapIndex, valueIndex,
                         /* aKeyDelegate = */ false,
                         /* aKeyIsSource = */ true));
  MOZ_TRY(AddWeakMapEdge(keyIndex, mapIndex, valueIndex,
                         /* aKeyDelegate = */ false,
                         /* aKeyIsSource = */ false));

  if (aEntry.mKeyDelegate != 0) {
    NodeTableIndex keyDelegateIndex = MOZ_TRY(EnsureNode(aEntry.mKeyDelegate));

    MOZ_TRY(AddWeakMapEdge(keyDelegateIndex, mapIndex, keyIndex,
                           /* aKeyDelegate = */ true,
                           /* aKeyIsSource = */ true));
    MOZ_TRY(AddWeakMapEdge(keyDelegateIndex, mapIndex, keyIndex,
                           /* aKeyDelegate = */ true,
                           /* aKeyIsSource = */ false));
  }
  return Ok();
}

Result<Ok, LogError> CollectorLogAnalyzerBackground::AddCCEdge(
    NodeTableIndex aCurrentNode, NodeTableIndex aEdge,
    StringBufferIndex aLabel) {
  NodeEdgesDescriptor& edges = mNodeEdges[aCurrentNode];
  MOZ_ASSERT(edges.mCC + edges.mCCCount == mEdges.length());
  MOZ_TRY(AppendToVector(mEdges, aEdge));
  MOZ_TRY(AppendToVector(mEdgeLabels, aLabel));
  edges.mCCCount++;
  return Ok();
}

Result<Ok, LogError> CollectorLogAnalyzerBackground::AddGCEdge(
    NodeTableIndex aCurrentNode, NodeTableIndex aEdge,
    StringBufferIndex aLabel) {
  NodeEdgesDescriptor& edges = mNodeEdges[aCurrentNode];
  MOZ_ASSERT(edges.mGC + edges.mGCCount == mEdges.length());
  MOZ_TRY(AppendToVector(mEdges, aEdge));
  MOZ_TRY(AppendToVector(mEdgeLabels, aLabel));
  edges.mGCCount++;
  return Ok();
}

Result<size_t, LogError>
CollectorLogAnalyzerBackground::IngestCycleCollectorLog(const nsACString& aBuf,
                                                        bool aContainsFileEnd) {
  size_t currChar = 0;
  size_t prevChar = 0;
  while (currChar < aBuf.Length()) {
    mCCFileProgress += currChar - prevChar;
    prevChar = currChar;
    mCCLineNumber++;

    if (SkipCommentLine(aBuf, &currChar)) {
      continue;
    }

    if (mCurrentCCSection == CCLogSection::Graph) {
      if (MatchEndSection(aBuf, &currChar)) {
        mCurrentCCSection = CCLogSection::Results;
        continue;
      }

      uint64_t ptr;
      int32_t refCount;  // -1 if does not exist
      GCThingKind gcKind;
      nsAutoCString label;
      if (ParseCCNode(aBuf, &currChar, &ptr, &refCount, &gcKind, &label)) {
        mCurrentCCNode = MOZ_TRY(EnsureNode(ptr));
        StringBufferIndex labelIndex = MOZ_TRY(InternString(label));
        mNodeLabels[mCurrentCCNode] = labelIndex;
        if (gcKind == GCThingKind::None) {
          mNodeFlags[mCurrentCCNode] |=
              dom::CollectorNodeFlags_Binding::CC_MANAGED;
          if (refCount < 0) {
            return Err(
                LogError(NS_ERROR_FILE_CORRUPTED,
                         "Encountered a negative refcount in the CC log"));
          }
          MOZ_TRY(
              PutInMap(mCCReferenceCounts, mCurrentCCNode, uint32_t(refCount)));
        } else if (!mHaveGC) {
          mNodeFlags[mCurrentCCNode] |=
              dom::CollectorNodeFlags_Binding::GC_MARKED;
          if (gcKind == GCThingKind::Unmarked) {
            mNodeFlags[mCurrentCCNode] |=
                dom::CollectorNodeFlags_Binding::GC_GRAY;
          }
        }
        if (mNodeEdges[mCurrentCCNode].mCC != INVALID_NODE) {
          return Err(LogError(
              NS_ERROR_FILE_CORRUPTED,
              "Encountered node 0x%" PRIx64 " twice in the CC log", ptr));
        }
        mNodeEdges[mCurrentCCNode].mCC = mEdges.length();
        continue;
      }
      int32_t nesting = 0;
      bool weak = false;
      if (ParseCCEdge(aBuf, &currChar, &ptr, &nesting, &weak, &label)) {
        if (mCurrentCCNode >= mNodeEdges.length()) {
          return Err(
              LogError(NS_ERROR_FILE_CORRUPTED,
                       "Invalid log format: edge encountered before a node"));
        }
        if (mHaveGC && nesting != 0) {
          continue;
        }
        if (weak) {
          continue;
        }
        StringBufferIndex labelIndex = MOZ_TRY(InternString(label));
        NodeTableIndex edge = MOZ_TRY(EnsureNode(ptr));
        MOZ_TRY(AddCCEdge(mCurrentCCNode, edge, labelIndex));
        continue;
      }
      if (ParseIncrementalRoot(aBuf, &currChar, &ptr)) {
        NodeTableIndex node = MOZ_TRY(EnsureNode(ptr));
        mNodeFlags[node] |= dom::CollectorNodeFlags_Binding::INCREMENTAL_ROOT;
        MOZ_TRY(AppendToVector(mIncrementalRoots, node));
        continue;
      }
      WeakMapEntry entry = {};
      if (ParseWeakMapEntry(aBuf, &currChar, &entry)) {
        MOZ_TRY(AddWeakMapEntry(entry));
        continue;
      }

    } else if (mCurrentCCSection == CCLogSection::Results) {
      uint64_t ptr;
      int32_t known;
      if (ParseResult(aBuf, &currChar, &ptr, &known)) {
        NodeTableIndex node = MOZ_TRY(EnsureNode(ptr));
        mNodeFlags[node] |= dom::CollectorNodeFlags_Binding::CC_MANAGED;
        if (known == -1) {
          mNodeFlags[node] |= dom::CollectorNodeFlags_Binding::GARBAGE;
        } else {
          mNodeFlags[node] |= dom::CollectorNodeFlags_Binding::ROOT;
        }
        continue;
      }
    } else {
      MOZ_CRASH("Unexpected section");
    }

    nsAutoCString line;
    bool matchedLine = MatchRemainingLine(aBuf, &currChar, &line);

    if (matchedLine || aContainsFileEnd) {
      return Err(LogError(NS_ERROR_FILE_CORRUPTED,
                          "Failed to parse CC line %zu: `%s`", mCCLineNumber,
                          line.get()));
    }

    // We didn't actually complete reading the line
    mCCLineNumber--;
    MOZ_ASSERT(currChar == prevChar);
    return currChar;
  }

  mCCFileProgress += currChar - prevChar;
  return currChar;
}

// A bit of a hack, lifted from https://github.com/amccreight/heapgraph/
// Up-to-date as of Jan 15, 2025.
static bool SwitchToGrayRoots(const nsCString& aLabel) {
  if (aLabel.Equals("mAnonymousGlobalScopes[i]"_ns)) {
    return true;
  }
  if (aLabel.Equals("active window global"_ns)) {
    return true;
  }
  if (aLabel.Equals("mCallback"_ns)) {
    return true;
  }
  if (aLabel.Equals("DOM expando object"_ns)) {
    return true;
  }
  if (StringBeginsWith(aLabel, "XPCNativeInterface"_ns)) {
    return true;
  }
  if (StringBeginsWith(aLabel, "XPCWrappedNative"_ns)) {
    return true;
  }
  if (StringBeginsWith(aLabel, "XPCVariant"_ns)) {
    return true;
  }
  if (StringBeginsWith(aLabel, "nsXPCWrappedJS"_ns)) {
    return true;
  }
  return false;
}

Result<size_t, LogError>
CollectorLogAnalyzerBackground::IngestGarbageCollectorLog(
    const nsACString& aBuf, bool aContainsFileEnd) {
  size_t currChar = 0;
  size_t prevChar = 0;
  while (currChar < aBuf.Length()) {
    mGCFileProgress += currChar - prevChar;
    prevChar = currChar;
    mGCLineNumber++;

    if (SkipCommentLine(aBuf, &currChar)) {
      continue;
    }

    if (mCurrentGCSection == GCLogSection::BlackRoots ||
        mCurrentGCSection == GCLogSection::GrayRoots) {
      if (MatchEndSection(aBuf, &currChar)) {
        mCurrentGCSection = GCLogSection::Graph;
        continue;
      }
      uint64_t ptr;
      nsAutoCString label;
      GCColor color;
      if (ParseGCNode(aBuf, &currChar, &ptr, &color, &label)) {
        NodeTableIndex node = MOZ_TRY(EnsureNode(ptr));
        if (mCurrentGCSection == GCLogSection::BlackRoots &&
            SwitchToGrayRoots(label)) {
          mCurrentGCSection = GCLogSection::GrayRoots;
        }
        mNodeFlags[node] |= dom::CollectorNodeFlags_Binding::ROOT;
        if (mCurrentGCSection == GCLogSection::GrayRoots) {
          mNodeFlags[node] |= dom::CollectorNodeFlags_Binding::SOFT_ROOT;
          MOZ_TRY(AppendToVector(mGCGrayRoots, node));
        } else {
          MOZ_TRY(AppendToVector(mGCRoots, node));
        }
        continue;
      }

      WeakMapEntry entry = {};
      if (ParseWeakMapEntry(aBuf, &currChar, &entry)) {
        MOZ_TRY(AddWeakMapEntry(entry));
        continue;
      }
    } else if (mCurrentGCSection == GCLogSection::Graph) {
      uint64_t ptr;
      nsAutoCString label;
      GCColor color;
      if (ParseGCNode(aBuf, &currChar, &ptr, &color, &label)) {
        mCurrentGCNode = MOZ_TRY(EnsureNode(ptr));
        StringBufferIndex labelIndex = MOZ_TRY(InternString(label));
        mNodeLabels[mCurrentGCNode] = labelIndex;
        if (color == GCColor::Gray) {
          mNodeFlags[mCurrentGCNode] |=
              dom::CollectorNodeFlags_Binding::GC_MARKED;
          mNodeFlags[mCurrentGCNode] |=
              dom::CollectorNodeFlags_Binding::GC_GRAY;
        } else if (color == GCColor::Black) {
          mNodeFlags[mCurrentGCNode] |=
              dom::CollectorNodeFlags_Binding::GC_MARKED;
        }

        if (mNodeEdges[mCurrentGCNode].mGC != INVALID_NODE) {
          return Err(LogError(
              NS_ERROR_FILE_CORRUPTED,
              "Encountered node 0x%" PRIx64 " twice in the logs", ptr));
        }

        mNodeEdges[mCurrentGCNode].mGC = mEdges.length();
        continue;
      }
      bool weak = false;
      if (ParseGCEdge(aBuf, &currChar, &ptr, &weak, &label)) {
        if (mCurrentGCNode >= mNodeEdges.length()) {
          return Err(
              LogError(NS_ERROR_FILE_CORRUPTED,
                       "Invalid log format: edge encountered before a node"));
        }
        if (weak) {
          continue;
        }
        StringBufferIndex labelIndex = MOZ_TRY(InternString(label));
        NodeTableIndex edge = MOZ_TRY(EnsureNode(ptr));
        MOZ_TRY(AddGCEdge(mCurrentGCNode, edge, labelIndex));
        continue;
      }
    } else {
      MOZ_CRASH("Unexpected section");
    }

    nsAutoCString line;
    if (MatchRemainingLine(aBuf, &currChar, &line) || aContainsFileEnd) {
      return Err(LogError(NS_ERROR_FILE_CORRUPTED,
                          "Failed to parse GC line %zu: `%s`", mGCLineNumber,
                          line.get()));
    }

    // We didn't actually complete reading the line
    mGCLineNumber--;
    MOZ_ASSERT(currChar == prevChar);
    return currChar;
  }

  mGCFileProgress += currChar - prevChar;
  return currChar;
}

dom::CollectorLogNode CollectorLogAnalyzerBackground::MakeResultNode(
    NodeTableIndex aIndex) {
  dom::CollectorLogNode result;

  NodeId id = mNodeIds[aIndex];
  result.mIndex = aIndex;
  result.mPtr = nsPrintfCString("0x%" PRIx64, id);
  if (mNodeLabels[aIndex] != INVALID_STRING) {
    result.mLabel = nsCString(&mStrings[mNodeLabels[aIndex]]);
  }
  auto ccRefCountPtr = mCCReferenceCounts.lookup(aIndex);
  if (ccRefCountPtr) {
    result.mReferenceCount = ccRefCountPtr->value();
  } else {
    result.mReferenceCount = -1;
  }
  result.mFlags = mNodeFlags[aIndex];
  return result;
}

Result<nsTArray<dom::CollectorLogNode>, LogError>
CollectorLogAnalyzerBackground::QueryNodesImpl(const nsCString& aQuery) {
  MOZ_TRY(EnsureInitialized());

  HashSet<size_t> stringIndices = MOZ_TRY(FindStringIndices(mStrings, aQuery));
  uint64_t bytePattern = 0;
  size_t matchEnd = 0;
  bool matchPtrs = false;
  if (ParsePointer(aQuery, &matchEnd, &bytePattern) &&
      matchEnd == aQuery.Length()) {
    matchPtrs = true;
  }
  nsTArray<dom::CollectorLogNode> result;
  nsTArray<dom::CollectorLogNode> garbage;
  if (!matchPtrs && stringIndices.count() == 0) {
    return result;
  }

  for (NodeTableIndex i = 0; i < mNodeLabels.length(); ++i) {
    nsTArray<dom::CollectorLogNode>* dest = &result;
    if (mNodeFlags[i] & dom::CollectorNodeFlags_Binding::GARBAGE) {
      dest = &garbage;
    }

    NodeId id = mNodeIds[i];
    StringBufferIndex label = mNodeLabels[i];
    if (matchPtrs && id == bytePattern) {
      dest->AppendElement(MakeResultNode(i));
      continue;
    }
    if (stringIndices.has(label)) {
      dest->AppendElement(MakeResultNode(i));
      continue;
    }
    if (result.Length() >= MAX_QUERY_RESULTS) {
      break;
    }
  }

  size_t garbageIndex = 0;
  while (result.Length() < MAX_QUERY_RESULTS &&
         garbageIndex < garbage.Length()) {
    result.AppendElement(garbage.ElementAt(garbageIndex++));
  }
  return result;
}

Result<nsTArray<dom::CollectorLogNode>, LogError>
CollectorLogAnalyzerBackground::SampleNodesImpl() {
  MOZ_TRY(EnsureInitialized());

  AutoTArray<dom::CollectorLogNode, SAMPLE_COUNT> result;

  // Reservoir sampling. It's maybe a little overkill but if we ever want
  // to sample with a filter this is nicely extendable.
  for (NodeTableIndex i = 0; i < mNodeLabels.length(); ++i) {
    if (mNodeFlags[i] & dom::CollectorNodeFlags_Binding::GARBAGE) {
      continue;
    }
    if (result.Length() < SAMPLE_COUNT) {
      result.AppendElement(MakeResultNode(i));
    } else {
      NodeId id = mNodeIds[i];
      size_t randomEnough = HashGeneric(id);
      size_t randomIndex = randomEnough % i;
      if (randomIndex < SAMPLE_COUNT) {
        result[randomIndex] = MakeResultNode(i);
      }
    }
  }
  return result;
}

Result<Ok, LogError> CollectorLogAnalyzerBackground::InitImpl(
    const nsAString& aCCLogPath, const nsAString& aGCLogPath) {
  mHaveCC = aCCLogPath.Length() > 0;
  mHaveGC = aGCLogPath.Length() > 0;
  mCCFileSize = 0;
  mGCFileSize = 0;
  int64_t totalCCFileSize = 0;
  int64_t totalGCFileSize = 0;

  nsCOMPtr<nsIFile> ccLogFile;
  nsCOMPtr<nsIFile> gcLogFile;
  nsresult rv = NS_OK;
  if (mHaveCC) {
    rv = NS_NewLocalFile(aCCLogPath, getter_AddRefs(ccLogFile));
    if (NS_FAILED(rv)) {
      return Err(LogError(rv, "NS_NewLocalFile failed for CC log"));
    }
    int64_t fileSize;
    rv = ccLogFile->GetFileSize(&fileSize);
    if (NS_FAILED(rv)) {
      return Err(LogError(rv, "GetFileSize failed for CC log"));
    }
    mCCFileSize = totalCCFileSize = fileSize;
  }

  if (mHaveGC) {
    rv = NS_NewLocalFile(aGCLogPath, getter_AddRefs(gcLogFile));
    if (NS_FAILED(rv)) {
      return Err(LogError(rv, "NS_NewLocalFile failed for GC log"));
    }
    int64_t fileSize;
    rv = gcLogFile->GetFileSize(&fileSize);
    if (NS_FAILED(rv)) {
      return Err(LogError(rv, "GetFileSize failed for GC log"));
    }
    mGCFileSize = totalGCFileSize = fileSize;
  }

  int64_t maxChunkSize = 128 * 1024 * 1024;
  size_t bufferSize = size_t(
      std::min(maxChunkSize, std::max(totalCCFileSize, totalGCFileSize)));
  auto buffer = MakeUnique<char[]>(bufferSize);

  if (mHaveCC) {
    RefPtr<nsFileRandomAccessStream> ccStream = new nsFileRandomAccessStream();
    rv = ccStream->Init(ccLogFile, PR_RDONLY, 0, 0);
    if (NS_FAILED(rv)) {
      return Err(LogError(rv, "Failed to open CC log file at `%s`",
                          ccLogFile->HumanReadablePath().get()));
    }

    int64_t offset = 0;
    while (offset < totalCCFileSize) {
      rv = ccStream->Seek(PR_SEEK_SET, offset);
      if (NS_FAILED(rv)) {
        return Err(LogError(rv, "Failed to seek in CC log file"));
      }

      uint32_t toRead =
          uint32_t(std::min(int64_t(bufferSize - 1), totalCCFileSize - offset));
      uint32_t bytesRead = 0;
      rv = ccStream->Read(buffer.get(), toRead, &bytesRead);
      if (NS_FAILED(rv)) {
        return Err(LogError(rv, "Failed to read CC log file"));
      }
      if (bytesRead == 0) {
        return Err(
            LogError(NS_ERROR_FILE_CORRUPTED, "Unexpected end of CC file"));
      }
      buffer.get()[bytesRead] = '\0';

      bool containsFileEnd = offset + int64_t(bytesRead) == totalCCFileSize;
      size_t processed = MOZ_TRY(IngestCycleCollectorLog(
          nsDependentCString(buffer.get(), bytesRead), containsFileEnd));
      if (processed == 0) {
        return Err(
            LogError(NS_ERROR_FILE_CORRUPTED, "Failed to parse CC file"));
      }
      offset += int64_t(processed);
    }
  }

  if (mHaveGC) {
    RefPtr<nsFileRandomAccessStream> gcStream = new nsFileRandomAccessStream();
    rv = gcStream->Init(gcLogFile, PR_RDONLY, 0, 0);
    if (NS_FAILED(rv)) {
      return Err(LogError(rv, "Failed to open GC log file at `%s`",
                          gcLogFile->HumanReadablePath().get()));
    }

    int64_t offset = 0;
    while (offset < totalGCFileSize) {
      rv = gcStream->Seek(PR_SEEK_SET, offset);
      if (NS_FAILED(rv)) {
        return Err(LogError(rv, "Failed to seek in GC log file"));
      }

      uint32_t toRead =
          uint32_t(std::min(int64_t(bufferSize - 1), totalGCFileSize - offset));
      uint32_t bytesRead = 0;
      rv = gcStream->Read(buffer.get(), toRead, &bytesRead);
      if (NS_FAILED(rv)) {
        return Err(LogError(rv, "Failed to read GC log file"));
      }
      if (bytesRead == 0) {
        return Err(
            LogError(NS_ERROR_FILE_CORRUPTED, "Unexpected end of GC file"));
      }
      buffer.get()[bytesRead] = '\0';

      bool containsFileEnd = offset + int64_t(bytesRead) == totalGCFileSize;
      size_t processed = MOZ_TRY(IngestGarbageCollectorLog(
          nsDependentCString(buffer.get(), bytesRead), containsFileEnd));
      if (processed == 0) {
        return Err(
            LogError(NS_ERROR_FILE_CORRUPTED, "Failed to parse GC file"));
      }
      offset += int64_t(processed);
    }
  }

  return FinishInitialization();
}

Result<Ok, LogError> CollectorLogAnalyzerBackground::FinishInitialization() {
  // Free ingestion-only lookup tables now that parsing is complete.
  mStringTable.clearAndCompact();
  mNodeIdsToIndices.clearAndCompact();
  mCCReferenceCounts.compact();

  // Shrink all data vectors to their final sizes.
  mNodeIds.shrinkStorageToFit();
  mNodeLabels.shrinkStorageToFit();
  mNodeFlags.shrinkStorageToFit();
  mNodeEdges.shrinkStorageToFit();
  mObservedReferenceCounts.shrinkStorageToFit();
  mStrings.shrinkStorageToFit();
  mGCRoots.shrinkStorageToFit();
  mGCGrayRoots.shrinkStorageToFit();
  mIncrementalRoots.shrinkStorageToFit();

  // Sort weak map edges by source and record each source's first entry index.
  // Ensuring they are contiguous for each source will let us efficiently search
  // through weak map edges when traversing the graph.
  std::sort(mWeakMapEdges.begin(), mWeakMapEdges.end(),
            [](const WeakMapEdge& a, const WeakMapEdge& b) {
              return a.source() < b.source();
            });
  for (size_t i = 0; i < mWeakMapEdges.length(); ++i) {
    if (i == 0 || mWeakMapEdges[i].source() != mWeakMapEdges[i - 1].source()) {
      MOZ_ASSERT(mNodeEdges[mWeakMapEdges[i].source()].mWeakMap ==
                 INVALID_NODE);
      MOZ_ASSERT(mNodeEdges[mWeakMapEdges[i].source()].mWeakMapCount > 0);
      mNodeEdges[mWeakMapEdges[i].source()].mWeakMap = i;
    }
  }

  mQuerySize = mNodeEdges.length();

  for (NodeTableIndex current = 0; current < mNodeEdges.length(); ++current) {
    mQueryProgress++;
    HashSet<NodeTableIndex> ccSeen;

    const NodeEdgesDescriptor& edges = mNodeEdges[current];

    for (size_t i = 0; i < edges.mCCCount; i++) {
      NodeTableIndex edge = mEdges[edges.mCC + i];
      if (ccSeen.has(edge)) {
        continue;
      }
      MOZ_TRY(PutInSet(ccSeen, edge));
      mObservedReferenceCounts[edge]++;
    }

    for (size_t i = 0; i < edges.mGCCount; i++) {
      NodeTableIndex edge = mEdges[edges.mGC + i];
      if (ccSeen.has(edge)) {
        continue;
      }
      mObservedReferenceCounts[edge]++;
    }
  }

  // Classify CC-managed roots as hard or soft based on observed vs declared RC.
  for (NodeTableIndex current = 0; current < mNodeFlags.length(); ++current) {
    if (mNodeFlags[current] & dom::CollectorNodeFlags_Binding::CC_MANAGED &&
        mNodeFlags[current] & dom::CollectorNodeFlags_Binding::ROOT) {
      auto rcPtr = mCCReferenceCounts.lookup(current);
      uint32_t declaredRefCount = rcPtr ? rcPtr->value() : 0;
      uint32_t observedRefCount = mObservedReferenceCounts[current];
      if (observedRefCount >= declaredRefCount) {
        mNodeFlags[current] &= ~dom::CollectorNodeFlags_Binding::ROOT;
        mNodeFlags[current] |= dom::CollectorNodeFlags_Binding::SOFT_ROOT;

        MOZ_TRY(AppendToVector(mCCSoftRoots, current));
      } else {
        MOZ_TRY(AppendToVector(mCCRoots, current));
      }
    }
  }

  mCCRoots.shrinkStorageToFit();
  mCCSoftRoots.shrinkStorageToFit();

  mInitialized = true;
  return Ok();
}

struct PathNode {
  NodeTableIndex mFrom;
  NodeTableIndex mWeakMap;
  uint64_t mDistance;
  WeakMapEdgeKind mKind;
};

// BFS from roots to aNodeIndex, returning the shortest path.
// When aOnlyUseSoftRoots is false, searches from hard roots (GC black roots and
// CC roots with unexplained references) first.  If no path is found, retries
// with aOnlyUseSoftRoots = true.  When aOnlyUseSoftRoots is true, searches from
// soft roots (GC gray roots and CC roots whose references are fully accounted
// for) and returns None if no path is found.
Result<dom::CollectorLogRootPath, LogError>
CollectorLogAnalyzerBackground::GetPathToRootInner(NodeTableIndex aNodeIndex,
                                                   bool aOnlyUseSoftRoots) {
  MOZ_TRY(EnsureInitialized());

  dom::CollectorLogRootPath result;

  HashMap<NodeTableIndex, PathNode> paths;
  std::queue<NodeTableIndex> worklist;
  if (aOnlyUseSoftRoots) {
    for (NodeTableIndex root : mGCGrayRoots) {
      PathNode node = {INVALID_NODE, 0, 0, WeakMapEdgeKind::None};
      MOZ_TRY(PutInMap(paths, root, node));
      worklist.push(root);
    }

    for (NodeTableIndex root : mCCSoftRoots) {
      PathNode node = {INVALID_NODE, 0, 0, WeakMapEdgeKind::None};
      MOZ_TRY(PutInMap(paths, root, node));
      worklist.push(root);
    }
  } else {
    for (NodeTableIndex root : mGCRoots) {
      PathNode node = {INVALID_NODE, 0, 0, WeakMapEdgeKind::None};
      MOZ_TRY(PutInMap(paths, root, node));
      worklist.push(root);
    }
    for (NodeTableIndex root : mCCRoots) {
      PathNode node = {INVALID_NODE, 0, 0, WeakMapEdgeKind::None};
      MOZ_TRY(PutInMap(paths, root, node));
      worklist.push(root);
    }
  }

  // Incremental roots are objects touched during an incremental CC that must
  // be treated as live; include them regardless of soft-root mode.
  for (NodeTableIndex root : mIncrementalRoots) {
    auto p = paths.lookupForAdd(root);
    if (!p) {
      PathNode node = {INVALID_NODE, 0, 0, WeakMapEdgeKind::None};
      MOZ_TRY(AddToMap(paths, p, root, node));
      worklist.push(root);
    }
  }

  bool found = false;
  while (!worklist.empty()) {
    mQueryProgress++;
    mQuerySize = mQueryProgress + worklist.size();

    NodeTableIndex current = worklist.front();
    worklist.pop();

    auto pathLookup = paths.lookup(current);
    if (!pathLookup) {
      continue;
    }
    const PathNode& path = pathLookup->value();
    uint64_t distance = path.mDistance;
    uint64_t nextDistance = distance + 1;

    if (current == aNodeIndex) {
      found = true;
      break;
    }

    const NodeEdgesDescriptor& edges = mNodeEdges[current];

    for (size_t i = 0; i < edges.mCCCount; i++) {
      NodeTableIndex edge = mEdges[edges.mCC + i];
      auto p = paths.lookupForAdd(edge);
      if (!p) {
        PathNode edgeNode = {current, 0, nextDistance, WeakMapEdgeKind::None};
        MOZ_TRY(AddToMap(paths, p, edge, edgeNode));
        worklist.push(edge);
      }
    }

    for (size_t i = 0; i < edges.mGCCount; i++) {
      NodeTableIndex edge = mEdges[edges.mGC + i];
      auto p = paths.lookupForAdd(edge);
      if (!p) {
        PathNode edgeNode = {current, 0, nextDistance, WeakMapEdgeKind::None};
        MOZ_TRY(AddToMap(paths, p, edge, edgeNode));
        worklist.push(edge);
      }
    }

    for (size_t i = 0; i < edges.mWeakMapCount; i++) {
      WeakMapEdge edge = mWeakMapEdges[edges.mWeakMap + i];
      MOZ_ASSERT(edge.source() == current);
      if (!paths.has(edge.other())) {
        continue;
      }
      auto p = paths.lookupForAdd(edge.mValue);
      if (!p) {
        PathNode edgeNode = {edge.mKey, edge.mMap, nextDistance, edge.mKind};
        MOZ_TRY(AddToMap(paths, p, edge.mValue, edgeNode));
        worklist.push(edge.mValue);
      }
    }
  }

  if (aOnlyUseSoftRoots) {
    if (found) {
      result.mKind = dom::CollectorLogRootKind::Soft;
    } else {
      result.mKind = dom::CollectorLogRootKind::None;
    }
  } else {
    if (found) {
      result.mKind = dom::CollectorLogRootKind::Hard;
    } else {
      return GetPathToRootInner(aNodeIndex, /* aOnlyUseSoftRoots = */ true);
    }
  }

  std::queue<NodeTableIndex> resultWorklist;
  std::queue<NodeTableIndex> weakMapKeysToProcess;
  resultWorklist.push(aNodeIndex);
  HashSet<NodeTableIndex> processed;
  MOZ_TRY(PutInSet(processed, aNodeIndex));

  bool firstPath = true;
  while (!resultWorklist.empty()) {
    NodeTableIndex current = resultWorklist.front();
    resultWorklist.pop();

    nsTArray<dom::CollectorLogEdge> path;

    HashMap<NodeTableIndex, PathNode>::Ptr pathLookup;
    while ((pathLookup = paths.lookup(current))) {
      const PathNode& pathNode = pathLookup->value();

      dom::CollectorLogEdge edge;
      edge.mOther = MakeResultNode(current);

      if (pathNode.mFrom != INVALID_NODE) {
        const NodeEdgesDescriptor& edges = mNodeEdges[pathNode.mFrom];
        int64_t edgeIndex = -1;
        for (size_t i = 0; i < edges.mCCCount; i++) {
          if (mEdges[edges.mCC + i] == current) {
            edgeIndex = int64_t(edges.mCC) + int64_t(i);
            break;
          }
        }
        if (edgeIndex == -1) {
          for (size_t i = 0; i < edges.mGCCount; i++) {
            if (mEdges[edges.mGC + i] == current) {
              edgeIndex = int64_t(edges.mGC) + int64_t(i);
              break;
            }
          }
        }
        if (edgeIndex != -1) {
          edge.mLabel = nsCString(&mStrings[mEdgeLabels[edgeIndex]]);
        }
      }

      path.AppendElement(edge);
      current = pathNode.mFrom;

      if (pathNode.mWeakMap && !processed.has(pathNode.mWeakMap)) {
        MOZ_TRY(PutInSet(processed, pathNode.mWeakMap));
        resultWorklist.push(pathNode.mWeakMap);
        weakMapKeysToProcess.push(pathNode.mFrom);
      }
    }

    std::reverse(path.begin(), path.end());

    if (firstPath) {
      result.mPath = std::move(path);
      firstPath = false;
    } else {
      dom::CollectorLogWeakMapPath wmPath;
      NodeTableIndex key = weakMapKeysToProcess.front();
      weakMapKeysToProcess.pop();
      wmPath.mKey = MakeResultNode(key);
      wmPath.mPath = std::move(path);
      if (!result.mWeakMapPaths.AppendElement(std::move(wmPath),
                                              mozilla::fallible)) {
        return Err(LogError(NS_ERROR_OUT_OF_MEMORY,
                            "Out of memory growing weak map paths"));
      }
    }
  }

  return result;
}

Result<dom::CollectorLogNodeAdjacents, LogError>
CollectorLogAnalyzerBackground::GetNodeAdjacentsImpl(
    NodeTableIndex aNodeIndex) {
  MOZ_TRY(EnsureInitialized());

  if (aNodeIndex >= mNodeEdges.length()) {
    return Err(LogError(NS_ERROR_ILLEGAL_INPUT,
                        "Invalid node supplied to getNodeAdjacents"));
  }

  mQuerySize = mNodeEdges.length() + mNodeEdges[aNodeIndex].mCCCount +
               mNodeEdges[aNodeIndex].mGCCount;
  mQueryProgress = 0;

  nsTArray<dom::CollectorLogEdge> toSelf;
  nsTArray<dom::CollectorLogEdge> fromSelf;

  for (NodeTableIndex i = 0; i < mNodeEdges.length(); ++i) {
    mQueryProgress++;
    const NodeEdgesDescriptor& edges = mNodeEdges[i];
    bool foundCC = false;
    for (EdgeTableIndex j = 0; j < edges.mCCCount; ++j) {
      if (mEdges[edges.mCC + j] == aNodeIndex) {
        dom::CollectorLogEdge edge;
        edge.mOther = MakeResultNode(i);
        edge.mLabel = &mStrings[mEdgeLabels[edges.mCC + j]];
        toSelf.AppendElement(edge);
        foundCC = true;
      }
    }

    // The GC log can contain edges to nodes which effectively
    // are just duplicates of the edges already present in the
    // CC log. As a best effort attempt to not confuse, we
    // simply exclude GC edges from A -> B if we already have
    // a CC-reported edge from A -> B
    if (!foundCC) {
      for (EdgeTableIndex j = 0; j < edges.mGCCount; ++j) {
        if (mEdges[edges.mGC + j] == aNodeIndex) {
          dom::CollectorLogEdge edge;
          edge.mOther = MakeResultNode(i);
          edge.mLabel = &mStrings[mEdgeLabels[edges.mGC + j]];
          toSelf.AppendElement(edge);
          break;
        }
      }
    }

    if (toSelf.Length() >= MAX_QUERY_RESULTS) {
      break;
    }
  }

  {
    HashSet<NodeTableIndex> seen;
    const NodeEdgesDescriptor& edges = mNodeEdges[aNodeIndex];
    for (NodeTableIndex i = 0; i < edges.mCCCount; i++) {
      if (fromSelf.Length() >= MAX_QUERY_RESULTS) {
        break;
      }
      mQueryProgress++;
      dom::CollectorLogEdge edge;
      edge.mOther = MakeResultNode(mEdges[edges.mCC + i]);
      edge.mLabel = &mStrings[mEdgeLabels[edges.mCC + i]];
      fromSelf.AppendElement(edge);
      MOZ_TRY(PutInSet(seen, mEdges[edges.mCC + i]));
    }
    for (NodeTableIndex i = 0; i < edges.mGCCount; i++) {
      if (fromSelf.Length() >= MAX_QUERY_RESULTS) {
        break;
      }
      mQueryProgress++;
      if (!seen.has(mEdges[edges.mGC + i])) {
        dom::CollectorLogEdge edge;
        edge.mOther = MakeResultNode(mEdges[edges.mGC + i]);
        edge.mLabel = &mStrings[mEdgeLabels[edges.mGC + i]];
        fromSelf.AppendElement(edge);
      }
    }
  }

  dom::CollectorLogNodeAdjacents result;
  result.mToSelf = std::move(toSelf);
  result.mFromSelf = std::move(fromSelf);
  return result;
}

already_AddRefed<dom::Promise> CollectorLogAnalyzer::Init(ErrorResult& aRv) {
  return DispatchToBackground<Ok>(
      aRv, [background = mBackground, ccLogPath = nsString(mCCLogPath),
            gcLogPath = nsString(mGCLogPath)]() {
        return background->InitImpl(ccLogPath, gcLogPath);
      });
}

double CollectorLogAnalyzer::GetInitProgress() {
  return mBackground->GetInitProgress();
}

already_AddRefed<dom::Promise> CollectorLogAnalyzer::QueryNodes(
    const nsACString& aQuery, ErrorResult& aRv) {
  return DispatchToBackground<nsTArray<dom::CollectorLogNode>>(
      aRv, [background = mBackground, query = nsCString(aQuery)]() {
        return background->QueryNodesImpl(query);
      });
}

already_AddRefed<dom::Promise> CollectorLogAnalyzer::GetPathToRoot(
    const dom::CollectorLogNode& aNode, ErrorResult& aRv) {
  return DispatchToBackground<dom::CollectorLogRootPath>(
      aRv, [background = mBackground, nodeIndex = aNode.mIndex]() {
        return background->GetPathToRootImpl(nodeIndex);
      });
}

already_AddRefed<dom::Promise> CollectorLogAnalyzer::GetNodeAdjacents(
    const dom::CollectorLogNode& aNode, ErrorResult& aRv) {
  return DispatchToBackground<dom::CollectorLogNodeAdjacents>(
      aRv, [background = mBackground, nodeIndex = aNode.mIndex]() {
        return background->GetNodeAdjacentsImpl(nodeIndex);
      });
}

double CollectorLogAnalyzer::GetQueryProgress() {
  return mBackground->GetQueryProgress();
}

already_AddRefed<dom::Promise> CollectorLogAnalyzer::SampleNodes(
    ErrorResult& aRv) {
  return DispatchToBackground<nsTArray<dom::CollectorLogNode>>(
      aRv,
      [background = mBackground]() { return background->SampleNodesImpl(); });
}

/* static */
already_AddRefed<CollectorLogAnalyzer> CollectorLogAnalyzer::Constructor(
    dom::GlobalObject& aGlobal, const nsAString& aCCLogPath,
    const nsAString& aGCLogPath) {
  nsCOMPtr<nsIGlobalObject> globalSupports =
      do_QueryInterface(aGlobal.GetAsSupports());
  RefPtr<CollectorLogAnalyzer> analyzer =
      new CollectorLogAnalyzer(globalSupports, aCCLogPath, aGCLogPath);
  return analyzer.forget();
}

}  // namespace mozilla
