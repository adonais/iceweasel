/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_ClipboardItem_h_
#define mozilla_dom_ClipboardItem_h_

#include "mozilla/MozPromise.h"
#include "mozilla/dom/Blob.h"
#include "mozilla/dom/ClipboardBinding.h"
#include "mozilla/dom/PromiseNativeHandler.h"
#include "nsIClipboard.h"
#include "nsWrapperCache.h"

class nsITransferable;

namespace mozilla::dom {

struct ClipboardItemOptions;
template <typename KeyType, typename ValueType>
class Record;
class Promise;

class ClipboardItem final : public nsWrapperCache {
 public:
  class ItemEntry final : public PromiseNativeHandler,
                          public nsIAsyncClipboardRequestCallback {
   public:
    using GetDataPromise =
        MozPromise<OwningStringOrBlob, nsresult, /* IsExclusive = */ true>;

    NS_DECL_CYCLE_COLLECTING_ISUPPORTS_FINAL
    NS_DECL_NSIASYNCCLIPBOARDREQUESTCALLBACK
    NS_DECL_CYCLE_COLLECTION_CLASS_AMBIGUOUS(ItemEntry, PromiseNativeHandler)

    explicit ItemEntry(nsIGlobalObject* aGlobal, const nsAString& aType,
                       const bool aIsUnsupportedType = false)
        : mGlobal(aGlobal),
          mType(aType),
          mIsUnsupportedType(aIsUnsupportedType) {
      MOZ_ASSERT(mGlobal);
    }
    ItemEntry(nsIGlobalObject* aGlobal, const nsAString& aType,
              const nsAString& aData)
        : ItemEntry(aGlobal, aType) {
      mLoadResult.emplace(NS_OK);
      mData.SetAsString() = aData;
    }

    // PromiseNativeHandler
    void ResolvedCallback(JSContext* aCx, JS::Handle<JS::Value> aValue,
                          ErrorResult& aRv) override;
    void RejectedCallback(JSContext* aCx, JS::Handle<JS::Value> aValue,
                          ErrorResult& aRv) override;

    const nsString& Type() const { return mType; }
    RefPtr<GetDataPromise> GetData();

    //  Load data from system clipboard.
    void LoadDataFromSystemClipboard(nsIClipboardDataSnapshot* aDataGetter);
    void LoadDataFromDataPromise(Promise& aDataPromise);

    // If clipboard data is in the process of loading from either system
    // clipboard or data promise, add `aPromise` to the pending list which will
    // be resolved/rejected later when process is finished. Otherwise,
    // resolve/reject `aPromise` based on cached result and data.
    void ReactGetTypePromise(Promise& aPromise);

    const bool& IsUnsupportedType() const { return mIsUnsupportedType; }

   private:
    ~ItemEntry() {
      if (!mPendingGetDataRequests.IsEmpty()) {
        RejectPendingPromises(NS_ERROR_FAILURE);
      }
    };

    void MaybeResolveGetTypePromise(const OwningStringOrBlob& aData,
                                    Promise& aPromise);
    void MaybeResolvePendingPromises(OwningStringOrBlob&& aData);
    void RejectPendingPromises(nsresult rv);

    nsCOMPtr<nsIGlobalObject> mGlobal;

    // MIME type of this entry.
    nsString mType;
    // True if the mType is a valid mime type format, but not in supported type.
    // See https://www.w3.org/TR/clipboard-apis/#dom-clipboarditem-supports
    bool mIsUnsupportedType;

    // Cache the loading result.
    OwningStringOrBlob mData;
    Maybe<nsresult> mLoadResult;

    // Indicates if the data is still being loaded.
    bool mIsLoadingData = false;
    nsCOMPtr<nsITransferable> mTransferable;

    // Pending promises for data retrieval requests.
    nsTArray<MozPromiseHolder<GetDataPromise>> mPendingGetDataRequests;
    nsTArray<RefPtr<Promise>> mPendingGetTypeRequests;
  };

  NS_INLINE_DECL_CYCLE_COLLECTING_NATIVE_REFCOUNTING(ClipboardItem)
  NS_DECL_CYCLE_COLLECTION_NATIVE_WRAPPERCACHE_CLASS(ClipboardItem)

  ClipboardItem(nsISupports* aOwner, dom::PresentationStyle aPresentationStyle,
                nsTArray<RefPtr<ItemEntry>>&& aItems,
                const uint32_t& aCustomFormatCount = 0);

  static already_AddRefed<ClipboardItem> Constructor(
      const GlobalObject& aGlobal,
      const Record<nsString, OwningNonNull<Promise>>& aItems,
      const ClipboardItemOptions& aOptions, ErrorResult& aRv);

  static bool Supports(const GlobalObject& aGlobal, const nsAString& aType);

  /**
   * Verify the passed input string is a valid mimeType or not.
   * Return false, if the input string is not a valid mimeType or web custom
   * format.
   *
   * @aInput: The input string.
   * @aMimeType: The parsed mime type string.
   * @aIsCustom: True, if the input string is a web custom format
   * @aIsUnsupported: True, if the input string is a valid mime type format, but
   *      not a supported type for Clipboard API.
   *      https://www.w3.org/TR/clipboard-apis/#dom-clipboarditem-supports
   */
  static bool ParseMimeType(const nsAString& aInput, nsString& aMimeType,
                            bool* aIsCustom, bool* aIsUnsupported);

  dom::PresentationStyle PresentationStyle() const {
    return mPresentationStyle;
  };
  void GetTypes(nsTArray<nsString>& aTypes) const;

  already_AddRefed<Promise> GetType(const nsAString& aType, ErrorResult& aRv);

  nsISupports* GetParentObject() const { return mOwner; }

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  const nsTArray<RefPtr<ItemEntry>>& Entries() const { return mItems; }

  const uint32_t& CustomFormatCount() const { return mCustomFormatCount; }

 private:
  ~ClipboardItem() = default;

  nsCOMPtr<nsISupports> mOwner;
  dom::PresentationStyle mPresentationStyle;
  nsTArray<RefPtr<ItemEntry>> mItems;

  // mCustomFormatCount is only set in ClipboardItem::Constructor.
  // It is used to check number of Custom Format could not over 100.
  uint32_t mCustomFormatCount;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_ClipboardItem_h_
