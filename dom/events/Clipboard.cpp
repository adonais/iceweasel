/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/Clipboard.h"

#include <algorithm>

#include "imgIContainer.h"
#include "imgITools.h"
#include "mozilla/AbstractThread.h"
#include "mozilla/BasePrincipal.h"
#include "mozilla/RefPtr.h"
#include "mozilla/Result.h"
#include "mozilla/ResultVariant.h"
#include "mozilla/StaticPrefs_dom.h"
#include "mozilla/dom/BlobBinding.h"
#include "mozilla/dom/ClipboardBinding.h"
#include "mozilla/dom/ClipboardItem.h"
#include "mozilla/dom/ContentChild.h"
#include "mozilla/dom/DataTransfer.h"
#include "mozilla/dom/DataTransferItem.h"
#include "mozilla/dom/DataTransferItemList.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/dom/PromiseNativeHandler.h"
#include "nsArrayUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsContentUtils.h"
#include "nsGlobalWindowInner.h"
#include "nsIClipboard.h"
#include "nsIInputStream.h"
#include "nsIParserUtils.h"
#include "nsISupportsPrimitives.h"
#include "nsITransferable.h"
#include "nsNetUtil.h"
#include "nsPrintfCString.h"
#include "nsServiceManagerUtils.h"
#include "nsStreamUtils.h"
#include "nsStringStream.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"
#include "nsVariant.h"

static mozilla::LazyLogModule gClipboardLog("Clipboard");

namespace mozilla::dom {

// Maximum number of "web foo/bar" custom format entries permitted per
// ClipboardItem on write. The cap is defined by the Async Clipboard spec's
// "write web custom formats" algorithm, step 4.6:
//   https://www.w3.org/TR/clipboard-apis/#write-web-custom-formats
// Enforced at the DOM layer; platform clipboard backends rely on this cap.
static constexpr uint32_t kMaxWebCustomFormatCount = 100;

Clipboard::Clipboard(nsPIDOMWindowInner* aWindow)
    : DOMEventTargetHelper(aWindow) {}

Clipboard::~Clipboard() = default;

// static
bool Clipboard::IsTestingPrefEnabledOrHasReadPermission(
    nsIPrincipal& aSubjectPrincipal) {
  return IsTestingPrefEnabled() ||
         nsContentUtils::PrincipalHasPermission(aSubjectPrincipal,
                                                nsGkAtoms::clipboardRead);
}

// Mandatory data types defined in
// https://w3c.github.io/clipboard-apis/#mandatory-data-types-x. The types
// should be in the same order as kNonPlainTextExternalFormats in
// DataTransfer.
static const nsLiteralCString kMandatoryDataTypes[] = {
    nsLiteralCString(kHTMLMime), nsLiteralCString(kTextMime),
    nsLiteralCString(kPNGImageMime)};

// static
Span<const nsLiteralCString> Clipboard::MandatoryDataTypes() {
  return Span<const nsLiteralCString>(kMandatoryDataTypes);
}

namespace {

/**
 * This is a base class for ClipboardGetCallbackForRead and
 * ClipboardGetCallbackForReadText.
 */
class ClipboardGetCallback : public nsIClipboardGetDataSnapshotCallback {
 public:
  explicit ClipboardGetCallback(RefPtr<Promise>&& aPromise)
      : mPromise(std::move(aPromise)) {}

  // nsIClipboardGetDataSnapshotCallback
  NS_IMETHOD OnError(nsresult aResult) override final {
    MOZ_ASSERT(mPromise);
    RefPtr<Promise> p(std::move(mPromise));
    p->MaybeRejectWithNotAllowedError(
        "Clipboard read operation is not allowed.");
    return NS_OK;
  }

 protected:
  virtual ~ClipboardGetCallback() { MOZ_ASSERT(!mPromise); };

  // Not cycle-collected, because it should be nulled when the request is
  // answered, rejected or aborted.
  RefPtr<Promise> mPromise;
};

class ClipboardGetCallbackForRead final : public ClipboardGetCallback {
 public:
  explicit ClipboardGetCallbackForRead(nsIGlobalObject* aGlobal,
                                       RefPtr<Promise>&& aPromise)
      : ClipboardGetCallback(std::move(aPromise)), mGlobal(aGlobal) {}

  // This object will never be held by a cycle-collected object, so it doesn't
  // need to be cycle-collected despite holding alive cycle-collected objects.
  NS_DECL_ISUPPORTS

