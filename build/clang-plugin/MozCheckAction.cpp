/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MozCheckAction.h"

#include "DiagnosticsMatcher.h"

ASTConsumerPtr MozCheckAction::CreateASTConsumer(CompilerInstance &CI,
                                                 StringRef FileName) {
  void *Buffer = CI.getASTContext().Allocate<DiagnosticsMatcher>();
  auto Matcher = new (Buffer) DiagnosticsMatcher(CI);
  return Matcher->makeASTConsumer();
}

bool MozCheckAction::ParseArgs(const CompilerInstance &CI,
                               const std::vector<std::string> &Args) {
  return true;
}

DenseMap<StringRef, bool> InThirdPartyPathCache;
