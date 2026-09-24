/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DefaultEqualChecker.h"
#include "CustomMatchers.h"

void DefaultEqualChecker::registerMatchers(MatchFinder *AstMatcher) {
  // matcher for equality operator
  AstMatcher->addMatcher(
      cxxMethodDecl(isDefinition(), isFirstParty(),
                    hasOverloadedOperatorName("=="), isConst(),
                    hasBody(compoundStmt(statementCountIs(1)).bind("body")))
          .bind("operator"),
      this);

  // matcher for inequality operator
  AstMatcher->addMatcher(
      cxxRecordDecl(
          hasMethod(
              cxxMethodDecl(hasOverloadedOperatorName("=="), isDefaulted())),
          hasMethod(cxxMethodDecl(isDefinition(), isFirstParty(),
                                  hasOverloadedOperatorName("!="), isConst())
                        .bind("neq")))
          .bind("record"),
      this);
}

static bool hasDefaultCompareOperatorSignature(const CXXMethodDecl *MD,
                                               const CXXRecordDecl *RD) {
  if (MD->getTemplatedKind() != FunctionDecl::TemplatedKind::TK_NonTemplate)
    return false;
  const ParmVarDecl *PD = MD->getParamDecl(0);
  QualType PT = PD->getOriginalType();
  if (!PT.isConstQualified() && !PT->isReferenceType())
    return false;

  const clang::Type *PDT = PD->getOriginalType()
                               .getNonReferenceType()
                               .getCanonicalType()
                               .getUnqualifiedType()
                               .getTypePtr();
  if (PDT != RD->getASTContext().getCanonicalTagType(RD)->getTypePtr())
    return false;

  return true;
}

void DefaultEqualChecker::check(const MatchFinder::MatchResult &Result) {
  // Checker for inequality operator
  if (const CXXRecordDecl *RD =
          Result.Nodes.getNodeAs<CXXRecordDecl>("record")) {
    const CXXMethodDecl *MD = Result.Nodes.getNodeAs<CXXMethodDecl>("neq");
    if (!hasDefaultCompareOperatorSignature(MD, RD))
      return;
    StringRef Filename =
        getFilename(Result.Context->getSourceManager(), MD->getBeginLoc());
    diag(MD->getBeginLoc(),
         "'not equal' operator is redundant with defaulted 'equal' operator",
         DiagnosticIDs::Error);
    return;
  }

  // Checker for equality operator
  const CXXMethodDecl *MD = Result.Nodes.getNodeAs<CXXMethodDecl>("operator");
  const CXXRecordDecl *RD = MD->getParent();

  // Skiplist {
  StringRef Filename =
      getFilename(Result.Context->getSourceManager(), MD->getBeginLoc());
  if (Filename.ends_with("ServoStyleConsts.h"))
    return;
  if (Filename.ends_with("webrender_ffi_generated.h"))
    return;
  if (Filename.ends_with("GeneratedElementDocumentState.h"))
    return;
  // }

  if (RD->isUnion())
    return;

  if (RD->getNumBases() != 0)
    return; // NIY

  if (!hasDefaultCompareOperatorSignature(MD, RD))
    return;

  // Only handle one-liner body with an idiomatic structure:
  //
  //  return field0 == aOther.field0 && field1 == aOther.field1 && ...
  const CompoundStmt *CS = Result.Nodes.getNodeAs<CompoundStmt>("body");
  const ReturnStmt *RS = dyn_cast<ReturnStmt>(CS->body_front());
  if (!RS)
    return;

  const Expr *RE = RS->getRetValue();
  if (!RE)
    return;

  // Gather all operands of the && / == chain.
  SmallVector<const BinaryOperator *> EqOperands;
  SmallVector<const Expr *> ToVisit{RE};
  while (!ToVisit.empty()) {
    const Expr *E = ToVisit.pop_back_val();

    const BinaryOperator *BO = dyn_cast<BinaryOperator>(E);
    if (!BO)
      return;
    if (BO->isEqualityOp()) {
      EqOperands.push_back(BO);
    } else if (BO->getOpcode() == BO_LAnd) {
      const BinaryOperator *LHS =
          dyn_cast<BinaryOperator>(BO->getLHS()->IgnoreUnlessSpelledInSource());
      const BinaryOperator *RHS =
          dyn_cast<BinaryOperator>(BO->getRHS()->IgnoreUnlessSpelledInSource());
      if (!LHS || !RHS)
        return;
      ToVisit.push_back(RHS);
      ToVisit.push_back(LHS);
    } else {
      return;
    }
  }

  if (EqOperands.size() != std::distance(RD->field_begin(), RD->field_end()))
    return;

  // Check that each field comparison match the expected pattern.
  int fieldIndex = 0;
  for (const auto *FD : RD->fields()) {
    const BinaryOperator *BO = EqOperands[fieldIndex];
    const MemberExpr *LHS =
        dyn_cast<MemberExpr>(BO->getLHS()->IgnoreUnlessSpelledInSource());
    const MemberExpr *RHS =
        dyn_cast<MemberExpr>(BO->getRHS()->IgnoreUnlessSpelledInSource());
    if (!LHS || !RHS) {
      return;
    }
    if (!isa<CXXThisExpr>(LHS->getBase())) {
      return;
    }
    if (RHS->getMemberDecl() != FD) {
      return;
    }
    fieldIndex += 1;
  }

  diag(MD->getBeginLoc(), "could use a defaulted version",
       DiagnosticIDs::Error);
}