  // nsIClipboardGetDataSnapshotCallback
  NS_IMETHOD OnSuccess(
      nsIClipboardDataSnapshot* aClipboardDataSnapshot) override {
    MOZ_ASSERT(mPromise);
    MOZ_ASSERT(aClipboardDataSnapshot);

    nsTArray<nsCString> flavorList;
    nsresult rv = aClipboardDataSnapshot->GetFlavorList(flavorList);
    if (NS_FAILED(rv)) {
      return OnError(rv);
    }

    AutoTArray<RefPtr<ClipboardItem::ItemEntry>, 3> entries;
    // We might reuse the request from DataTransfer created for paste event,
    // which could contain more types that are not in the mandatory list.
    // If there is any web custom formats in the list, it should be added before
    // kMandatoryDataTypes.
    for (const auto& format : flavorList) {
      // custom format
      if (StringBeginsWith(format, nsLiteralCString(kWebCustomFormatPrefix))) {
        auto entry = MakeRefPtr<ClipboardItem::ItemEntry>(
            mGlobal, NS_ConvertUTF8toUTF16(format));
        entry->LoadDataFromSystemClipboard(aClipboardDataSnapshot);
        entries.AppendElement(std::move(entry));
      }
    }
    for (const auto& format : kMandatoryDataTypes) {
      // format in kMandatoryDataTypes
      if (flavorList.Contains(format)) {
        auto entry = MakeRefPtr<ClipboardItem::ItemEntry>(
            mGlobal, NS_ConvertUTF8toUTF16(format));
        entry->LoadDataFromSystemClipboard(aClipboardDataSnapshot);
        entries.AppendElement(std::move(entry));
      }
    }

    RefPtr<Promise> p(std::move(mPromise));
    if (entries.IsEmpty()) {
      p->MaybeResolve(nsTArray<RefPtr<ClipboardItem>>{});
      return NS_OK;
    }

    // We currently only support one clipboard item.
    p->MaybeResolve(
        AutoTArray<RefPtr<ClipboardItem>, 1>{MakeRefPtr<ClipboardItem>(
            mGlobal, PresentationStyle::Unspecified, std::move(entries))});

    return NS_OK;
  }

 protected:
  ~ClipboardGetCallbackForRead() = default;

