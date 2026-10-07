/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * For more information on this interface, please see
 * https://w3c.github.io/webappsec-permissions-policy/#idl-index
 */

[LegacyNoInterfaceObject,
 Exposed=Window]
interface PermissionsPolicy {
  boolean allowsFeature(DOMString feature, optional DOMString origin);
  sequence<DOMString> features();
  sequence<DOMString> allowedFeatures();
  sequence<DOMString> getAllowlistForFeature(DOMString feature);
};

[Pref="dom.reporting.permissionsPolicy.enabled",
 Exposed=Window]
interface PermissionsPolicyViolationReportBody : ReportBody {
  readonly attribute DOMString featureId;
  readonly attribute UTF8String? sourceFile;
  readonly attribute long? lineNumber;
  readonly attribute long? columnNumber;
  readonly attribute DOMString disposition;
};
