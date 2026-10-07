/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef nsDocShellEditorData_h_
#define nsDocShellEditorData_h_

#ifndef nsCOMPtr_h_
#  include "nsCOMPtr.h"
#endif

#include "mozilla/RefPtr.h"
#include "mozilla/dom/Document.h"
#include "mozilla/WeakPtr.h"
#include "nsDocShell.h"

class nsEditingSession;

namespace mozilla {
class HTMLEditor;
}

class nsDocShellEditorData {
 public:
  explicit nsDocShellEditorData(nsDocShell* aOwningDocShell);
  ~nsDocShellEditorData();

  MOZ_CAN_RUN_SCRIPT_BOUNDARY nsresult MakeEditable(bool aWaitForUriLoad);
  bool GetEditable();
  nsEditingSession* GetEditingSession();
  mozilla::HTMLEditor* GetHTMLEditor() const { return mHTMLEditor; }
  MOZ_CAN_RUN_SCRIPT_BOUNDARY nsresult
  SetHTMLEditor(mozilla::HTMLEditor* aHTMLEditor);
  MOZ_CAN_RUN_SCRIPT_BOUNDARY void TearDownEditor();
  nsresult DetachFromWindow();
  bool WaitingForLoad() const { return mMakeEditable; }

 protected:
  void EnsureEditingSession();

  // The doc shell that owns us. Weak ref, since it always outlives us.
  mozilla::WeakPtr<nsDocShell> mDocShell;

  // Only present for the content root docShell. Session is owned here.
  RefPtr<nsEditingSession> mEditingSession;

  // If this frame is editable, store HTML editor here. It's owned here.
  RefPtr<mozilla::HTMLEditor> mHTMLEditor;

  // Indicates whether to make an editor after a url load.
  bool mMakeEditable;
};

#endif  // nsDocShellEditorData_h_