  nsCOMPtr<nsIGlobalObject> mGlobal;
};

NS_IMPL_ISUPPORTS(ClipboardGetCallbackForRead,
                  nsIClipboardGetDataSnapshotCallback)

class ClipboardGetCallbackForReadText final
    : public ClipboardGetCallback,
      public nsIAsyncClipboardRequestCallback {
 public:
  explicit ClipboardGetCallbackForReadText(RefPtr<Promise>&& aPromise)
      : ClipboardGetCallback(std::move(aPromise)) {}

  // This object will never be held by a cycle-collected object, so it doesn't
  // need to be cycle-collected despite holding alive cycle-collected objects.
  NS_DECL_ISUPPORTS

  // nsIClipboardGetDataSnapshotCallback
  NS_IMETHOD OnSuccess(
      nsIClipboardDataSnapshot* aClipboardDataSnapshot) override {
    MOZ_ASSERT(mPromise);
    MOZ_ASSERT(!mTransferable);
    MOZ_ASSERT(aClipboardDataSnapshot);

    AutoTArray<nsCString, 3> flavors;
    nsresult rv = aClipboardDataSnapshot->GetFlavorList(flavors);
    if (NS_FAILED(rv)) {
      return OnError(rv);
    }

    mTransferable = do_CreateInstance("@mozilla.org/widget/transferable;1");
    if (NS_WARN_IF(!mTransferable)) {
      return OnError(NS_ERROR_UNEXPECTED);
    }

    mTransferable->Init(nullptr);
    mTransferable->AddDataFlavor(kTextMime);
    if (!flavors.Contains(kTextMime)) {
      return OnComplete(NS_OK);
    }

    rv = aClipboardDataSnapshot->GetData(mTransferable, this);
    if (NS_FAILED(rv)) {
      return OnError(rv);
    }

    return NS_OK;
  }

  // nsIAsyncClipboardRequestCallback
  NS_IMETHOD OnComplete(nsresult aResult) override {
    MOZ_ASSERT(mPromise);
    MOZ_ASSERT(mTransferable);

    if (NS_FAILED(aResult)) {
      return OnError(aResult);
    }

    nsAutoString str;
    nsCOMPtr<nsISupports> data;
    nsresult rv =
        mTransferable->GetTransferData(kTextMime, getter_AddRefs(data));
    if (!NS_WARN_IF(NS_FAILED(rv))) {
      nsCOMPtr<nsISupportsString> supportsstr = do_QueryInterface(data);
      MOZ_ASSERT(supportsstr);
      if (supportsstr) {
        supportsstr->GetData(str);
      }
    }

    RefPtr<Promise> p(std::move(mPromise));
    p->MaybeResolve(str);

    return NS_OK;
  }

 protected:
  ~ClipboardGetCallbackForReadText() = default;

  nsCOMPtr<nsITransferable> mTransferable;
};

NS_IMPL_ISUPPORTS(ClipboardGetCallbackForReadText,
                  nsIClipboardGetDataSnapshotCallback,
                  nsIAsyncClipboardRequestCallback)

}  // namespace

void Clipboard::RequestRead(Promise& aPromise, const ReadRequestType& aType,
                            nsPIDOMWindowInner& aOwner,
                            nsIPrincipal& aSubjectPrincipal,
                            nsIClipboardDataSnapshot& aRequest) {
#ifdef DEBUG
  bool isValid = false;
  MOZ_ASSERT(NS_SUCCEEDED(aRequest.GetValid(&isValid)) && isValid);
#endif

  RefPtr<ClipboardGetCallback> callback;
  switch (aType) {
    case ReadRequestType::eRead: {
      callback =
          MakeRefPtr<ClipboardGetCallbackForRead>(aOwner.AsGlobal(), &aPromise);
      break;
    }
    case ReadRequestType::eReadText: {
      callback = MakeRefPtr<ClipboardGetCallbackForReadText>(&aPromise);
      break;
    }
    default: {
      MOZ_ASSERT_UNREACHABLE("Unknown read type");
      return;
    }
  }

  MOZ_ASSERT(callback);
  callback->OnSuccess(&aRequest);
}

void Clipboard::RequestRead(Promise* aPromise, ReadRequestType aType,
                            nsPIDOMWindowInner* aOwner,
                            nsIPrincipal& aPrincipal) {
  RefPtr<Promise> p(aPromise);
  nsCOMPtr<nsPIDOMWindowInner> owner(aOwner);

  nsresult rv;
  nsCOMPtr<nsIClipboard> clipboardService(
      do_GetService("@mozilla.org/widget/clipboard;1", &rv));
  if (NS_FAILED(rv)) {
    p->MaybeReject(NS_ERROR_UNEXPECTED);
    return;
  }

  RefPtr<ClipboardGetCallback> callback;
  switch (aType) {
    case ReadRequestType::eRead: {
      nsCOMPtr<nsIGlobalObject> global = do_QueryInterface(owner);
      if (NS_WARN_IF(!global)) {
        p->MaybeReject(NS_ERROR_UNEXPECTED);
        return;
      }

      AutoTArray<nsCString, std::size(kMandatoryDataTypes) + 1> types;
      if (StaticPrefs::dom_clipboard_customFormatSupport_enabled()) {
        // This is for reading web custom format.
        // This type should not be in the returned transferable.
        types.AppendElement(nsLiteralCString(kWebCustomFormatMapType));
      }
      types.AppendElements(Span<const nsLiteralCString>(kMandatoryDataTypes));

      callback = MakeRefPtr<ClipboardGetCallbackForRead>(global, std::move(p));
      rv = clipboardService->GetDataSnapshot(
          types, nsIClipboard::kGlobalClipboard, owner->GetWindowContext(),
          &aPrincipal, callback);
      break;
    }
    case ReadRequestType::eReadText: {
      callback = MakeRefPtr<ClipboardGetCallbackForReadText>(std::move(p));
      rv = clipboardService->GetDataSnapshot(
          AutoTArray<nsCString, 1>{nsLiteralCString(kTextMime)},
          nsIClipboard::kGlobalClipboard, owner->GetWindowContext(),
          &aPrincipal, callback);
      break;
    }
    default: {
      MOZ_ASSERT_UNREACHABLE("Unknown read type");
      break;
    }
  }

  if (NS_FAILED(rv)) {
    MOZ_ASSERT(callback);
    callback->OnError(rv);
    return;
  }
}

already_AddRefed<Promise> Clipboard::ReadHelper(nsIPrincipal& aSubjectPrincipal,
                                                ReadRequestType aType,
                                                ErrorResult& aRv) {
  // Create a new promise
  nsGlobalWindowInner* owner = GetOwnerWindow();
  RefPtr<Promise> p = dom::Promise::Create(owner, aRv);
  if (aRv.Failed()) {
    return nullptr;
  }

  // If a "paste" clipboard event is actively being processed, we're
  // intentionally skipping permission/user-activation checks and giving the
  // webpage access to the clipboard.
  if (RefPtr<DataTransfer> dataTransfer =
          owner->GetCurrentPasteDataTransfer()) {
    // If there is valid nsIClipboardDataSnapshot, use it directly.
    if (nsCOMPtr<nsIClipboardDataSnapshot> clipboardDataSnapshot =
            dataTransfer->GetClipboardDataSnapshot()) {
      bool isValid = false;
      clipboardDataSnapshot->GetValid(&isValid);
      if (isValid) {
        RequestRead(*p, aType, *owner, aSubjectPrincipal,
                    *clipboardDataSnapshot);
        return p.forget();
      }
    }
  }

  if (IsTestingPrefEnabledOrHasReadPermission(aSubjectPrincipal)) {
    MOZ_LOG(GetClipboardLog(), LogLevel::Debug,
            ("%s: testing pref enabled or has read permission", __FUNCTION__));
  } else {
    // Testing pref is not enabled and no read permission (for extension), so
    // need to check user activation.
    WindowContext* windowContext = owner->GetWindowContext();
    if (!windowContext) {
      MOZ_ASSERT_UNREACHABLE("There should be a WindowContext.");
      p->MaybeRejectWithUndefined();
      return p.forget();
    }

    // If no transient user activation, reject the promise and return.
    if (!windowContext->HasValidTransientUserGestureActivation()) {
      p->MaybeRejectWithNotAllowedError(
          "Clipboard read request was blocked due to lack of "
          "user activation.");
      return p.forget();
    }
  }

  RequestRead(p, aType, owner, aSubjectPrincipal);
  return p.forget();
}

already_AddRefed<Promise> Clipboard::Read(nsIPrincipal& aSubjectPrincipal,
                                          ErrorResult& aRv) {
  return ReadHelper(aSubjectPrincipal, ReadRequestType::eRead, aRv);
}

already_AddRefed<Promise> Clipboard::ReadText(nsIPrincipal& aSubjectPrincipal,
                                              ErrorResult& aRv) {
  return ReadHelper(aSubjectPrincipal, ReadRequestType::eReadText, aRv);
}

namespace {

struct NativeEntry {
  nsString mType;
  nsCOMPtr<nsIVariant> mData;

  NativeEntry(const nsAString& aType, nsIVariant* aData)
      : mType(aType), mData(aData) {}
};
using NativeEntryPromise = MozPromise<NativeEntry, CopyableErrorResult, false>;

class BlobTextHandler final : public PromiseNativeHandler {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS

