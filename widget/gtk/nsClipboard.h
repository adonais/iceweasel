/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsClipboard_h_
#define _nsClipboard_h_

#include <gtk/gtk.h>

#include "GUniquePtr.h"
#include "mozilla/Maybe.h"
#include "mozilla/Span.h"
#include "mozilla/widget/WebCustomFormatUtils.h"
#include "nsBaseClipboard.h"
#include "nsCOMPtr.h"
#include "nsIClipboard.h"
#include "nsIObserver.h"

namespace mozilla {

class ClipboardTargets {
  friend class ClipboardData;
  nsTArray<GdkAtom> mTargets;

 public:
  ClipboardTargets() = default;
  ClipboardTargets(GUniquePtr<GdkAtom> aTargets, int aTargetsNum);
  explicit ClipboardTargets(nsTArray<GdkAtom> aTargets)
      : mTargets(std::move(aTargets)) {}
  explicit ClipboardTargets(GList* aTargets);

  bool Contains(GdkAtom aTarget) const;
  void Set(ClipboardTargets);
  ClipboardTargets Clone() const;
  void Clear() { mTargets.Clear(); };

  mozilla::Span<GdkAtom> AsSpan() { return mTargets; }
  explicit operator bool() const { return !mTargets.IsEmpty(); }
};

class ClipboardData {
  GUniquePtr<char> mData;
  uint32_t mLength = 0;

 public:
  ClipboardData() = default;

  void SetData(Span<const uint8_t>);
  void SetText(Span<const char>);
  void SetTargets(GUniquePtr<GdkAtom> aTarget, int aTargetsNum);

  ClipboardTargets ExtractTargets();
  GUniquePtr<char> ExtractText() {
    mLength = 0;
    return std::move(mData);
  }

  Span<char> AsSpan() const { return {mData.get(), mLength}; }
  explicit operator bool() const { return bool(mData); }
};

enum class ClipboardDataType { Data, Text, Targets };

class RetrievalContext {
 public:
  // We intentionally use unsafe thread refcount as clipboard is used in
  // main thread only.
  NS_INLINE_DECL_REFCOUNTING(RetrievalContext)

  // Get actual clipboard content (GetClipboardData/GetClipboardText).
  virtual ClipboardData GetClipboardData(const char* aMimeType,
                                         int32_t aWhichClipboard) = 0;
  virtual GUniquePtr<char> GetClipboardText(int32_t aWhichClipboard) = 0;

  // Get data mime types which can be obtained from clipboard.
  virtual ClipboardTargets GetTargets(int32_t aWhichClipboard) = 0;

  virtual void ClearCachedTargets(int32_t aWhichClipboard) {}

  RetrievalContext() = default;

 protected:
  virtual ~RetrievalContext() = default;
};

class nsClipboard final : public nsBaseClipboard, public nsIObserver {
 public:
  nsClipboard();

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIOBSERVER

  // Make sure we are initialized, called from the factory
  // constructor
  nsresult Init(void);

  // Someone requested the selection
  void SelectionGetEvent(GtkClipboard* aGtkClipboard,
                         GtkSelectionData* aSelectionData);
  void SelectionClearEvent(GtkClipboard* aGtkClipboard);

  // Clipboard owner changed
  void OwnerChangedEvent(GtkClipboard* aGtkClipboard,
                         GdkEventOwnerChange* aEvent);

  Result<int32_t, nsresult> GetNativeClipboardSequenceNumber(
      ClipboardType aWhichClipboard) override;

 protected:
  // Implement the native clipboard behavior.
  NS_IMETHOD SetNativeClipboardData(nsITransferable* aTransferable,
                                    ClipboardType aWhichClipboard) override;
  Result<nsCOMPtr<nsISupports>, nsresult> GetNativeClipboardData(
      const nsACString& aFlavor, ClipboardType aWhichClipboard,
      uint64_t aThreshold = 0) override;
  void AsyncGetNativeClipboardData(const nsACString& aFlavor,
                                   ClipboardType aWhichClipboard,
                                   GetNativeDataCallback&& aCallback) override;
  nsresult EmptyNativeClipboardData(ClipboardType aWhichClipboard) override;
  Result<bool, nsresult> HasNativeClipboardDataMatchingFlavors(
      const nsTArray<nsCString>& aFlavorList,
      ClipboardType aWhichClipboard) override;
  void AsyncHasNativeClipboardDataMatchingFlavors(
      const nsTArray<nsCString>& aFlavorList, ClipboardType aWhichClipboard,
      HasMatchingFlavorsCallback&& aCallback) override;

