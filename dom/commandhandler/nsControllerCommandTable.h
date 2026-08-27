/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsControllerCommandTable_h_
#define nsControllerCommandTable_h_

#include "nsHashKeys.h"
#include "nsISupportsImpl.h"
#include "nsRefPtrHashtable.h"

namespace mozilla {
class ControllerCommand;
}

class nsICommandParams;

class nsControllerCommandTable final {
 public:
  nsControllerCommandTable() = default;

  NS_INLINE_DECL_REFCOUNTING(nsControllerCommandTable);

  static nsControllerCommandTable* EditorCommandTable();
  static nsControllerCommandTable* EditingCommandTable();
  static nsControllerCommandTable* HTMLEditorCommandTable();
  static nsControllerCommandTable* HTMLEditorDocStateCommandTable();
  static nsControllerCommandTable* WindowCommandTable();

  void RegisterCommand(const nsACString&, mozilla::ControllerCommand*);
  void UnregisterCommand(const nsACString&, mozilla::ControllerCommand*);
  mozilla::ControllerCommand* FindCommandHandler(const nsACString&) const;
  bool IsCommandEnabled(const nsACString&, nsISupports* aContext) const;
  bool SupportsCommand(const nsACString& aName) const {
    return !!FindCommandHandler(aName);
  }
  void MakeImmutable() { mMutable = false; }
  void GetSupportedCommands(nsTArray<nsCString>&) const;

 private:
  ~nsControllerCommandTable() = default;
  // This value is used to size the hash table. Just a sensible upper bound
  static constexpr size_t num_commands_length = 32;
  // Hash table of nsIControllerCommands, keyed by command name.
  nsRefPtrHashtable<nsCStringHashKey, mozilla::ControllerCommand>
      mCommandsTable{num_commands_length};

  // Are we mutable?
  bool mMutable = true;
};

#endif  // nsControllerCommandTable_h_