  explicit BlobTextHandler(const nsAString& aType) : mType(aType) {}

  RefPtr<NativeEntryPromise> Promise() { return mHolder.Ensure(__func__); }

  void Reject() {
    CopyableErrorResult rv;
    rv.ThrowUnknownError("Unable to read blob for '"_ns +
                         NS_ConvertUTF16toUTF8(mType) + "' as text."_ns);
    mHolder.Reject(rv, __func__);
  }

  void ResolvedCallback(JSContext* aCx, JS::Handle<JS::Value> aValue,
                        ErrorResult& aRv) override {
    AssertIsOnMainThread();

    nsString text;
    if (!ConvertJSValueToUSVString(aCx, aValue, "ClipboardItem text", text)) {
      Reject();
      return;
    }

    RefPtr<nsVariantCC> variant = new nsVariantCC();
    variant->SetAsAString(text);

    NativeEntry native(mType, variant);
    mHolder.Resolve(std::move(native), __func__);
  }

  void RejectedCallback(JSContext* aCx, JS::Handle<JS::Value> aValue,
                        ErrorResult& aRv) override {
    Reject();
  }

 private:
  ~BlobTextHandler() = default;

  nsString mType;
  MozPromiseHolder<NativeEntryPromise> mHolder;
};

NS_IMPL_ISUPPORTS0(BlobTextHandler)

static RefPtr<NativeEntryPromise> GetStringNativeEntry(
    const nsAString& aType, const OwningStringOrBlob& aData) {
  if (aData.IsString()) {
    RefPtr<nsVariantCC> variant = new nsVariantCC();
    variant->SetAsAString(aData.GetAsString());
    NativeEntry native(aType, variant);
    return NativeEntryPromise::CreateAndResolve(native, __func__);
  }

  RefPtr<BlobTextHandler> handler = new BlobTextHandler(aType);
  IgnoredErrorResult ignored;
  RefPtr<Promise> promise = aData.GetAsBlob()->Text(ignored);
  if (ignored.Failed()) {
    CopyableErrorResult rv;
    rv.ThrowUnknownError("Unable to read blob for '"_ns +
                         NS_ConvertUTF16toUTF8(aType) + "' as text."_ns);
    return NativeEntryPromise::CreateAndReject(rv, __func__);
  }
  promise->AppendNativeHandler(handler);
  return handler->Promise();
}

class ImageDecodeCallback final : public imgIContainerCallback {
 public:
  NS_DECL_ISUPPORTS

  explicit ImageDecodeCallback(const nsAString& aType) : mType(aType) {}

  RefPtr<NativeEntryPromise> Promise() { return mHolder.Ensure(__func__); }

  NS_IMETHOD OnImageReady(imgIContainer* aImage, nsresult aStatus) override {
    // Request the image's width to force decoding the image header.
    int32_t ignored;
    if (NS_FAILED(aStatus) || NS_FAILED(aImage->GetWidth(&ignored))) {
      CopyableErrorResult rv;
      rv.ThrowDataError("Unable to decode blob for '"_ns +
                        NS_ConvertUTF16toUTF8(mType) + "' as image."_ns);
      mHolder.Reject(rv, __func__);
      return NS_OK;
    }

    RefPtr<nsVariantCC> variant = new nsVariantCC();
    variant->SetAsISupports(aImage);

    // Note: We always put the image as "native" on the clipboard.
    NativeEntry native(NS_LITERAL_STRING_FROM_CSTRING(kNativeImageMime),
                       variant);
    mHolder.Resolve(std::move(native), __func__);
    return NS_OK;
  };

 private:
  ~ImageDecodeCallback() = default;

  nsString mType;
  MozPromiseHolder<NativeEntryPromise> mHolder;
};

NS_IMPL_ISUPPORTS(ImageDecodeCallback, imgIContainerCallback)

static RefPtr<NativeEntryPromise> GetImageNativeEntry(
    const nsAString& aType, const OwningStringOrBlob& aData) {
  if (aData.IsString()) {
    CopyableErrorResult rv;
    rv.ThrowTypeError("DOMString not supported for '"_ns +
                      NS_ConvertUTF16toUTF8(aType) + "' as image data."_ns);
    return NativeEntryPromise::CreateAndReject(rv, __func__);
  }

  IgnoredErrorResult ignored;
  nsCOMPtr<nsIInputStream> stream;
  aData.GetAsBlob()->CreateInputStream(getter_AddRefs(stream), ignored);
  if (ignored.Failed()) {
    CopyableErrorResult rv;
    rv.ThrowUnknownError("Unable to read blob for '"_ns +
                         NS_ConvertUTF16toUTF8(aType) + "' as image."_ns);
    return NativeEntryPromise::CreateAndReject(rv, __func__);
  }

  RefPtr<ImageDecodeCallback> callback = new ImageDecodeCallback(aType);
  nsCOMPtr<imgITools> imgtool = do_CreateInstance("@mozilla.org/image/tools;1");
  imgtool->DecodeImageAsync(stream, NS_ConvertUTF16toUTF8(aType), callback,
                            GetMainThreadSerialEventTarget());
  return callback->Promise();
}

static Result<NativeEntry, ErrorResult> SanitizeNativeEntry(
    const NativeEntry& aEntry) {
  MOZ_ASSERT(aEntry.mType.EqualsLiteral(kHTMLMime));

  nsAutoString string;
  aEntry.mData->GetAsAString(string);

  nsCOMPtr<nsIParserUtils> parserUtils =
      do_GetService(NS_PARSERUTILS_CONTRACTID);
  if (!parserUtils) {
    ErrorResult rv;
    rv.ThrowUnknownError("Error while processing '"_ns +
                         NS_ConvertUTF16toUTF8(aEntry.mType) + "'."_ns);
    return Err(std::move(rv));
  }

  uint32_t flags = nsIParserUtils::SanitizerAllowStyle |
                   nsIParserUtils::SanitizerAllowComments;
  nsAutoString sanitized;
  if (NS_FAILED(parserUtils->Sanitize(string, flags, sanitized))) {
    ErrorResult rv;
    rv.ThrowUnknownError("Error while processing '"_ns +
                         NS_ConvertUTF16toUTF8(aEntry.mType) + "'."_ns);
    return Err(std::move(rv));
  }

  RefPtr<nsVariantCC> variant = new nsVariantCC();
  variant->SetAsAString(sanitized);
  return NativeEntry(aEntry.mType, variant);
}

class WebCustomFormatStreamCallback final : public nsIInputStreamCallback {
 public:
  NS_DECL_ISUPPORTS

