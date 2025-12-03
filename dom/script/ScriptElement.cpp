/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ScriptElement.h"

#include "ScriptLoader.h"
#include "mozilla/BasicEvents.h"
#include "mozilla/CycleCollectedJSContext.h"
#include "mozilla/EventDispatcher.h"
#include "mozilla/StaticPrefs_dom.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/TrustedTypeUtils.h"
#include "mozilla/dom/TrustedTypesConstants.h"
#include "nsContentSink.h"
#include "nsContentUtils.h"
#include "nsGkAtoms.h"
#include "nsIMutationObserver.h"
#include "nsIParser.h"
#include "nsPresContext.h"
#include "nsThreadUtils.h"

using namespace mozilla;
using namespace mozilla::dom;

NS_IMETHODIMP
ScriptElement::ScriptAvailable(nsresult aResult, nsIScriptElement* aElement,
                               bool aIsInlineClassicScript, nsIURI* aURI,
                               uint32_t aLineNo) {
  if (!aIsInlineClassicScript && NS_FAILED(aResult)) {
    nsCOMPtr<nsIParser> parser = do_QueryReferent(mCreatorParser);
    if (parser) {
      nsCOMPtr<nsIContentSink> sink = parser->GetContentSink();
      if (sink) {
        nsCOMPtr<Document> parserDoc = do_QueryInterface(sink->GetTarget());
        if (GetAsContent()->OwnerDoc() != parserDoc) {
          // Suppress errors when we've moved between docs.
          // /html/semantics/scripting-1/the-script-element/moving-between-documents/move-back-iframe-fetch-error-external-module.html
          // See also https://bugzilla.mozilla.org/show_bug.cgi?id=1849107
          return NS_OK;
        }
      }
    }

    if (parser) {
      parser->IncrementScriptNestingLevel();
    }
    nsresult rv = FireErrorEvent();
    if (parser) {
      parser->DecrementScriptNestingLevel();
    }
    return rv;
  }
  return NS_OK;
}

/* virtual */
nsresult ScriptElement::FireErrorEvent() {
  nsIContent* cont = GetAsContent();

  return nsContentUtils::DispatchTrustedEvent(
      cont->OwnerDoc(), cont, u"error"_ns, CanBubble::eNo, Cancelable::eNo);
}

NS_IMETHODIMP
ScriptElement::ScriptEvaluated(nsresult aResult, nsIScriptElement* aElement,
                               bool aIsInline) {
  nsresult rv = NS_OK;
  if (!aIsInline) {
    nsCOMPtr<nsIContent> cont = GetAsContent();

    RefPtr<nsPresContext> presContext =
        nsContentUtils::GetContextForContent(cont);

    nsEventStatus status = nsEventStatus_eIgnore;
    EventMessage message = NS_SUCCEEDED(aResult) ? eLoad : eLoadError;
    WidgetEvent event(true, message);
    // Load event doesn't bubble.
    event.mFlags.mBubbles = (message != eLoad);

    EventDispatcher::Dispatch(cont, presContext, &event, nullptr, &status);
  }

  return rv;
}

void ScriptElement::CharacterDataChanged(nsIContent* aContent,
                                         const CharacterDataChangeInfo& aInfo) {
  UpdateTrustWorthiness(aInfo.mMutationEffectOnScript);
  MaybeProcessScript();
}

void ScriptElement::AttributeChanged(Element* aElement, int32_t aNameSpaceID,
                                     nsAtom* aAttribute, AttrModType aModType,
                                     const nsAttrValue* aOldValue) {
  // https://html.spec.whatwg.org/#script-processing-model
  // When a script element el that is not parser-inserted experiences one of the
  // events listed in the following list, the user agent must immediately
  // prepare the script element el:
  //  - The script element is connected and has a src attribute set where
  //  previously the element had no such attribute.
  if (aElement->IsSVGElement() && ((aNameSpaceID != kNameSpaceID_XLink &&
                                    aNameSpaceID != kNameSpaceID_None) ||
                                   aAttribute != nsGkAtoms::href)) {
    return;
  }
  if (aElement->IsHTMLElement() &&
      (aNameSpaceID != kNameSpaceID_None || aAttribute != nsGkAtoms::src)) {
    return;
  }
  if (mParserCreated == NOT_FROM_PARSER && aModType == AttrModType::Addition) {
    auto* cont = GetAsContent();
    if (cont->IsInComposedDoc()) {
      MaybeProcessScript();
    }
  }
}

