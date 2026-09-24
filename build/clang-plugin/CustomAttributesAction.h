/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef CustomAttributesAction_h_
#define CustomAttributesAction_h_

#include "clang/AST/ASTConsumer.h"
#include "clang/Frontend/FrontendAction.h"

class CustomAttributesAction : public clang::PluginASTAction {
public:
  std::unique_ptr<clang::ASTConsumer>
  CreateASTConsumer(clang::CompilerInstance &CI,
                    clang::StringRef FileName) override;

  bool ParseArgs(const clang::CompilerInstance &CI,
                 const std::vector<std::string> &Args) override;

  ActionType getActionType() override;
};

#endif /* CustomAttributesAction_h_ */
