/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Dictionaries mirroring the enterprise DLP rules JSON delivered to content
// analysis (parsed in toolkit/components/contentanalysis/ContentAnalysisRuleParser.cpp).
// Member names match the JSON keys exactly. Only the top-level dictionary is
// parsed directly from a JSON string, so only it needs [GenerateInitFromJSON].

dictionary ContentAnalysisRuleJSON {
  required DOMString Name;
  boolean Enabled = false;
  sequence<DOMString> Actions = [];
  sequence<DOMString> Domains = [];
  sequence<DOMString> ContentPatterns = [];
  required DOMString Type;
  DOMString Message = "";
};

dictionary ContentAnalysisRuleSetJSON {
  DOMString Version = "";
  sequence<ContentAnalysisRuleJSON> Rules = [];
};

[GenerateInitFromJSON]
dictionary ContentAnalysisConfigJSON {
  required ContentAnalysisRuleSetJSON DLPRules;
};