  NS_IMETHOD
  OnInputStreamReady(nsIAsyncInputStream* aStream) override {
    MOZ_ASSERT(NS_IsMainThread());
    MOZ_ASSERT(mStream == aStream);

    MOZ_LOG(
        gClipboardLog, LogLevel::Debug,
        ("%s: aStream(%p) mStream(%p)", __FUNCTION__, aStream, mStream.get()));
    nsCString buffer;
    nsresult rv = NS_ConsumeStream(aStream, mSize - mData.Length(), buffer);
    mData += buffer;
    if (rv == NS_BASE_STREAM_CLOSED) {
      // stream reading done
      MOZ_LOG(gClipboardLog, LogLevel::Debug,
              ("%s: stream reading done", __FUNCTION__));

      RefPtr<nsVariantCC> variant = new nsVariantCC();
      variant->SetAsACString(mData);
      mStream = nullptr;
      mHolder.Resolve(NativeEntry(mType, variant), __func__);
      return NS_OK;
    } else if (rv == NS_BASE_STREAM_WOULD_BLOCK) {
      // need to wait data from stream
      MOZ_LOG(gClipboardLog, LogLevel::Debug,
              ("%s: waiting for stream be available", __FUNCTION__));
      rv = mStream->AsyncWait(this, 0, mSize - mData.Length(),
                              GetCurrentSerialEventTarget());
      if (NS_FAILED(rv)) {
        mStream = nullptr;
        CopyableErrorResult err;
        err.ThrowDataError("Unable to get remaining data for '"_ns +
                           NS_ConvertUTF16toUTF8(mType) + "'"_ns);
        mHolder.Reject(err, __func__);
      }
      return rv;
    }
    // encounter error while reading from stream.
    MOZ_LOG(gClipboardLog, LogLevel::Debug,
            ("%s: stream reading error: %u", __FUNCTION__, (uint32_t)rv));
    MOZ_ASSERT(!NS_SUCCEEDED(rv));
    mStream = nullptr;

    CopyableErrorResult err;
    err.ThrowDataError("Unable to read blob for '"_ns +
                       NS_ConvertUTF16toUTF8(mType) + "'"_ns);
    mHolder.Reject(err, __func__);
    return rv;
  }

  WebCustomFormatStreamCallback(const nsAString& aType, uint64_t aSize,
                                nsIAsyncInputStream* aStream)
      : mType(aType), mSize(aSize), mStream(aStream) {}

  RefPtr<NativeEntryPromise> Promise() { return mHolder.Ensure(__func__); }

 private:
  ~WebCustomFormatStreamCallback() = default;