 public:
  // Same shape as HasMatchingFlavorsCallback, but the second argument carries
  // a WebCustomFormatMap that the async flavor query may have fetched while
  // resolving "web foo/bar" entries. A chained AsyncGet call can reuse the
  // map instead of re-fetching the JSON. The cross-platform
  // HasMatchingFlavorsCallback is unchanged; this richer variant is used
  // only internally on Linux. The alias is public so a file-scope helper
  // (TargetCallbackHandler) can hold instances of it; the method taking it
  // is private.
  using HasMatchingFlavorsCallbackWithMap = mozilla::MoveOnlyFunction<void(
      mozilla::Result<nsTArray<nsCString>, nsresult>,
      mozilla::Maybe<mozilla::widget::WebCustomFormatMap>)>;

 private:
  virtual ~nsClipboard();

  void AsyncHasNativeClipboardDataMatchingFlavorsWithMap(
      const nsTArray<nsCString>& aFlavorList, ClipboardType aWhichClipboard,
      HasMatchingFlavorsCallbackWithMap&& aCallback);

  // Get our hands on the correct transferable, given a specific
  // clipboard
  nsITransferable* GetTransferable(int32_t aWhichClipboard);

  void ClearTransferable(int32_t aWhichClipboard);
  void ClearCachedTargets(int32_t aWhichClipboard);

  // X11 TARGETS-based filter for sync reads. Compares aFlavor literally
  // against the published target atoms; callers are responsible for
  // resolving virtual flavors (e.g. "web foo/bar") to their real target
  // atom name before passing them in.
  bool HasSuitableData(int32_t aWhichClipboard, const nsACString& aFlavor);

  // Sync-fetch the web custom format map target's JSON payload from the
  // system clipboard and parse it. Returns an empty map if the target isn't
  // published, the fetch failed, or the JSON is malformed.
  mozilla::widget::WebCustomFormatMap GetWebCustomFormatMapFromClipboard(
      int32_t aWhichClipboard);

  // Hang on to our transferables so we can transfer data when asked.
  nsCOMPtr<nsITransferable> mSelectionTransferable;
  nsCOMPtr<nsITransferable> mGlobalTransferable;
  RefPtr<RetrievalContext> mContext;

  // Map "web foo/bar" essence -> slot name ("Web Custom FormatN") for each
  // clipboard type. Built when the transferable is published with custom
  // format flavors; consulted in SelectionGetEvent to serve the map JSON
  // and the per-slot payloads.
  mozilla::widget::WebCustomFormatMap mSelectionWebCustomFormatMap;
  mozilla::widget::WebCustomFormatMap mGlobalWebCustomFormatMap;
  mozilla::widget::WebCustomFormatMap& WebCustomFormatMapFor(
      int32_t aWhichClipboard) {
    return aWhichClipboard == kSelectionClipboard ? mSelectionWebCustomFormatMap
                                                  : mGlobalWebCustomFormatMap;
  }

  void IncrementSequenceNumber(int32_t aWhichClipboard) {
    if (aWhichClipboard == kSelectionClipboard) {
      mSelectionSequenceNumber++;
    } else {
      mGlobalSequenceNumber++;
    }
  }
  int32_t GetSequenceNumber(int32_t aWhichClipboard) {
    return (aWhichClipboard == kSelectionClipboard) ? mSelectionSequenceNumber
                                                    : mGlobalSequenceNumber;
  }

  // Sequence number of the system clipboard data.
  int32_t mSelectionSequenceNumber = 0;
  int32_t mGlobalSequenceNumber = 0;

  void MarkNextOwnerClipboardChange(int32_t aWhichClipboard, bool aOurChange) {
    if (aWhichClipboard == kSelectionClipboard) {
      mWeSetSelectionData = aOurChange;
    } else {
      mWeSetGlobalData = aOurChange;
    }
  }
  bool IsOurOwnerClipboardChange(int32_t aWhichClipboard) {
    return (aWhichClipboard == kSelectionClipboard) ? mWeSetSelectionData
                                                    : mWeSetGlobalData;
  }

  bool mWeSetSelectionData = false;
  bool mWeSetGlobalData = false;
};

extern const int kClipboardTimeout;
extern const int kClipboardFastIterationNum;

GdkAtom GetSelectionAtom(int32_t aWhichClipboard);
Maybe<nsIClipboard::ClipboardType> GetGeckoClipboardType(
    GtkClipboard* aGtkClipboard);

};  // namespace mozilla

#endif /* _nsClipboard_h_ */
