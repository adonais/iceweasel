/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_PermissionsPolicyViolationReportBody_h
#define mozilla_dom_PermissionsPolicyViolationReportBody_h

#include "mozilla/dom/Nullable.h"
#include "mozilla/dom/ReportBody.h"
#include "nsString.h"

namespace mozilla::dom {

class PermissionsPolicyViolationReportBody final : public ReportBody {
 public:
  PermissionsPolicyViolationReportBody(nsIGlobalObject* aGlobal,
                                       const nsAString& aFeatureId,
                                       const nsACString& aSourceFile,
                                       const Nullable<int32_t>& aLineNumber,
                                       const Nullable<int32_t>& aColumnNumber,
                                       const nsAString& aDisposition);

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  void GetFeatureId(nsAString& aFeatureId) const;

  void GetSourceFile(nsACString& aSourceFile) const;

  Nullable<int32_t> GetLineNumber() const;

  Nullable<int32_t> GetColumnNumber() const;

  void GetDisposition(nsAString& aDisposition) const;

 protected:
  void ToJSON(JSONWriter& aJSONWriter) const override;

 private:
  ~PermissionsPolicyViolationReportBody();

  const nsString mFeatureId;
  const nsCString mSourceFile;
  const Nullable<int32_t> mLineNumber;
  const Nullable<int32_t> mColumnNumber;
  const nsString mDisposition;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_PermissionsPolicyViolationReportBody_h
