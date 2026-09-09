/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_AutoPrintEventDispatcher_h
#define mozilla_dom_AutoPrintEventDispatcher_h

#include "mozilla/dom/Document.h"
#include "mozilla/dom/DocumentInlines.h"
#include "nsContentUtils.h"
#include "nsGlobalWindowOuter.h"
#include "nsIPrintSettings.h"

namespace mozilla::dom {

class AutoPrintEventDispatcher {
 public:
  MOZ_CAN_RUN_SCRIPT explicit AutoPrintEventDispatcher(Document& aDoc) {
    if (!aDoc.IsStaticDocument()) {
      mDocuments.AppendElement(&aDoc);
      CollectInProcessSubdocuments(aDoc, mDocuments);
    }

    DispatchEvent(true);
  }

  MOZ_CAN_RUN_SCRIPT ~AutoPrintEventDispatcher() { DispatchEvent(false); }

 private:
  // NOTE(emilio): For fission iframes, we dispatch this event in
  // RecvCloneDocumentTreeIntoSelf.
  static void CollectInProcessSubdocuments(
      Document& aDoc, nsTArray<nsCOMPtr<Document>>& aDocs) {
    aDoc.EnumerateSubDocuments([&aDocs](Document& aSubDoc) {
      aDocs.AppendElement(&aSubDoc);
      CollectInProcessSubdocuments(aSubDoc, aDocs);
      return CallState::Continue;
    });
  }

  MOZ_CAN_RUN_SCRIPT void DispatchEvent(bool aBefore) {
    for (const auto& doc : mDocuments) {
      const RefPtr<nsGlobalWindowOuter> window =
          nsGlobalWindowOuter::Cast(doc->GetWindow());
      // mDocuments won't be modified. Therefore, we can use MOZ_KnownLive(doc)
      // here.
      nsContentUtils::DispatchTrustedEvent(
          MOZ_KnownLive(doc), window,
          aBefore ? u"beforeprint"_ns : u"afterprint"_ns, CanBubble::eNo,
          Cancelable::eNo, nullptr);
      if (RefPtr<nsPresContext> presContext = doc->GetPresContext()) {
        presContext->EmulateMedium(aBefore ? nsGkAtoms::print : nullptr);
        // Ensure media query listeners fire.
        // FIXME(emilio): This is hacky, at best, but is required for compat
        // with some pages, see bug 774398.
        doc->EvaluateMediaQueriesAndReportChanges();
      }
    }
  }

  AutoTArray<nsCOMPtr<Document>, 8> mDocuments;
  const nsSize mPageSize;
  nsRect mVisibleAreaToRestore;
};

}  // namespace mozilla::dom

#endif
