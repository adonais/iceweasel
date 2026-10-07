/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/PermissionsPolicyViolationReportBody.h"

#include "mozilla/JSONWriter.h"
#include "mozilla/dom/PermissionsPolicyBinding.h"

namespace mozilla::dom {

PermissionsPolicyViolationReportBody::PermissionsPolicyViolationReportBody(
    nsIGlobalObject* aGlobal, const nsAString& aFeatureId,
    const nsACString& aSourceFile, const Nullable<int32_t>& aLineNumber,
    const Nullable<int32_t>& aColumnNumber, const nsAString& aDisposition)
    : ReportBody(aGlobal),
      mFeatureId(aFeatureId),
      mSourceFile(aSourceFile),
      mLineNumber(aLineNumber),
      mColumnNumber(aColumnNumber),
      mDisposition(aDisposition) {}

PermissionsPolicyViolationReportBody::~PermissionsPolicyViolationReportBody() =
    default;

JSObject* PermissionsPolicyViolationReportBody::WrapObject(
    JSContext* aCx, JS::Handle<JSObject*> aGivenProto) {
  return PermissionsPolicyViolationReportBody_Binding::Wrap(aCx, this,
                                                            aGivenProto);
}

void PermissionsPolicyViolationReportBody::GetFeatureId(
    nsAString& aFeatureId) const {
  aFeatureId = mFeatureId;
}

void PermissionsPolicyViolationReportBody::GetSourceFile(
    nsACString& aSourceFile) const {
  aSourceFile = mSourceFile;
}

Nullable<int32_t> PermissionsPolicyViolationReportBody::GetLineNumber() const {
  return mLineNumber;
}

Nullable<int32_t> PermissionsPolicyViolationReportBody::GetColumnNumber()
    const {
  return mColumnNumber;
}

void PermissionsPolicyViolationReportBody::GetDisposition(
    nsAString& aDisposition) const {
  aDisposition = mDisposition;
}

void PermissionsPolicyViolationReportBody::ToJSON(JSONWriter& aWriter) const {
  aWriter.StringProperty("featureId", NS_ConvertUTF16toUTF8(mFeatureId));

  if (mSourceFile.IsEmpty()) {
    aWriter.NullProperty("sourceFile");
  } else {
    aWriter.StringProperty("sourceFile", mSourceFile);
  }

  if (mLineNumber.IsNull()) {
    aWriter.NullProperty("lineNumber");
  } else {
    aWriter.IntProperty("lineNumber", mLineNumber.Value());
  }

  if (mColumnNumber.IsNull()) {
    aWriter.NullProperty("columnNumber");
  } else {
    aWriter.IntProperty("columnNumber", mColumnNumber.Value());
  }

  aWriter.StringProperty("disposition", NS_ConvertUTF16toUTF8(mDisposition));
}

}  // namespace mozilla::dom
