/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_antitrackingopenerheuristics_h
#define mozilla_antitrackingopenerheuristics_h

class nsIURI;
class nsPIDOMWindowOuter;

namespace mozilla {

namespace dom {
class Document;
}  // namespace dom

// Called when the user interacts with aDocument for the first time. If the
// document was opened by a third-party opener, grant storage access to that
// opener. aHadPriorUserInteraction indicates whether the document's principal
// had been interacted with before this interaction.
void MaybeAllowStorageForOpenerAfterUserInteraction(
    dom::Document* aDocument, bool aHadPriorUserInteraction);

// Called when aOpener has opened a new window for aURI. If aURI is third-party
// with respect to aOpener, grant storage access to aURI's origin in aOpener.
void MaybeAllowStorageForOpenedWindow(nsPIDOMWindowOuter* aOpener,
                                      nsIURI* aURI);

}  // namespace mozilla

#endif  // mozilla_antitrackingopenerheuristics_h