void ScriptElement::ContentAppended(nsIContent* aFirstNewContent,
                                    const ContentAppendInfo& aInfo) {
  UpdateTrustWorthiness(aInfo.mMutationEffectOnScript);
  MaybeProcessScript();
}

void ScriptElement::ContentInserted(nsIContent* aChild,
                                    const ContentInsertInfo& aInfo) {
  UpdateTrustWorthiness(aInfo.mMutationEffectOnScript);
  MaybeProcessScript();
}

void ScriptElement::ContentWillBeRemoved(nsIContent* aChild,
                                         const ContentRemoveInfo& aInfo) {
  UpdateTrustWorthiness(aInfo.mMutationEffectOnScript);
}

bool ScriptElement::MaybeProcessScript() {
  nsIContent* cont = GetAsContent();

  NS_ASSERTION(cont->DebugGetSlots()->mMutationObservers.contains(this),
               "You forgot to add self as observer");

  if (mAlreadyStarted || !mDoneAddingChildren || !cont->GetComposedDoc() ||
      mMalformed) {
    return false;
  }

  // https://html.spec.whatwg.org/#prepare-the-script-element
  // The spec says we should calculate "source text" of inline scripts at the
  // beginning of the "Prepare the script element" algorithm.
  // - If this is an inline script that is not trusted (i.e. we must execute the
  // Trusted Type default policy callback to obtain a trusted "source text")
  // then we must wrap the GetTrustedTypesCompliantInlineScriptText call in a
  // script runner.
  // - If it is an inline script that is trusted, we will actually retrieve the
  // "source text" lazily for performance reasons (see bug 1376651) so we just
  //  use a void string.
  // - If it is an external script, we similarly just pass a void string.
  if (!HasExternalScriptContent() && !mIsTrusted) {
    // TODO: We should likely block parser if IsClassicNonAsyncDefer() returns
    // true but this is tricky because the default policy callback can actually
    // change the script type.
    nsContentUtils::AddScriptRunner(NS_NewRunnableFunction(
        "ScriptElement::MaybeProcessScript",
        [self = RefPtr<nsIScriptElement>(this)]()
            MOZ_CAN_RUN_SCRIPT_BOUNDARY_LAMBDA {
              nsString sourceText;
              self->GetTrustedTypesCompliantInlineScriptText(sourceText);
              ((ScriptElement*)self.get())->MaybeProcessScript(sourceText);
            }));
    return false;
  }
  return MaybeProcessScript(VoidString());
}

bool ScriptElement::MaybeProcessScript(const nsAString& aSourceText) {
  nsIContent* cont = GetAsContent();
  if (!HasExternalScriptContent()) {
    bool hasInlineScriptContent =
        mIsTrusted ? nsContentUtils::HasNonEmptyTextContent(cont)
                   : !aSourceText.IsEmpty();
    if (!hasInlineScriptContent) {
      // In the case of an empty, non-external classic script, there is nothing
      // to process. However, we must perform a microtask checkpoint afterwards,
      // as per https://html.spec.whatwg.org/#clean-up-after-running-script
      if (mKind == JS::loader::ScriptKind::eClassic && !mExternal) {
        nsContentUtils::AddScriptRunner(NS_NewRunnableFunction(
            "ScriptElement::MaybeProcessScript", []() { nsAutoMicroTask mt; }));
      }
      return false;
    }
    MOZ_ASSERT(mIsTrusted == aSourceText.IsVoid());
  }

  // Check the type attribute to determine language and version. If type exists,
  // it trumps the deprecated 'language='.
  nsAutoString type;
  bool hasType = GetScriptType(type);
  if (!type.IsEmpty()) {
    if (!nsContentUtils::IsJavascriptMIMEType(type) &&
        !type.LowerCaseEqualsASCII("module") &&
        !type.LowerCaseEqualsASCII("importmap")) {
#ifdef DEBUG
      // There is a WebGL convention to store strings they need inside script
      // tags with these specific unknown script types, so don't warn for them.
      // "text/something-not-javascript" only seems to be used in the WebGL
      // conformance tests, but it is also clearly deliberately invalid, so
      // skip warning for it, too, to reduce warning spam.
      if (!type.LowerCaseEqualsASCII("x-shader/x-vertex") &&
          !type.LowerCaseEqualsASCII("x-shader/x-fragment") &&
          !type.LowerCaseEqualsASCII("text/something-not-javascript")) {
        NS_WARNING(nsPrintfCString("Unknown script type '%s'",
                                   NS_ConvertUTF16toUTF8(type).get())
                       .get());
      }
#endif  // #ifdef DEBUG
      return false;
    }
  } else if (!hasType) {
    // "language" is a deprecated attribute of HTML, so we check it only for
    // HTML script elements.
    if (cont->IsHTMLElement()) {
      nsAutoString language;
      cont->AsElement()->GetAttr(nsGkAtoms::language, language);
      if (!language.IsEmpty() &&
          !nsContentUtils::IsJavaScriptLanguage(language)) {
        return false;
      }
    }
  }

  Document* ownerDoc = cont->OwnerDoc();
  FreezeExecutionAttrs(ownerDoc);

  mAlreadyStarted = true;

  nsCOMPtr<nsIParser> parser = ((nsIScriptElement*)this)->GetCreatorParser();
  if (parser) {
    nsCOMPtr<nsIContentSink> sink = parser->GetContentSink();
    if (sink) {
      nsCOMPtr<Document> parserDoc = do_QueryInterface(sink->GetTarget());
      if (ownerDoc != parserDoc) {
        // Refactor this: https://bugzilla.mozilla.org/show_bug.cgi?id=1849107
        return false;
      }
    }
  }

  RefPtr<ScriptLoader> loader = ownerDoc->GetScriptLoader();
  if (!loader) {
    return false;
  }
  return loader->ProcessScriptElement(this, aSourceText);
}

