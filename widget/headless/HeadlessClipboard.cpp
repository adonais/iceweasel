/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "HeadlessClipboard.h"

#include "imgIContainer.h"
#include "imgITools.h"
#include "nsCOMPtr.h"
#include "nsComponentManagerUtils.h"
#include "nsIInputStream.h"
#include "nsISupportsPrimitives.h"
#include "nsStreamUtils.h"
#include "nsStringStream.h"

namespace mozilla::widget {

NS_IMPL_ISUPPORTS_INHERITED0(HeadlessClipboard, nsBaseClipboard)

HeadlessClipboard::HeadlessClipboard()
    : nsBaseClipboard(mozilla::dom::ClipboardCapabilities(
          true /* supportsSelectionClipboard */,
          true /* supportsFindClipboard */,
          true /* supportsSelectionCache */)) {
  for (auto& clipboard : mClipboards) {
    clipboard = MakeUnique<HeadlessClipboardData>();
  }
}

static nsresult EncodeImageAsPNG(imgIContainer* aImage,
                                 nsTArray<uint8_t>& aPNG) {
  nsCOMPtr<imgITools> imgTools =
      do_CreateInstance("@mozilla.org/image/tools;1");
  if (!imgTools) {
    return NS_ERROR_FAILURE;
  }

  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = imgTools->EncodeImage(aImage, nsLiteralCString(kPNGImageMime),
                                      u""_ns, getter_AddRefs(stream));
  if (NS_FAILED(rv)) {
    return rv;
  }
  if (!stream) {
    return NS_ERROR_FAILURE;
  }

  return NS_ConsumeStream(stream, UINT32_MAX, aPNG);
}

NS_IMETHODIMP
HeadlessClipboard::SetNativeClipboardData(nsITransferable* aTransferable,
                                          ClipboardType aWhichClipboard) {
  MOZ_DIAGNOSTIC_ASSERT(aTransferable);
  MOZ_DIAGNOSTIC_ASSERT(
      nsIClipboard::IsClipboardTypeSupported(aWhichClipboard));

  // Clear out the clipboard in order to set the new data.
  EmptyNativeClipboardData(aWhichClipboard);

  nsTArray<nsCString> flavors;
  nsresult rv = aTransferable->FlavorsTransferableCanExport(flavors);
  if (NS_FAILED(rv)) {
    return rv;
  }

  auto& clipboard = mClipboards[aWhichClipboard];
  MOZ_ASSERT(clipboard);

  for (const auto& flavor : flavors) {
    const bool isText = flavor.EqualsLiteral(kTextMime);
    const bool isHTML = flavor.EqualsLiteral(kHTMLMime);
    const bool isImage = flavor.EqualsLiteral(kNativeImageMime);
    if (!isText && !isHTML && !isImage) {
      continue;
    }

    nsCOMPtr<nsISupports> data;
    rv = aTransferable->GetTransferData(flavor.get(), getter_AddRefs(data));
    if (NS_FAILED(rv)) {
      continue;
    }

    if (isImage) {
      nsCOMPtr<imgIContainer> image = do_QueryInterface(data);
      nsTArray<uint8_t> png;
      if (image && NS_SUCCEEDED(EncodeImageAsPNG(image, png))) {
        clipboard->SetPNG(std::move(png));
      }
      continue;
    }

    nsCOMPtr<nsISupportsString> wideString = do_QueryInterface(data);
    if (!wideString) {
      continue;
    }

    nsAutoString utf16string;
    wideString->GetData(utf16string);
    isText ? clipboard->SetText(utf16string) : clipboard->SetHTML(utf16string);
  }

  return NS_OK;
}

mozilla::Result<nsCOMPtr<nsISupports>, nsresult>
HeadlessClipboard::GetNativeClipboardData(const nsACString& aFlavor,
                                          ClipboardType aWhichClipboard,
                                          uint64_t aThreshold) {
  MOZ_DIAGNOSTIC_ASSERT(
      nsIClipboard::IsClipboardTypeSupported(aWhichClipboard));

  auto& clipboard = mClipboards[aWhichClipboard];
  MOZ_ASSERT(clipboard);

  if (aFlavor.EqualsLiteral(kPNGImageMime)) {
    if (!clipboard->HasPNG()) {
      return nsCOMPtr<nsISupports>{};
    }

    nsCOMPtr<nsIInputStream> stream;
    nsresult rv = NS_NewByteInputStream(getter_AddRefs(stream),
                                        clipboard->GetPNG().Clone());
    if (NS_WARN_IF(NS_FAILED(rv))) {
      return nsCOMPtr<nsISupports>{};
    }
    return nsCOMPtr<nsISupports>(std::move(stream));
  }

  if (!aFlavor.EqualsLiteral(kTextMime) && !aFlavor.EqualsLiteral(kHTMLMime)) {
    return nsCOMPtr<nsISupports>{};
  }

  bool isText = aFlavor.EqualsLiteral(kTextMime);
  if (!(isText ? clipboard->HasText() : clipboard->HasHTML())) {
    return nsCOMPtr<nsISupports>{};
  }

  if (aThreshold && isText && clipboard->GetText().Length() > aThreshold) {
    return mozilla::Err(NS_ERROR_CLIPBOARD_TOO_BIG);
  }

  nsresult rv;
  nsCOMPtr<nsISupportsString> dataWrapper =
      do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID, &rv);
  rv = dataWrapper->SetData(isText ? clipboard->GetText()
                                   : clipboard->GetHTML());
  if (NS_WARN_IF(NS_FAILED(rv))) {
    return nsCOMPtr<nsISupports>{};
  }

  return nsCOMPtr<nsISupports>(std::move(dataWrapper));
}

nsresult HeadlessClipboard::EmptyNativeClipboardData(
    ClipboardType aWhichClipboard) {
  MOZ_DIAGNOSTIC_ASSERT(
      nsIClipboard::IsClipboardTypeSupported(aWhichClipboard));
  auto& clipboard = mClipboards[aWhichClipboard];
  MOZ_ASSERT(clipboard);
  clipboard->Clear();
  return NS_OK;
}

mozilla::Result<int32_t, nsresult>
HeadlessClipboard::GetNativeClipboardSequenceNumber(
    ClipboardType aWhichClipboard) {
  MOZ_DIAGNOSTIC_ASSERT(
      nsIClipboard::IsClipboardTypeSupported(aWhichClipboard));
  auto& clipboard = mClipboards[aWhichClipboard];
  MOZ_ASSERT(clipboard);
  return clipboard->GetChangeCount();
  ;
}

mozilla::Result<bool, nsresult>
HeadlessClipboard::HasNativeClipboardDataMatchingFlavors(
    const nsTArray<nsCString>& aFlavorList, ClipboardType aWhichClipboard) {
  MOZ_DIAGNOSTIC_ASSERT(
      nsIClipboard::IsClipboardTypeSupported(aWhichClipboard));

  auto& clipboard = mClipboards[aWhichClipboard];
  MOZ_ASSERT(clipboard);

  // Retrieve the union of all aHasType in aFlavorList
  for (auto& flavor : aFlavorList) {
    if ((flavor.EqualsLiteral(kTextMime) && clipboard->HasText()) ||
        (flavor.EqualsLiteral(kHTMLMime) && clipboard->HasHTML()) ||
        (flavor.EqualsLiteral(kPNGImageMime) && clipboard->HasPNG())) {
      return true;
    }
  }
  return false;
}

}  // namespace mozilla::widget
