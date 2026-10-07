/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_Sanitizer_h
#define mozilla_dom_Sanitizer_h

#include "mozilla/FunctionRef.h"
#include "mozilla/Maybe.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/DocumentFragment.h"
#include "mozilla/dom/SanitizerBinding.h"
#include "mozilla/dom/SanitizerTypes.h"
#include "mozilla/dom/StaticAtomSet.h"
#include "nsIParserUtils.h"
#include "nsNameSpaceManager.h"
#include "nsPIDOMWindow.h"
#include "nsString.h"

class nsISupports;

namespace mozilla {

class ErrorResult;
enum UseCounter : int16_t;

namespace dom {

class Element;
class GlobalObject;

enum class SanitizerElementAction : uint8_t {
  Keep,
  Remove,
  ReplaceWithChildren
};

/**
 * What a configuration does with an element, plus the per-element data that
 * the element's attributes are matched against. Only valid for the Sanitizer
 * that returned it, and only until that Sanitizer's configuration changes.
 */
class SanitizerElementMatch final {
 public:
  SanitizerElementAction Action() const { return mAction; }

 private:
  friend class Sanitizer;

  SanitizerElementAction mAction = SanitizerElementAction::Keep;
  bool mSafe = false;
  nsAtom* mLocalName = nullptr;
  int32_t mNamespaceID = kNameSpaceID_None;
  // The element's entry in the configuration's element list, if any. Which of
  // the two the match uses depends on Sanitizer::mIsDefaultConfig.
  StaticAtomSet* mDefaultAttributes = nullptr;
  sanitizer::CanonicalElementAttributes* mAttributes = nullptr;
};

class Sanitizer final : public nsISupports, public nsWrapperCache {
  explicit Sanitizer(nsPIDOMWindowInner* aWindow) : mWindow(aWindow) {
    MOZ_ASSERT(aWindow);
  }

 public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS_FINAL
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(Sanitizer);

  nsPIDOMWindowInner* GetParentObject() const { return mWindow; }

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  static already_AddRefed<Sanitizer> GetInstance(
      nsPIDOMWindowInner* aWindow,
      const OwningSanitizerOrSanitizerConfigOrSanitizerPresets& aOptions,
      bool aSafe, ErrorResult& aRv);

  // WebIDL
  static already_AddRefed<Sanitizer> Constructor(
      const GlobalObject& aGlobal,
      const SanitizerConfigOrSanitizerPresets& aConfig, ErrorResult& aRv);

  void Get(SanitizerConfig& aConfig);

  bool AllowElement(
      const StringOrSanitizerElementNamespaceWithAttributes& aElement);
  bool RemoveElement(const StringOrSanitizerElementNamespace& aElement);
  bool ReplaceElementWithChildren(
      const StringOrSanitizerElementNamespace& aElement);
  bool AllowProcessingInstruction(
      const StringOrSanitizerProcessingInstruction& aPI);
  bool RemoveProcessingInstruction(
      const StringOrSanitizerProcessingInstruction& aPI);
  bool AllowAttribute(const StringOrSanitizerAttributeNamespace& aAttribute);
  bool RemoveAttribute(const StringOrSanitizerAttributeNamespace& aAttribute);
  bool SetComments(bool aAllow);
  bool SetDataAttributes(bool aAllow);
  bool SetJavascriptURLs(bool aAllow);
  bool RemoveUnsafe();

  /**
   * Sanitizes a node in place. This assumes that the node
   * belongs but an inert document.
   *
   * @param aNode Node to be sanitized in place
   */

  void Sanitize(nsINode* aNode, bool aSafe, ErrorResult& aRv);

  /**
   * Runs the spec's "sanitize" for a single element that is already in the
   * tree, for the HTML parser: removes the attributes the configuration
   * disallows from aElement in place and discards the returned action.
   *
   * @param aSafe the spec's "remove javascript navigation URLs"
   */
  void SanitizeElement(Element* aElement, bool aSafe) const;

  /**
   * Runs the element half of the spec's "sanitize" for the HTML parser: what
   * the configuration does with the element that a start tag token creates.
   * Pair it with ShouldRemoveAttribute() to sanitize the token's attributes
   * before they are applied to that element.
   *
   * @param aSafe the spec's "remove javascript navigation URLs"
   */
  SanitizerElementMatch MatchElement(nsAtom* aLocalName, int32_t aNamespaceID,
                                     bool aSafe) const;

  /**
   * Runs the attribute half of the spec's "sanitize" for the HTML parser:
   * whether an attribute has to be dropped from the start tag token that
   * aMatch was obtained for. aGetValue writes the attribute value and only
   * runs for the few attributes whose value decides the outcome.
   */
  bool ShouldRemoveAttribute(const SanitizerElementMatch& aMatch,
                             nsAtom* aLocalName, int32_t aNamespaceID,
                             FunctionRef<void(nsAString&)> aGetValue) const;

  bool CommentsAllowed() const { return mComments; }

  // Telemetry: records that this Sanitizer is about to be used to sanitize.
  // Call it once per sanitize, from every entry point: Sanitize() for the
  // pre-sanitize-while-parsing path, and the HTML parser for the
  // sanitize-while-parsing one, which never calls Sanitize().
  void RecordSanitizeUse() const;

 private:
  ~Sanitizer() = default;