bool ScriptElement::GetScriptType(nsAString& aType) {
  Element* element = GetAsContent()->AsElement();

  nsAutoString type;
  if (!element->GetAttr(nsGkAtoms::type, type)) {
    return false;
  }

  // ASCII whitespace https://infra.spec.whatwg.org/#ascii-whitespace:
  // U+0009 TAB, U+000A LF, U+000C FF, U+000D CR, or U+0020 SPACE.
  static const char kASCIIWhitespace[] = "\t\n\f\r ";

  const bool wasEmptyBeforeTrim = type.IsEmpty();
  type.Trim(kASCIIWhitespace);

  // If the value before trim was not empty and the value is now empty, do not
  // trim as we want to retain pure whitespace (by restoring original value)
  // because we need to treat "" and " " (etc) differently.
  if (!wasEmptyBeforeTrim && type.IsEmpty()) {
    return element->GetAttr(nsGkAtoms::type, aType);
  }

  aType.Assign(type);
  return true;
}

void ScriptElement::UpdateTrustWorthiness(
    MutationEffectOnScript aMutationEffectOnScript) {
  if (aMutationEffectOnScript == MutationEffectOnScript::DropTrustWorthiness &&
      StaticPrefs::dom_security_trusted_types_enabled()) {
    mIsTrusted = false;
  }
}

nsresult ScriptElement::GetTrustedTypesCompliantInlineScriptText(
    nsString& aSourceText) {
  MOZ_ASSERT(!mIsTrusted);

  RefPtr<Element> element = GetAsContent()->AsElement();
  nsAutoString sourceText;
  GetScriptText(sourceText);

  MOZ_ASSERT(element->IsHTMLElement() || element->IsSVGElement());
  Maybe<nsAutoString> compliantStringHolder;
  constexpr nsLiteralString htmlSinkName = u"HTMLScriptElement text"_ns;
  constexpr nsLiteralString svgSinkName = u"SVGScriptElement text"_ns;
  ErrorResult error;

  nsCOMPtr<nsIPrincipal> subjectPrincipal;
  if (JSContext* cx = nsContentUtils::GetCurrentJSContext()) {
    subjectPrincipal = nsContentUtils::SubjectPrincipal(cx);
  }
  const nsAString* compliantString =
      TrustedTypeUtils::GetTrustedTypesCompliantStringForTrustedScript(
          sourceText, element->IsHTMLElement() ? htmlSinkName : svgSinkName,
          kTrustedTypesOnlySinkGroup, *element, subjectPrincipal,
          compliantStringHolder, error);
  if (!error.Failed()) {
    aSourceText.Assign(*compliantString);
  }
  return error.StealNSResult();
}
