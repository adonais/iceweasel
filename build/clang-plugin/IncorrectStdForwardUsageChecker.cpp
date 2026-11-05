/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "IncorrectStdForwardUsageChecker.h"
#include "CustomMatchers.h"

void IncorrectStdForwardUsageChecker::registerMatchers(
    MatchFinder *AstMatcher) {
  // Match std::forward<...>(a) where a is a function parameter.
  // The actual matching is done in the ::check(...) method as it requires
  // access to lower-level API than the matcher, although it may be possible to
  // write custom matchers for this.

  AstMatcher->addMatcher(
      callExpr(
          callee(unresolvedLookupExpr(
                     hasAnyDeclaration(functionTemplateDecl(
                         hasUnderlyingDecl(hasName("::std::forward")))))
                     .bind("forward-expr")),
          argumentCountIs(1),
          hasArgument(0, ignoringParenImpCasts(declRefExpr(to(
                             parmVarDecl(isFirstParty()).bind("parm-var")))))),
      this);
}

void IncorrectStdForwardUsageChecker::check(
    const MatchFinder::MatchResult &Result) {
  const ParmVarDecl *PD = Result.Nodes.getNodeAs<ParmVarDecl>("parm-var");

  // Macro-generated code is not always compatible with the fine-tuning required
  // by this checker.
  if (PD->getLocation().isMacroID())
    return;

  // We want to catch the following pattern:
  //
  //   template<class T>
  //   auto foo(T a) { /*...*/ std::forward<T>(a) /* ...*/
  //
  // So make sure we're in a template function, that the std::forward template
  // parameter as the right depth and qualifiers.

  // This matches concept, but not function decl.
  const TemplateDecl *Template = dyn_cast<TemplateDecl>(PD->getDeclContext());
  if (!Template) {
    const auto *Function = dyn_cast_or_null<FunctionDecl>(PD->getDeclContext());
    if (!Function)
      return;

    Template = Function->getDescribedFunctionTemplate();
    if (!Template)
      return;
  }

  // Filter out correct qualifiers : T&& is fine
  QualType PDQ = PD->getType().getNonPackExpansionType();
  if (PDQ->isRValueReferenceType())
    return;

  // T& is not fine
  if (PDQ->isLValueReferenceType())
    PDQ = PDQ->getPointeeType();

  // Concrete types are out of scope.
  // FIXME: check for those too?
  if (!PDQ->isTemplateTypeParmType())
    return;

  // If the template parameter type is attached to a parent scope, we're not in
  // the scenario of perfect-forwarding we want to catch.
  const auto *ParamTemplateType = PDQ->getAsCanonical<TemplateTypeParmType>();
  if (ParamTemplateType->getDepth() !=
      Template->getTemplateParameters()->getDepth())
    return;

  // Now check that std::forward template parameter is the same as the one of
  // it's argument, once decayed.
  const UnresolvedLookupExpr *ULE =
      Result.Nodes.getNodeAs<UnresolvedLookupExpr>("forward-expr");
  if (ULE->getNumTemplateArgs() != 1)
    return;
  TemplateArgument TA = ULE->template_arguments()[0].getArgument();
  if (TA.isPackExpansion())
    TA = TA.getPackExpansionPattern();
  if (TA.getKind() != TemplateArgument::ArgKind::Type)
    return;

  const auto *TN = TA.getAsType()->getAsCanonical<TemplateTypeParmType>();
  if (TN == ParamTemplateType) {
    const char *Error = "Parameter %0 perfectly forwarded through "
                        "'std::forward' while not using universal references.";
    diag(PD->getBeginLoc(), Error, DiagnosticIDs::Error) << PD;
  }
}