  // Sets aCounter on the document this Sanitizer belongs to. Use counters
  // deduplicate per document, so a configuration key is counted once however
  // often it is used. The same counters are shared between the SanitizerConfig
  // dictionary keys and the Sanitizer methods that modify the same part of the
  // configuration.
  void RecordConfigKeyUse(UseCounter aCounter) const;

  // As above, for a Sanitizer method that modified the configuration. Also
  // marks the configuration as no longer being the unmodified default.
  void RecordConfigChange(UseCounter aCounter);

  void RecordDictionaryConfigKeyUses(const SanitizerConfig& aConfig) const;

  // Records the per-element attribute lists nested inside an "elements" entry.
  // Only the dictionary form of the union can carry them. Templated because the
  // dictionary holds the owning union and the methods take the non-owning one.
  template <typename T>
  void RecordElementAttributeKeyUses(const T& aElement) const;

  // The "allow an element" algorithm itself, returning whether it modified the
  // configuration. AllowElement() records the configuration keys it touched
  // only when it did, so that the counters cannot drift from the many
  // codepaths in here.
  bool AllowElementInternal(
      const StringOrSanitizerElementNamespaceWithAttributes& aElement);

  void CanonicalizeConfiguration(const SanitizerConfig& aConfig,
                                 bool aPermissiveDefaults, ErrorResult& aRv);
  void IsValid(ErrorResult& aRv) const;

  void SetDefaultConfig();
  void SetConfig(const SanitizerConfig& aConfig, bool aPermissiveDefaults,
                 ErrorResult& aRv);

  void MaybeMaterializeDefaultConfig();

  bool RemoveElementCanonical(sanitizer::CanonicalElement&& aElement);
  bool RemoveAttributeCanonical(sanitizer::CanonicalAttribute&& aAttribute);

  template <bool IsDefaultConfig>
  void SanitizeChildren(nsINode* aNode, bool aSafe) const;

  template <bool IsDefaultConfig>
  SanitizerElementAction SanitizeElementInternal(Element* aElement,
                                                 bool aSafe) const;

  template <bool IsDefaultConfig>
  SanitizerElementMatch MatchElementInternal(nsAtom* aLocalName,
                                             int32_t aNamespaceID,
                                             bool aSafe) const;

  template <bool IsDefaultConfig>
  bool ShouldRemoveAttributeInternal(
      const SanitizerElementMatch& aMatch, nsAtom* aLocalName,
      int32_t aNamespaceID, FunctionRef<void(nsAString&)> aGetValue) const;

  // Whether the configuration allows an attribute on the element aMatch was
  // obtained for: the spec's "sanitize" steps 5.2.-5.6.
  template <bool IsDefaultConfig>
  bool MatchAllowsAttribute(const SanitizerElementMatch& aMatch,
                            nsAtom* aAttrLocalName, int32_t aAttrNs) const;

  // Whether the configuration's global and per-element attribute lists allow
  // an attribute, given the element's entry in the element list. The two
  // overloads are the default configuration's and a canonicalized
  // configuration's representation of that entry.
  bool AttributeListsAllow(StaticAtomSet* aElementAttributes,
                           nsAtom* aAttrLocalName, int32_t aAttrNs,
                           bool aSafe) const;
  bool AttributeListsAllow(
      sanitizer::CanonicalElementAttributes* aElementAttributes,
      nsAtom* aAttrLocalName, int32_t aAttrNs, bool aSafe) const;

  void AssertIsValid() const;

  void AssertNoLists() const {
    MOZ_ASSERT(!mElements);
    MOZ_ASSERT(!mRemoveElements);
    MOZ_ASSERT(!mReplaceWithChildrenElements);
    MOZ_ASSERT(!mProcessingInstructions);
    MOZ_ASSERT(!mRemoveProcessingInstructions);
    MOZ_ASSERT(!mAttributes);
    MOZ_ASSERT(!mRemoveAttributes);
  }

  nsCOMPtr<nsPIDOMWindowInner> mWindow;

  Maybe<sanitizer::CanonicalElementMap> mElements;
  Maybe<sanitizer::CanonicalElementSet> mRemoveElements;
  Maybe<sanitizer::CanonicalElementSet> mReplaceWithChildrenElements;

  Maybe<sanitizer::CanonicalPISet> mProcessingInstructions;
  Maybe<sanitizer::CanonicalPISet> mRemoveProcessingInstructions;

  Maybe<sanitizer::CanonicalAttributeSet> mAttributes;
  Maybe<sanitizer::CanonicalAttributeSet> mRemoveAttributes;

  bool mComments = false;
  // mDataAttributes always exists when mAttributes exists after
  // canonicalization. It never exists at the same time as mRemoveAttributes.
  Maybe<bool> mDataAttributes;

  bool mJavascriptURLs = false;

  // Optimization: This sanitizer has a lazy default config. None
  // of the element lists will be used, however mComments and mDataAttributes
  // continue to be functional.
  bool mIsDefaultConfig = false;

  // Telemetry: whether the configuration is still the built-in default, i.e.
  // no dictionary was supplied and no method call has modified it. This is not
  // the same as mIsDefaultConfig, which only tracks whether the lists are still
  // lazy: get() materializes them without modifying the configuration, while
  // setComments() and setDataAttributes() modify the configuration without
  // materializing them.
  bool mCountsAsDefaultConfig = false;
};
}  // namespace dom
}  // namespace mozilla

#endif  // ifndef mozilla_dom_Sanitizer_h
