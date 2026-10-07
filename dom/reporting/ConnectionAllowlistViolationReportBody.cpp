/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/ConnectionAllowlistViolationReportBody.h"

#include "mozilla/JSONWriter.h"
#include "mozilla/dom/BindingUtils.h"

namespace mozilla::dom {

ConnectionAllowlistViolationReportBody::ConnectionAllowlistViolationReportBody(
    nsIGlobalObject* aGlobal, const nsACString& aURL,
    const nsACString& aConnection, nsTArray<nsCString>&& aAllowlist,
    ConnectionAllowlistDisposition aDisposition)
    : ReportBody(aGlobal),
      mURL(aURL),
      mConnection(aConnection),
      mAllowlist(std::move(aAllowlist)),
      mDisposition(aDisposition) {}

ConnectionAllowlistViolationReportBody::
    ~ConnectionAllowlistViolationReportBody() = default;

JSObject* ConnectionAllowlistViolationReportBody::WrapObject(
    JSContext* aCx, JS::Handle<JSObject*> aGivenProto) {
  return ConnectionAllowlistViolationReportBody_Binding::Wrap(aCx, this,
                                                              aGivenProto);
}

void ConnectionAllowlistViolationReportBody::GetUrl(nsACString& aURL) const {
  aURL = mURL;
}

void ConnectionAllowlistViolationReportBody::GetConnection(
    nsACString& aConnection) const {
  aConnection = mConnection;
}

void ConnectionAllowlistViolationReportBody::GetAllowlist(
    nsTArray<nsCString>& aAllowlist) const {
  aAllowlist = mAllowlist.Clone();
}

ConnectionAllowlistDisposition
ConnectionAllowlistViolationReportBody::Disposition() const {
  return mDisposition;
}

void ConnectionAllowlistViolationReportBody::ToJSON(
    JSONWriter& aJSONWriter) const {
  aJSONWriter.StringProperty("url", mURL);
  aJSONWriter.StringProperty("connection", mConnection);

  aJSONWriter.StartArrayProperty("allowlist");
  for (const nsCString& pattern : mAllowlist) {
    aJSONWriter.StringElement(pattern);
  }
  aJSONWriter.EndArray();

  nsAutoCString disposition{GetEnumString(mDisposition)};
  aJSONWriter.StringProperty("disposition", disposition);
}

}  // namespace mozilla::dom
