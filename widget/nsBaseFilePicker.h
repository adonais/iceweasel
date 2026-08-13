/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsBaseFilePicker_h_
#define nsBaseFilePicker_h_

#include "mozilla/TimeStamp.h"
#include "nsCOMPtr.h"
#include "nsIFilePicker.h"
#include "nsISupports.h"
#include "nsString.h"
#include "nsTArray.h"

class nsISimpleEnumerator;
class nsIWidget;
class nsIGlobalObject;

namespace mozilla::dom {
class BrowsingContext;
}

class nsBaseFilePicker : public nsIFilePicker {
 public:
  nsBaseFilePicker();

  // nsIFilePicker
  NS_IMETHOD Init(mozilla::dom::BrowsingContext* aBrowsingContext,
                  const nsAString& aTitle, nsIFilePicker::Mode aMode,
                  nsISupports* aGlobal) override;
  NS_IMETHOD IsModeSupported(nsIFilePicker::Mode aMode, JSContext* aCx,
                             mozilla::dom::Promise** aPromise) override;
  NS_IMETHOD AppendFilters(int32_t filterMask) override;
  NS_IMETHOD AppendRawFilter(const nsAString& aFilter) override;
  NS_IMETHOD GetCapture(nsIFilePicker::CaptureTarget* aCapture) override;
  NS_IMETHOD SetCapture(nsIFilePicker::CaptureTarget aCapture) override;
  NS_IMETHOD GetFilterIndex(int32_t* aFilterIndex) override;
  NS_IMETHOD SetFilterIndex(int32_t aFilterIndex) override;
  NS_IMETHOD GetFiles(nsISimpleEnumerator** aFiles) override;
  NS_IMETHOD GetDisplayDirectory(nsIFile** aDisplayDirectory) override;
  NS_IMETHOD SetDisplayDirectory(nsIFile* aDisplayDirectory) override;
  NS_IMETHOD GetDisplaySpecialDirectory(nsAString& aDisplayDirectory) override;
  NS_IMETHOD SetDisplaySpecialDirectory(
      const nsAString& aDisplayDirectory) override;
  NS_IMETHOD GetAddToRecentDocs(bool* aFlag) override;
  NS_IMETHOD SetAddToRecentDocs(bool aFlag) override;
  NS_IMETHOD GetMode(nsIFilePicker::Mode* aMode) override;
  NS_IMETHOD SetOkButtonLabel(const nsAString& aLabel) override;
  NS_IMETHOD GetOkButtonLabel(nsAString& aLabel) override;

  NS_IMETHOD GetDomFileOrDirectory(nsISupports** aValue) override;
  NS_IMETHOD GetDomFileOrDirectoryEnumerator(
      nsISimpleEnumerator** aValue) override;
  NS_IMETHOD GetDomFilesInWebKitDirectory(
      nsISimpleEnumerator** aValue) override;

  nsIGlobalObject* GetRelevantGlobal() const;

  // This is split out (and public) only so the logic can be unit-tested
  // without a live picker, pref, or clock; callers should use
  // IsPickerInputProtected() instead.
  static bool IsWithinInputProtectionTimeRange(mozilla::TimeStamp aShowTime,
                                               mozilla::TimeStamp aNow,
                                               uint32_t aProtectionMs);

 protected:
  virtual ~nsBaseFilePicker();

  virtual void InitNative(nsIWidget* aParent, const nsAString& aTitle) = 0;

  virtual nsresult ResolveSpecialDirectory(const nsAString& aSpecialDirectory);
  bool MaybeBlockFilePicker(nsIFilePickerShownCallback* aCallback);

  // Records the time the native picker was shown to the user. Platform
  // subclasses call this just before showing the picker.
  void RecordLastShownTime() { mShowTime = mozilla::TimeStamp::Now(); }

  // Returns true while the picker has been showing for less than
  // security.notification_enable_delay. Platform subclasses use this to
  // ignore a confirmation that arrives too soon after the picker appeared.
  // Only content-initiated pickers (e.g. <input type=file>) are protected;
  // see IsContentInitiated().
  bool IsPickerInputProtected() const;

  // True when this picker was opened by untrusted web content rather than by
  // the browser UI. We only apply input protection to these so that chrome
  // pickers like "Save As" keep working normally. Pickers in a content
  // browsing context that host a trusted document (system principal or an
  // about: page) are also excluded.
  bool IsContentInitiated() const;

  bool mAddToRecentDocs = true;
  nsCOMPtr<nsIFile> mDisplayDirectory;
  nsString mDisplaySpecialDirectory;

  RefPtr<mozilla::dom::BrowsingContext> mBrowsingContext;
  nsCOMPtr<nsIGlobalObject> mGlobal;
  nsIFilePicker::Mode mMode = nsIFilePicker::modeOpen;
  nsString mOkButtonLabel;
  nsTArray<nsString> mRawFilters;
  mozilla::TimeStamp mShowTime;
};

#endif  // nsBaseFilePicker_h_
