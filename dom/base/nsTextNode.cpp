/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Implementation of DOM Core's Text node.
 */

#include "nsTextNode.h"

#include "mozilla/IntegerPrintfMacros.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/TextBinding.h"
#include "nsContentUtils.h"
#include "nsStubMutationObserver.h"
#include "nsThreadUtils.h"
#ifdef MOZ_DOM_LIST
#  include "mozilla/dom/Range.h"
#endif

using namespace mozilla;
using namespace mozilla::dom;

nsTextNode::~nsTextNode() = default;

// Use the CC variant of this, even though this class does not define
// a new CC participant, to make QIing to the CC interfaces faster.
NS_IMPL_ISUPPORTS_CYCLE_COLLECTION_INHERITED_0(nsTextNode, CharacterData)

JSObject* nsTextNode::WrapNode(JSContext* aCx,
                               JS::Handle<JSObject*> aGivenProto) {
  return Text_Binding::Wrap(aCx, this, aGivenProto);
}

already_AddRefed<CharacterData> nsTextNode::CloneDataNode(
    mozilla::dom::NodeInfo* aNodeInfo, bool aCloneText) const {
  RefPtr<nsTextNode> it =
      new (aNodeInfo->NodeInfoManager()) nsTextNode(do_AddRef(aNodeInfo));
  if (aCloneText) {
    it->mBuffer = mBuffer;
  }
  it->SetFlags(GetFlags() & NS_MAYBE_MASKED);
  return it.forget();
}

nsresult nsTextNode::AppendTextForNormalize(const char16_t* aBuffer,
                                            uint32_t aLength, bool aNotify,
                                            nsIContent* aNextSibling) {
  CharacterDataChangeInfo::Details details = {
      CharacterDataChangeInfo::Details::eMerge, aNextSibling};
  return SetTextInternal(mBuffer.GetLength(), 0, aBuffer, aLength, aNotify,
                         MutationEffectOnScript::KeepTrustWorthiness, &details);
}

#ifdef MOZ_DOM_LIST
void nsTextNode::List(FILE* out, int32_t aIndent) const {
  int32_t index;
  for (index = aIndent; --index >= 0;) fputs("  ", out);

  fprintf(out, "Text@%p", static_cast<const void*>(this));
  fprintf(out, " flags=[%08x]", static_cast<unsigned int>(GetFlags()));
  if (IsClosestCommonInclusiveAncestorForRangeInSelection()) {
    const LinkedList<AbstractRange>* ranges =
        GetExistingClosestCommonInclusiveAncestorRanges();
    uint32_t count = ranges ? ranges->length() : 0;
    fprintf(out, " ranges:%d", count);
  }
  fprintf(out, " primaryframe=%p", static_cast<void*>(GetPrimaryFrame()));
  fprintf(out, " refcount=%" PRIuPTR "<", mRefCnt.get());

  nsAutoString tmp;
  ToCString(tmp, 0, mBuffer.GetLength());
  fputs(NS_LossyConvertUTF16toASCII(tmp).get(), out);

  fputs(">\n", out);
}

void nsTextNode::DumpContent(FILE* out, int32_t aIndent, bool aDumpAll) const {
  if (aDumpAll) {
    int32_t index;
    for (index = aIndent; --index >= 0;) fputs("  ", out);

    nsAutoString tmp;
    ToCString(tmp, 0, mBuffer.GetLength());

    if (!tmp.EqualsLiteral("\\n")) {
      fputs(NS_LossyConvertUTF16toASCII(tmp).get(), out);
      if (aIndent) fputs("\n", out);
    }
  }
}
#endif