  nsCString mData;
  nsString mType;
  uint64_t mSize;
  nsCOMPtr<nsIAsyncInputStream> mStream;
  MozPromiseHolder<NativeEntryPromise> mHolder;
};

NS_IMPL_ISUPPORTS(WebCustomFormatStreamCallback, nsIInputStreamCallback)

static RefPtr<NativeEntryPromise> GetWebCustomFormatNativeEntry(
    const nsAString& aType, const OwningStringOrBlob& aData) {
  MOZ_LOG(gClipboardLog, LogLevel::Debug,
          ("%s: Handle data for type %s", __FUNCTION__,
           NS_ConvertUTF16toUTF8(aType).get()));

  // Convert string as UTF8Strings
  if (aData.IsString()) {
    MOZ_LOG(gClipboardLog, LogLevel::Debug,
            ("%s: Handle type %s as string data", __FUNCTION__,
             NS_ConvertUTF16toUTF8(aType).get()));
    MOZ_LOG(
        gClipboardLog, LogLevel::Debug,
        ("%s: %s data: %s", __FUNCTION__, NS_ConvertUTF16toUTF8(aType).get(),
         NS_ConvertUTF16toUTF8(aData.GetAsString()).get()));

    RefPtr<nsVariantCC> variant = new nsVariantCC();
    variant->SetAsACString(NS_ConvertUTF16toUTF8(aData.GetAsString()));
    NativeEntry native(aType, variant);
    return NativeEntryPromise::CreateAndResolve(native, __func__);
  }

  MOZ_LOG(gClipboardLog, LogLevel::Debug,
          ("%s: Handle type %s as blob data", __FUNCTION__,
           NS_ConvertUTF16toUTF8(aType).get()));

  IgnoredErrorResult ignored;
  nsCOMPtr<nsIInputStream> stream;
  aData.GetAsBlob()->CreateInputStream(getter_AddRefs(stream), ignored);
  if (ignored.Failed()) {
    MOZ_LOG(gClipboardLog, LogLevel::Debug,
            ("%s: Fail to create inputstream", __FUNCTION__));

    CopyableErrorResult rv;
    rv.ThrowUnknownError("Failed to read blob for '"_ns +
                         NS_ConvertUTF16toUTF8(aType) + "'"_ns);
    return NativeEntryPromise::CreateAndReject(rv, __func__);
  }

  nsCOMPtr<nsIAsyncInputStream> asyncStream = do_QueryInterface(stream);
  if (!asyncStream) {
    MOZ_LOG(gClipboardLog, LogLevel::Debug,
            ("%s: Not async stream...", __FUNCTION__));
    nsCString buffer;
    if (NS_FAILED(NS_ConsumeStream(stream, UINT32_MAX, buffer))) {
      CopyableErrorResult rv;
      rv.ThrowUnknownError("Failed to read blob for '"_ns +
                           NS_ConvertUTF16toUTF8(aType) + "'"_ns);
      return NativeEntryPromise::CreateAndReject(rv, __func__);
    }
    RefPtr<nsVariantCC> variant = new nsVariantCC();
    variant->SetAsACString(buffer);
    NativeEntry native(aType, variant);
    return NativeEntryPromise::CreateAndResolve(native, __func__);
  }

  uint64_t blobSize = aData.GetAsBlob()->GetSize(ignored);
  if (ignored.Failed()) {
    MOZ_LOG(gClipboardLog, LogLevel::Debug,
            ("%s: Fail to get blob size", __FUNCTION__));

    CopyableErrorResult rv;
    rv.ThrowUnknownError("Failed to get blob size for '"_ns +
                         NS_ConvertUTF16toUTF8(aType) + "'"_ns);
    return NativeEntryPromise::CreateAndReject(rv, __func__);
  }

  RefPtr<WebCustomFormatStreamCallback> callback =
      new WebCustomFormatStreamCallback(aType, blobSize, asyncStream);

  MOZ_LOG(gClipboardLog, LogLevel::Debug,
          ("%s: Async wait for blob reading", __FUNCTION__));

  if (NS_FAILED(asyncStream->AsyncWait(
          callback, 0, blobSize < UINT32_MAX ? blobSize : UINT32_MAX,
          GetCurrentSerialEventTarget()))) {
    MOZ_LOG(gClipboardLog, LogLevel::Debug,
            ("%s: Fail to get data form stream", __FUNCTION__));
    CopyableErrorResult rv;
    rv.ThrowUnknownError("Failed to get blob data for '"_ns +
                         NS_ConvertUTF16toUTF8(aType) + "'"_ns);
    return NativeEntryPromise::CreateAndReject(rv, __func__);
  }

  MOZ_LOG(gClipboardLog, LogLevel::Debug, ("%s: return promise", __FUNCTION__));

  return callback->Promise();
}

static RefPtr<NativeEntryPromise> GetNativeEntry(
    const nsAString& aType, const OwningStringOrBlob& aData) {
  // When the entry data is a Blob, its MIME type is required to match the
  // entry's declared type (with any leading "web " prefix stripped on both
  // sides). The W3C clipboard-apis spec does not codify this matching, but
  // Chrome and Safari enforce it and the wpt tests
  //   clipboard-apis/async-custom-formats-write-fail.tentative.https.html
  // depend on the mismatch being rejected as NotAllowedError.
  if (aData.IsBlob()) {
    nsAutoString blobType;
    aData.GetAsBlob()->GetType(blobType);
    // Only enforce the blob/type match when the page has set an explicit
    // Blob type. A constructor like `new Blob(undefined, {type: 'text/html'})`
    // yields an empty type and is treated as "no constraint" by the spec's
    // type matching step, matching the de-facto behavior of other engines.
    if (!blobType.IsEmpty()) {
      nsAutoString customPrefix(
          NS_LITERAL_STRING_FROM_CSTRING(kWebCustomFormatPrefix));
      const size_t typePrefixLen =
          StringBeginsWith(aType, customPrefix) ? customPrefix.Length() : 0;
      const size_t blobPrefixLen =
          StringBeginsWith(blobType, customPrefix) ? customPrefix.Length() : 0;
      if (!Substring(blobType, blobPrefixLen)
               .Equals(Substring(aType, typePrefixLen))) {
        CopyableErrorResult rv;
        rv.ThrowNotAllowedError("Blob type '"_ns +
                                NS_ConvertUTF16toUTF8(blobType) +
                                "' does not match ClipboardItem type '"_ns +
                                NS_ConvertUTF16toUTF8(aType) + "'"_ns);
        return NativeEntryPromise::CreateAndReject(rv, __func__);
      }
    }
  }

  if (aType.EqualsLiteral(kPNGImageMime)) {
    return GetImageNativeEntry(aType, aData);
  }

  if (StringBeginsWith(
          aType, NS_LITERAL_STRING_FROM_CSTRING(kWebCustomFormatPrefix))) {
    return GetWebCustomFormatNativeEntry(aType, aData);
  }

  RefPtr<NativeEntryPromise> promise = GetStringNativeEntry(aType, aData);
  if (aType.EqualsLiteral(kHTMLMime)) {
    promise = promise->Then(
        GetMainThreadSerialEventTarget(), __func__,
        [](const NativeEntryPromise::ResolveOrRejectValue& aValue)
            -> RefPtr<NativeEntryPromise> {
          if (aValue.IsReject()) {
            return NativeEntryPromise::CreateAndReject(aValue.RejectValue(),
                                                       __func__);
          }

          auto sanitized = SanitizeNativeEntry(aValue.ResolveValue());
          if (sanitized.isErr()) {
            return NativeEntryPromise::CreateAndReject(
                CopyableErrorResult(sanitized.unwrapErr()), __func__);
          }
          return NativeEntryPromise::CreateAndResolve(sanitized.unwrap(),
                                                      __func__);
        });
  }
  return promise;
}

using NativeItemPromise = NativeEntryPromise::AllPromiseType;
static RefPtr<NativeItemPromise> GetClipboardNativeItem(
    const ClipboardItem& aItem) {
  nsTArray<RefPtr<NativeEntryPromise>> promises;
  if (aItem.CustomFormatCount() > kMaxWebCustomFormatCount) {
    CopyableErrorResult rv;
    rv.ThrowNotAllowedError(nsPrintfCString(
        "More than %u custom format for write", kMaxWebCustomFormatCount));
    return NativeItemPromise::CreateAndReject(rv, __func__);
  }
  for (const auto& entry : aItem.Entries()) {
    const nsAString& type = entry->Type();
    // The entry's type is verified in ClipboardItem::Constructor.
    // Here we just need to check if the type is supported or not.
    if (entry->IsUnsupportedType()) {
      CopyableErrorResult rv;
      rv.ThrowNotAllowedError("Type '"_ns + NS_ConvertUTF16toUTF8(type) +
                              "' not supported for write"_ns);
      return NativeItemPromise::CreateAndReject(rv, __func__);
    }

    using GetDataPromise = ClipboardItem::ItemEntry::GetDataPromise;
    promises.AppendElement(entry->GetData()->Then(
        GetMainThreadSerialEventTarget(), __func__,
        [t = nsString(type)](const GetDataPromise::ResolveOrRejectValue& aValue)
            -> RefPtr<NativeEntryPromise> {
          if (aValue.IsReject()) {
            return NativeEntryPromise::CreateAndReject(
                CopyableErrorResult(aValue.RejectValue()), __func__);
          }

          return GetNativeEntry(t, aValue.ResolveValue());
        }));
  }
  return NativeEntryPromise::All(GetCurrentSerialEventTarget(), promises);
}

class ClipboardWriteCallback final : public nsIAsyncClipboardRequestCallback {
 public:
  // This object will never be held by a cycle-collected object, so it doesn't
  // need to be cycle-collected despite holding alive cycle-collected objects.
  NS_DECL_ISUPPORTS

