/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/StaticPrefs_mathml.h"
#include "mozilla/dom/MathMLAnchorElement.h"
#include "mozilla/dom/MathMLElement.h"
#include "nsContentCreatorFunctions.h"

using namespace mozilla::dom;

// MathML Element Factory (declared in nsContentCreatorFunctions.h)
nsresult NS_NewMathMLElement(
    Element** aResult, already_AddRefed<mozilla::dom::NodeInfo> aNodeInfo) {
  RefPtr<mozilla::dom::NodeInfo> nodeInfo(aNodeInfo);

  auto* nim = nodeInfo->NodeInfoManager();

  if (nodeInfo->NameAtom() == nsGkAtoms::a &&
      mozilla::StaticPrefs::mathml_a_element_enabled()) {
    NS_ADDREF(*aResult = new (nim) MathMLAnchorElement(nodeInfo.forget()));
    return NS_OK;
  }

  NS_ADDREF(*aResult = new (nim) MathMLElement(nodeInfo.forget()));
  return NS_OK;
}