  explicit ClipboardWriteCallback(Promise* aPromise,
                                  ClipboardItem* aClipboardItem)
      : mPromise(aPromise), mClipboardItem(aClipboardItem) {}

  // nsIAsyncClipboardRequestCallback
  NS_IMETHOD OnComplete(nsresult aResult) override {
    MOZ_ASSERT(mPromise);

    RefPtr<Promise> promise = std::move(mPromise);
    // XXX We need to check state here is because the promise might be rejected
    // before the callback is called, we probably could wrap the promise into a
    // structure to make it less confused.
    if (promise->State() == Promise::PromiseState::Pending) {
      if (NS_FAILED(aResult)) {
        promise->MaybeRejectWithNotAllowedError(
            "Clipboard write is not allowed.");
        return NS_OK;
      }

      promise->MaybeResolveWithUndefined();
    }

    return NS_OK;
  }

 protected:
  ~ClipboardWriteCallback() {
    // Callback should be notified.
    MOZ_ASSERT(!mPromise);
  };

  // It will be reset to nullptr once callback is notified.
  RefPtr<Promise> mPromise;
  // Keep ClipboardItem alive until clipboard write is done.
  RefPtr<ClipboardItem> mClipboardItem;
};

NS_IMPL_ISUPPORTS(ClipboardWriteCallback, nsIAsyncClipboardRequestCallback)

}  // namespace

already_AddRefed<Promise> Clipboard::Write(
    const Sequence<OwningNonNull<ClipboardItem>>& aData,
    nsIPrincipal& aSubjectPrincipal, ErrorResult& aRv) {
  // Create a promise
  RefPtr<nsGlobalWindowInner> owner = GetOwnerWindow();
  RefPtr<Promise> p = dom::Promise::Create(owner, aRv);
  if (aRv.Failed()) {
    return nullptr;
  }

  Document* doc = owner->GetDoc();
  if (!doc) {
    p->MaybeRejectWithUndefined();
    return p.forget();
  }

  // We want to disable security check for automated tests that have the pref
  //  dom.events.testing.asyncClipboard set to true
  if (!IsTestingPrefEnabled() &&
      !nsContentUtils::IsCutCopyAllowed(doc, aSubjectPrincipal)) {
    MOZ_LOG(GetClipboardLog(), LogLevel::Debug,
            ("Clipboard, Write, Not allowed to write to clipboard\n"));
    p->MaybeRejectWithNotAllowedError(
        "Clipboard write was blocked due to lack of user activation.");
    return p.forget();
  }

  // Get the clipboard service
  nsCOMPtr<nsIClipboard> clipboard(
      do_GetService("@mozilla.org/widget/clipboard;1"));
  if (!clipboard) {
    p->MaybeRejectWithUndefined();
    return p.forget();
  }

  nsCOMPtr<nsILoadContext> context = doc->GetLoadContext();
  if (!context) {
    p->MaybeRejectWithUndefined();
    return p.forget();
  }

  if (aData.Length() > 1) {
    p->MaybeRejectWithNotAllowedError(
        "Clipboard write is only supported with one ClipboardItem at the "
        "moment");
    return p.forget();
  }

  if (aData.Length() == 0) {
    // Nothing needs to be written to the clipboard.
    p->MaybeResolveWithUndefined();
    return p.forget();
  }

  nsCOMPtr<nsIAsyncSetClipboardData> request;
  RefPtr<ClipboardWriteCallback> callback =
      MakeRefPtr<ClipboardWriteCallback>(p, aData[0]);
  nsresult rv = clipboard->AsyncSetData(nsIClipboard::kGlobalClipboard,
                                        owner->GetWindowContext(), callback,
                                        getter_AddRefs(request));
  if (NS_FAILED(rv)) {
    p->MaybeReject(rv);
    return p.forget();
  }

  GetClipboardNativeItem(aData[0])->Then(
      GetMainThreadSerialEventTarget(), __func__,
      [owner, request, context, principal = RefPtr{&aSubjectPrincipal}](
          const nsTArray<NativeEntry>& aEntries) {
        RefPtr<DataTransfer> dataTransfer =
            new DataTransfer(ToSupports(owner), eCopy,
                             /* is external */ true,
                             /* clipboard type */ Nothing());

        for (const auto& entry : aEntries) {
          nsresult rv = dataTransfer->SetDataWithPrincipal(
              entry.mType, entry.mData, 0, principal);

          if (NS_FAILED(rv)) {
            request->Abort(rv);
            return;
          }
        }

        // Get the transferable
        RefPtr<nsITransferable> transferable =
            dataTransfer->GetTransferable(0, context);
        if (!transferable) {
          request->Abort(NS_ERROR_FAILURE);
          return;
        }

        // Finally write data to clipboard
        request->SetData(transferable, /* clipboard owner */ nullptr);
      },
      [p, request](const CopyableErrorResult& aErrorResult) {
        p->MaybeReject(CopyableErrorResult(aErrorResult));
        request->Abort(NS_ERROR_ABORT);
      });

  return p.forget();
}

already_AddRefed<Promise> Clipboard::WriteText(const nsAString& aData,
                                               nsIPrincipal& aSubjectPrincipal,
                                               ErrorResult& aRv) {
  nsCOMPtr<nsIGlobalObject> global = GetRelevantGlobal();
  if (!global) {
    aRv.ThrowInvalidStateError("Unable to get global.");
    return nullptr;
  }

  // Create a single-element Sequence to reuse Clipboard::Write.
  nsTArray<RefPtr<ClipboardItem::ItemEntry>> items;
  items.AppendElement(MakeRefPtr<ClipboardItem::ItemEntry>(
      global, NS_LITERAL_STRING_FROM_CSTRING(kTextMime), aData));

  nsTArray<OwningNonNull<ClipboardItem>> sequence;
  RefPtr<ClipboardItem> item = MakeRefPtr<ClipboardItem>(
      ToSupports(GetOwnerWindow()), PresentationStyle::Unspecified,
      std::move(items));
  sequence.AppendElement(*item);

  return Write(std::move(sequence), aSubjectPrincipal, aRv);
}

JSObject* Clipboard::WrapObject(JSContext* aCx,
                                JS::Handle<JSObject*> aGivenProto) {
  return Clipboard_Binding::Wrap(aCx, this, aGivenProto);
}

/* static */
LogModule* Clipboard::GetClipboardLog() { return gClipboardLog; }

/* static */
bool Clipboard::IsTestingPrefEnabled() {
  bool clipboardTestingEnabled =
      StaticPrefs::dom_events_testing_asyncClipboard_DoNotUseDirectly();
  MOZ_LOG(GetClipboardLog(), LogLevel::Debug,
          ("Clipboard, Is testing enabled? %d\n", clipboardTestingEnabled));
  return clipboardTestingEnabled;
}

NS_IMPL_CYCLE_COLLECTION_CLASS(Clipboard)

NS_IMPL_CYCLE_COLLECTION_TRAVERSE_BEGIN_INHERITED(Clipboard,
                                                  DOMEventTargetHelper)
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END

NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN_INHERITED(Clipboard, DOMEventTargetHelper)
NS_IMPL_CYCLE_COLLECTION_UNLINK_END

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(Clipboard)
NS_INTERFACE_MAP_END_INHERITING(DOMEventTargetHelper)

NS_IMPL_ADDREF_INHERITED(Clipboard, DOMEventTargetHelper)
NS_IMPL_RELEASE_INHERITED(Clipboard, DOMEventTargetHelper)

}  // namespace mozilla::dom
