/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Sanitizer.h"

#include "mozilla/ClearOnShutdown.h"
#include "mozilla/Span.h"
#include "mozilla/StaticPtr.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/BindingUtils.h"
#include "mozilla/dom/DocumentFragment.h"
#include "mozilla/dom/HTMLTemplateElement.h"
#include "mozilla/dom/SanitizerBinding.h"
#include "mozilla/dom/SanitizerDefaultConfig.h"
#include "nsContentUtils.h"
#include "nsGenericHTMLElement.h"
#include "nsIContentInlines.h"
#include "nsNameSpaceManager.h"

namespace mozilla::dom {
using namespace sanitizer;

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(Sanitizer, mGlobal)

NS_IMPL_CYCLE_COLLECTING_ADDREF(Sanitizer)
NS_IMPL_CYCLE_COLLECTING_RELEASE(Sanitizer)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(Sanitizer)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

// Map[ElementName -> ?Set[Attributes]]
using ElementsWithAttributes =
    nsTHashMap<const nsStaticAtom*, UniquePtr<StaticAtomSet>>;

StaticAutoPtr<ElementsWithAttributes> sDefaultHTMLElements;
StaticAutoPtr<ElementsWithAttributes> sDefaultMathMLElements;
StaticAutoPtr<ElementsWithAttributes> sDefaultSVGElements;
StaticAutoPtr<StaticAtomSet> sDefaultAttributes;

JSObject* Sanitizer::WrapObject(JSContext* aCx,
                                JS::Handle<JSObject*> aGivenProto) {
  return Sanitizer_Binding::Wrap(aCx, this, aGivenProto);
}

/* static */
// https://wicg.github.io/sanitizer-api/#sanitizerconfig-get-a-sanitizer-instance-from-options
already_AddRefed<Sanitizer> Sanitizer::GetInstance(
    nsIGlobalObject* aGlobal,
    const OwningSanitizerOrSanitizerConfigOrSanitizerPresets& aOptions,
    bool aSafe, ErrorResult& aRv) {
  // Step 4. If sanitizerSpec is a string:
  if (aOptions.IsSanitizerPresets()) {
    // Step 4.1. Assert: sanitizerSpec is "default"
    MOZ_ASSERT(aOptions.GetAsSanitizerPresets() == SanitizerPresets::Default);

    // Step 4.2. Set sanitizerSpec to the built-in safe default configuration.
    // NOTE: The built-in safe default configuration is complete and not
    // influenced by |safe|.
    RefPtr<Sanitizer> sanitizer = new Sanitizer(aGlobal);
    sanitizer->SetDefaultConfig();
    return sanitizer.forget();
  }

  // Step 5. Assert: sanitizerSpec is either a Sanitizer instance, or a
  // dictionary. Step 6. If sanitizerSpec is a dictionary:
  if (aOptions.IsSanitizerConfig()) {
    // Step 6.1. Let sanitizer be a new Sanitizer instance.
    RefPtr<Sanitizer> sanitizer = new Sanitizer(aGlobal);

    // Step 6.2. Let setConfigurationResult be the result of set a
    // configuration with sanitizerSpec and not safe on sanitizer.
    sanitizer->SetConfig(aOptions.GetAsSanitizerConfig(), !aSafe, aRv);

    // Step 6.3. If setConfigurationResult is false, throw a TypeError.
    if (aRv.Failed()) {
      return nullptr;
    }

    // Step 6.4. Set sanitizerSpec to sanitizer.
    return sanitizer.forget();
  }

  // Step 7. Assert: sanitizerSpec is a Sanitizer instance.
  MOZ_ASSERT(aOptions.IsSanitizer());

  // Step 8. Return sanitizerSpec.
  RefPtr<Sanitizer> sanitizer = aOptions.GetAsSanitizer();
  return sanitizer.forget();
}

/* static */
// https://wicg.github.io/sanitizer-api/#sanitizer-constructor
already_AddRefed<Sanitizer> Sanitizer::Constructor(
    const GlobalObject& aGlobal,
    const SanitizerConfigOrSanitizerPresets& aConfig, ErrorResult& aRv) {
  nsCOMPtr<nsIGlobalObject> global = do_QueryInterface(aGlobal.GetAsSupports());
  RefPtr<Sanitizer> sanitizer = new Sanitizer(global);

  // Step 1. If configuration is a SanitizerPresets string, then:
  if (aConfig.IsSanitizerPresets()) {
    // Step 1.1. Assert: configuration is default.
    MOZ_ASSERT(aConfig.GetAsSanitizerPresets() == SanitizerPresets::Default);

    // Step 1.2. Set configuration to the built-in safe default configuration.
    sanitizer->SetDefaultConfig();

    // NOTE: Early return because we don't need to do any
    // processing/verification of the default config.
    return sanitizer.forget();
  }

  // Step 2. Let valid be the return value of set a configuration with
  // configuration and true on this.
  sanitizer->SetConfig(aConfig.GetAsSanitizerConfig(), true, aRv);

  // Step 3. If valid is false, then throw a TypeError.
  if (aRv.Failed()) {
    return nullptr;
  }

  return sanitizer.forget();
}

void Sanitizer::SetDefaultConfig() {
  MOZ_ASSERT(NS_IsMainThread());
  AssertNoLists();
  MOZ_ASSERT(!mComments);
  MOZ_ASSERT(mDataAttributes.isNothing());

  mIsDefaultConfig = true;

  // https://wicg.github.io/sanitizer-api/#built-in-safe-default-configuration
  // {
  //   ...
  //   "comments": false,
  //   "dataAttributes": false
  // }
  mComments = false;
  mDataAttributes = Some(false);

  if (sDefaultHTMLElements) {
    // Already initialized.
    return;
  }

  auto createElements = [](mozilla::Span<nsStaticAtom* const> aElements,
                           nsStaticAtom* const* aElementWithAttributes) {
    auto elements = new ElementsWithAttributes(aElements.Length());

    size_t i = 0;
    for (nsStaticAtom* name : aElements) {
      UniquePtr<StaticAtomSet> attributes = nullptr;

      // Walkthrough the element specific attribute list in lockstep.
      // The last "name" in the array is a nullptr sentinel.
      if (name == aElementWithAttributes[i]) {
        attributes = MakeUnique<StaticAtomSet>();
        while (aElementWithAttributes[++i]) {
          attributes->Insert(aElementWithAttributes[i]);
        }
        i++;
      }

      elements->InsertOrUpdate(name, std::move(attributes));
    }

    return elements;
  };

  sDefaultHTMLElements =
      createElements(Span(kDefaultHTMLElements), kHTMLElementWithAttributes);
  sDefaultMathMLElements = createElements(Span(kDefaultMathMLElements),
                                          kMathMLElementWithAttributes);
  sDefaultSVGElements =
      createElements(Span(kDefaultSVGElements), kSVGElementWithAttributes);

  sDefaultAttributes = new StaticAtomSet(std::size(kDefaultAttributes));
  for (nsStaticAtom* name : kDefaultAttributes) {
    sDefaultAttributes->Insert(name);
  }

  ClearOnShutdown(&sDefaultHTMLElements);
  ClearOnShutdown(&sDefaultMathMLElements);
  ClearOnShutdown(&sDefaultAttributes);
}

auto& GetAsSanitizerElementNamespace(
    const StringOrSanitizerElementNamespace& aElement) {
  return aElement.GetAsSanitizerElementNamespace();
}
auto& GetAsSanitizerElementNamespace(
    const OwningStringOrSanitizerElementNamespace& aElement) {
  return aElement.GetAsSanitizerElementNamespace();
}
auto& GetAsSanitizerElementNamespace(
    const StringOrSanitizerElementNamespaceWithAttributes& aElement) {
  return aElement.GetAsSanitizerElementNamespaceWithAttributes();
}
auto& GetAsSanitizerElementNamespace(
    const OwningStringOrSanitizerElementNamespaceWithAttributes& aElement) {
  return aElement.GetAsSanitizerElementNamespaceWithAttributes();
}

// https://wicg.github.io/sanitizer-api/#canonicalize-a-sanitizer-element
template <typename SanitizerElement>
static CanonicalName CanonicalizeElement(const SanitizerElement& aElement) {
  // return the result of canonicalize a sanitizer name with element and the
  // HTML namespace as the default namespace.

  // https://wicg.github.io/sanitizer-api/#canonicalize-a-sanitizer-name
  // Step 1. Assert: name is either a DOMString or a dictionary. (implicit)

  // Step 2. If name is a DOMString, then return «[ "name" → name, "namespace"
  // → defaultNamespace]».
  if (aElement.IsString()) {
    RefPtr<nsAtom> nameAtom = NS_AtomizeMainThread(aElement.GetAsString());
    return CanonicalName(nameAtom, nsGkAtoms::nsuri_xhtml);
  }

  // Step 3. Assert: name is a dictionary and both name["name"] and
  // name["namespace"] exist.
  const auto& elem = GetAsSanitizerElementNamespace(aElement);
  MOZ_ASSERT(!elem.mName.IsVoid());

  // Step 4. If name["namespace"] is the empty string, then set it to null.
  RefPtr<nsAtom> namespaceAtom;
  if (!elem.mNamespace.IsEmpty()) {
    namespaceAtom = NS_AtomizeMainThread(elem.mNamespace);
  }

  // Step 5. Return «[
  //  "name" → name["name"],
  //  "namespace" → name["namespace"]
  //  )
  // ]».
  RefPtr<nsAtom> nameAtom = NS_AtomizeMainThread(elem.mName);
  return CanonicalName(nameAtom, namespaceAtom);
}

// https://wicg.github.io/sanitizer-api/#canonicalize-a-sanitizer-attribute
template <typename SanitizerAttribute>
static CanonicalName CanonicalizeAttribute(
    const SanitizerAttribute& aAttribute) {
  // return the result of canonicalize a sanitizer name with attribute and
  // null as the default namespace.

  // https://wicg.github.io/sanitizer-api/#canonicalize-a-sanitizer-name
  // Step 1. Assert: name is either a DOMString or a dictionary. (implicit)

  // Step 2. If name is a DOMString, then return «[ "name" → name, "namespace"
  // → defaultNamespace]».
  if (aAttribute.IsString()) {
    RefPtr<nsAtom> nameAtom = NS_AtomizeMainThread(aAttribute.GetAsString());
    return CanonicalName(nameAtom, nullptr);
  }

  // Step 3. Assert: name is a dictionary and both name["name"] and
  // name["namespace"] exist.
  const auto& attr = aAttribute.GetAsSanitizerAttributeNamespace();
  MOZ_ASSERT(!attr.mName.IsVoid());

  // Step 4. If name["namespace"] is the empty string, then set it to null.
  RefPtr<nsAtom> namespaceAtom;
  if (!attr.mNamespace.IsEmpty()) {
    namespaceAtom = NS_AtomizeMainThread(attr.mNamespace);
  }

  // Step 5. Return «[
  //  "name" → name["name"],
  //  "namespace" → name["namespace"],
  //  )
  // ]».
  RefPtr<nsAtom> nameAtom = NS_AtomizeMainThread(attr.mName);
  return CanonicalName(nameAtom, namespaceAtom);
}

// https://wicg.github.io/sanitizer-api/#canonicalize-a-sanitizer-element-with-attributes
template <typename SanitizerElementWithAttributes>
static CanonicalElementWithAttributes CanonicalizeElementWithAttributes(
    const SanitizerElementWithAttributes& aElement) {
  // Step 1. Let result be the result of canonicalize a sanitizer element with
  // element.
  CanonicalElementWithAttributes result =
      CanonicalElementWithAttributes(CanonicalizeElement(aElement));

  // Step 2. If element is a dictionary:
  if (aElement.IsSanitizerElementNamespaceWithAttributes()) {
    auto& elem = aElement.GetAsSanitizerElementNamespaceWithAttributes();

    // Step 2.1. If element["attributes"] exists:
    if (elem.mAttributes.WasPassed()) {
      // Step 2.1.1. Let attributes be « ».
      ListSet<CanonicalName> attributes;

      // Step 2.1.2. For each attribute of element["attributes"]:
      for (const auto& attribute : elem.mAttributes.Value()) {
        // Step 2.1.2.1. Append the result of canonicalize a sanitizer attribute
        // with attribute to attributes.
        attributes.Insert(CanonicalizeAttribute(attribute));
      }

      // Step 2.1.3. Set result["attributes"] to attributes.
      result.mAttributes = Some(std::move(attributes));
    }

    // Step 2.2. If element["attributes"] exists:
    if (elem.mRemoveAttributes.WasPassed()) {
      // Step 2.2.1. Let attributes be « ».
      ListSet<CanonicalName> attributes;

      // Step 2.2.2. For each attribute of element["removeAttributes"]:
      for (const auto& attribute : elem.mRemoveAttributes.Value()) {
        // Step 2.2.2.1. Append the result of canonicalize a sanitizer attribute
        // with attribute to attributes.
        attributes.Insert(CanonicalizeAttribute(attribute));
      }

      // Step 2.2.3. Set result["removeAttributes"] to attributes.
      result.mRemoveAttributes = Some(std::move(attributes));
    }
  }

  // Step 3. If neither result["attributes"] nor
  // result["removeAttributes"] exist:
  if (!result.mAttributes && !result.mRemoveAttributes) {
    // Step 3.1. Set result["removeAttributes"] to « ».
    result.mRemoveAttributes = Some(ListSet<CanonicalName>());
  }

  // Step 4. Return result.
  return result;
}

// https://wicg.github.io/sanitizer-api/#configuration-canonicalize
void Sanitizer::CanonicalizeConfiguration(
    const SanitizerConfig& aConfig, bool aAllowCommentsAndDataAttributes) {
  // Step 1. If neither configuration["elements"] nor
  // configuration["removeElements"] exist, then set
  // configuration["removeElements"] to « [] ».
  if (!aConfig.mElements.WasPassed() && !aConfig.mRemoveElements.WasPassed()) {
    mRemoveElements.emplace();
  }

  // Step 2. If neither configuration["attributes"] nor
  // configuration["removeAttributes"] exist, then set
  // configuration["removeAttributes"] to « [] ».
  if (!aConfig.mAttributes.WasPassed() &&
      !aConfig.mRemoveAttributes.WasPassed()) {
    mRemoveAttributes.emplace();
  }

  // Step 3. If configuration["elements"] exists:
  if (aConfig.mElements.WasPassed()) {
    // Step 3.1. Let elements be « [] »
    nsTArray<CanonicalElementWithAttributes> elements;

    // Step 3.2. For each element of configuration["elements"] do:
    for (const auto& element : aConfig.mElements.Value()) {
      // Step 3.3.2.1. Append the result of canonicalize a sanitizer element
      // with attributes element to elements.
      elements.AppendElement(CanonicalizeElementWithAttributes(element));
    }

    // Step 3.3. Set configuration["elements"] to elements.
    mElements = Some(ListSet(std::move(elements)));
  }

  // Step 4. If configuration["removeElements"] exists:
  if (aConfig.mRemoveElements.WasPassed()) {
    // Step 4.1. Let elements be « [] »
    nsTArray<CanonicalName> elements;

    // Step 4.2. For each element of configuration["removeElements"] do:
    for (const auto& element : aConfig.mRemoveElements.Value()) {
      // Step 4.2.1. Append the result of canonicalize a sanitizer element
      // element to elements.
      elements.AppendElement(CanonicalizeElement(element));
    }

    // Step 4.3. Set configuration["removeElements"] to elements.
    mRemoveElements = Some(ListSet(std::move(elements)));
  }

  // Step 5. If configuration["replaceWithChildrenElements"] exists:
  if (aConfig.mReplaceWithChildrenElements.WasPassed()) {
    // Step 5.1. Let elements be « [] »
    nsTArray<CanonicalName> elements;

    // Step 5.2. For each element of
    // configuration["replaceWithChildrenElements"] do:
    for (const auto& element : aConfig.mReplaceWithChildrenElements.Value()) {
      // Step 5.2.1. Append the result of canonicalize a sanitizer element
      // element to elements.
      elements.AppendElement(CanonicalizeElement(element));
    }

    // Step 5.3. Set configuration["replaceWithChildrenElements"] to elements.
    mReplaceWithChildrenElements = Some(ListSet(std::move(elements)));
  }

  // Step 6. If configuration["attributes"] exists:
  if (aConfig.mAttributes.WasPassed()) {
    // Step 6.1. Let attributes be « [] »
    nsTArray<CanonicalName> attributes;

    // Step 6.2. For each attribute of configuration["attributes"] do:
    for (const auto& attribute : aConfig.mAttributes.Value()) {
      // Step 6.2.1. Append the result of canonicalize a sanitizer attribute
      // attribute to attributes.
      attributes.AppendElement(CanonicalizeAttribute(attribute));
    }

    // Step 6.3. Set configuration["attributes"] to attributes.
    mAttributes = Some(ListSet(std::move(attributes)));
  }

  // Step 7. If configuration["removeAttributes"] exists:
  if (aConfig.mRemoveAttributes.WasPassed()) {
    // Step 7.1. Let attributes be « [] »
    nsTArray<CanonicalName> attributes;

    // Step 7.2. For each attribute of configuration["removeAttributes"] do:
    for (const auto& attribute : aConfig.mRemoveAttributes.Value()) {
      // Step 7.2.2. Append the result of canonicalize a sanitizer attribute
      // attribute to attributes.
      attributes.AppendElement(CanonicalizeAttribute(attribute));
    }

    // Step 7.3. Set configuration["removeAttributes"] to attributes.
    mRemoveAttributes = Some(ListSet(std::move(attributes)));
  }

  // Step 8. If configuration["comments"] does not exist, then set
  // configuration["comments"] to allowCommentsAndDataAttributes.
  if (aConfig.mComments.WasPassed()) {
    // NOTE: We always need to copy this property if it exists.
    mComments = aConfig.mComments.Value();
  } else {
    mComments = aAllowCommentsAndDataAttributes;
  }

  // Step 9. If configuration["attributes"] exists and
  // configuration["dataAttributes"] does not exist, then set
  // configuration["dataAttributes"] to allowCommentsAndDataAttributes.
  if (aConfig.mDataAttributes.WasPassed()) {
    // NOTE: We always need to copy this property if it exists.
    mDataAttributes = Some(aConfig.mDataAttributes.Value());
  } else if (aConfig.mAttributes.WasPassed()) {
    mDataAttributes = Some(aAllowCommentsAndDataAttributes);
  }
}

// https://wicg.github.io/sanitizer-api/#sanitizerconfig-valid
void Sanitizer::IsValid(ErrorResult& aRv) {
  // Step 1. The config has either an elements or a removeElements key, but
  // not both.
  MOZ_ASSERT(mElements || mRemoveElements,
             "Must have either due to CanonicalizeConfiguration");
  if (mElements && mRemoveElements) {
    aRv.ThrowTypeError(
        "'elements' and 'removeElements' are not allowed at the same time");
    return;
  }

  // Step 2. The config has either an attributes or a removeAttributes key,
  // but not both.
  MOZ_ASSERT(mAttributes || mRemoveAttributes,
             "Must have either due to CanonicalizeConfiguration");
  if (mAttributes && mRemoveAttributes) {
    aRv.ThrowTypeError(
        "'attributes' and 'removeAttributes' are not allowed at the same "
        "time");
    return;
  }

  // Step 3. Assert: All SanitizerElementNamespaceWithAttributes,
  // SanitizerElementNamespace, and SanitizerAttributeNamespace items in
  // config are canonical, meaning they have been run through canonicalize a
  // sanitizer element or canonicalize a sanitizer attribute, as appropriate.

  // Step 4. None of config[elements], config[removeElements],
  // config[replaceWithChildrenElements], config[attributes], or
  // config[removeAttributes], if they exist, has duplicates.
  if (mElements && mElements->HasDuplicates()) {
    aRv.ThrowTypeError("Duplicate element in 'elements'");
    return;
  }
  if (mRemoveElements && mRemoveElements->HasDuplicates()) {
    aRv.ThrowTypeError("Duplicate element in 'removeElement'");
    return;
  }
  if (mReplaceWithChildrenElements &&
      mReplaceWithChildrenElements->HasDuplicates()) {
    aRv.ThrowTypeError("Duplicate element in 'replaceWithChildrenElements'");
    return;
  }
  if (mAttributes && mAttributes->HasDuplicates()) {
    aRv.ThrowTypeError("Duplicate attribute in 'attributes'");
    return;
  }
  if (mRemoveAttributes && mRemoveAttributes->HasDuplicates()) {
    aRv.ThrowTypeError("Duplicate attribute in 'removeAttributes'");
    return;
  }

  // Step 5. If both config[elements] and config[replaceWithChildrenElements]
  // exist, then the intersection of config[elements] and
  // config[replaceWithChildrenElements] is empty.
  if (mElements && mReplaceWithChildrenElements) {
    for (const CanonicalElementWithAttributes& name : mElements->Values()) {
      if (mReplaceWithChildrenElements->Contains(name)) {
        aRv.ThrowTypeError(
            "Element can't be in both 'elements' and "
            "'replaceWithChildrenElements'");
        return;
      }
    }
  }

  // Step 6. If both config[removeElements] and
  // config[replaceWithChildrenElements] exist, then the intersection of
  // config[removeElements] and config[replaceWithChildrenElements] is empty.
  if (mRemoveElements && mReplaceWithChildrenElements) {
    for (const CanonicalName& name : mRemoveElements->Values()) {
      if (mReplaceWithChildrenElements->Contains(name)) {
        aRv.ThrowTypeError(
            "Element can't be in both 'removeElements' and "
            "'replaceWithChildrenElements'");
        return;
      }
    }
  }

  // Step 7. If config[attributes] exists:
  if (mAttributes) {
    // Step 7.1. If config[elements] exists:
    if (mElements) {
      // Step 7.1.1 For any element in config[elements]:
      for (const CanonicalElementWithAttributes& elem : mElements->Values()) {
        // Step 7.1.1.1. Neither element[attributes] or
        // element[removeAttributes], if they exist, has duplicates.
        if (elem.mAttributes && elem.mAttributes->HasDuplicates()) {
          aRv.ThrowTypeError("Duplicate attribute in local 'attributes'");
          return;
        }
        if (elem.mRemoveAttributes && elem.mRemoveAttributes->HasDuplicates()) {
          aRv.ThrowTypeError("Duplicate attribute in local 'removeAttributes'");
          return;
        }

        // Step 7.1.1.2. The intersection of config[attributes] and
        // element[attributes] with default « [] » is empty.
        if (elem.mAttributes) {
          for (const CanonicalName& name : mAttributes->Values()) {
            if (elem.mAttributes->Contains(name)) {
              aRv.ThrowTypeError(
                  "Same attribute both in local and global 'attributes'");
              return;
            }
          }
        }

        // Step 7.1.1.3. element[removeAttributes] is a subset of
        // config[attributes].
        if (elem.mRemoveAttributes) {
          for (const CanonicalName& name : elem.mRemoveAttributes->Values()) {
            if (!mAttributes->Contains(name)) {
              aRv.ThrowTypeError(
                  "Attribute in local 'removeAttributes' but not in global "
                  "'attributes'");
              return;
            }
          }
        }

        MOZ_ASSERT(mDataAttributes.isSome(),
                   "mDataAttributes exists iff mAttributes exists");

        // Step 7.1.1.4. If dataAttributes is true:
        if (*mDataAttributes && elem.mAttributes) {
          // Step 7.1.1.4.1. element[attributes] does not contain a custom
          // data attribute.
          for (const CanonicalName& name : elem.mAttributes->Values()) {
            if (name.IsDataAttribute()) {
              aRv.ThrowTypeError(
                  "Local 'attributes' contains a data attribute, which is "
                  "redundant with 'dataAttributes' being true");
              return;
            }
          }
        }
      }
    }

    MOZ_ASSERT(mDataAttributes.isSome(),
               "mDataAttributes exists iff mAttributes exists");

    // Step 7.2. If dataAttributes is true:
    if (*mDataAttributes) {
      // Step 7.2.1. config[attributes] does not contain a custom data
      // attribute.
      for (const CanonicalName& name : mAttributes->Values()) {
        if (name.IsDataAttribute()) {
          aRv.ThrowTypeError(
              "Global 'attributes' contains a data attribute, which is "
              "redundant with 'dataAttributes' being true");
          return;
        }
      }
    }
  }

  // Step 8. If config[removeAttributes] exists:
  if (mRemoveAttributes) {
    // Step 8.1. If config[elements] exists, then for any element in
    // config[elements]:
    if (mElements) {
      for (const CanonicalElementWithAttributes& elem : mElements->Values()) {
        // Step 8.1.1. The intersection of config[removeAttributes] and
        // element[attributes] with default « [] » is empty.
        if (elem.mAttributes) {
          for (const CanonicalName& name : elem.mAttributes->Values()) {
            if (mRemoveAttributes->Contains(name)) {
              aRv.ThrowTypeError(
                  "Same attribute both in local 'attributes' and global "
                  "'removeAttributes'.");
              return;
            }
          }
        }

        // Step 8.1.2. The intersection of config[removeAttributes] and
        // element[removeAttributes] with default « [] » is empty.
        if (elem.mRemoveAttributes) {
          for (const CanonicalName& name : elem.mRemoveAttributes->Values()) {
            if (mRemoveAttributes->Contains(name)) {
              aRv.ThrowTypeError(
                  "Same attribute both in local and global "
                  "'removeAttributes'.");
              return;
            }
          }
        }
      }
    }

    // Step 8.2. config[dataAttributes] does not exist.
    if (mDataAttributes) {
      aRv.ThrowTypeError(
          "'removeAttributes' and 'dataAttributes' aren't allowed at the "
          "same time");
    }
  }
}

void Sanitizer::AssertIsValid() {
#ifdef DEBUG
  IgnoredErrorResult rv;
  IsValid(rv);
  MOZ_ASSERT(!rv.Failed());
#endif
}

// https://wicg.github.io/sanitizer-api/#sanitizer-set-a-configuration
void Sanitizer::SetConfig(const SanitizerConfig& aConfig,
                          bool aAllowCommentsAndDataAttributes,
                          ErrorResult& aRv) {
  // Step 1. Canonicalize configuration with allowCommentsAndDataAttributes.
  CanonicalizeConfiguration(aConfig, aAllowCommentsAndDataAttributes);

  // Step 2. If configuration is not valid, then return false.
  IsValid(aRv);
  if (aRv.Failed()) {
    return;
  }

  // Step 3. Set sanitizer’s configuration to configuration.
  // Note: This was already done in CanonicalizeConfiguration.
  // Step 4. Return true. (implicit)
}

// Turn the lazy default config into real lists that can be
// modified or queried via get().
void Sanitizer::MaybeMaterializeDefaultConfig() {
  if (!mIsDefaultConfig) {
    AssertIsValid();
    return;
  }

  AssertNoLists();

  nsTArray<CanonicalElementWithAttributes> elements;
  auto insertElements = [&elements](
                            mozilla::Span<nsStaticAtom* const> aElements,
                            nsStaticAtom* aNamespace,
                            nsStaticAtom* const* aElementWithAttributes) {
    size_t i = 0;
    for (nsStaticAtom* name : aElements) {
      CanonicalElementWithAttributes element(CanonicalName(name, aNamespace));

      if (name == aElementWithAttributes[i]) {
        nsTArray<CanonicalName> attributes;
        while (aElementWithAttributes[++i]) {
          attributes.AppendElement(
              CanonicalName(aElementWithAttributes[i], nullptr));
        }
        i++;
        element.mAttributes = Some(ListSet(std::move(attributes)));
      }

      elements.AppendElement(std::move(element));
    }
  };
  insertElements(Span(kDefaultHTMLElements), nsGkAtoms::nsuri_xhtml,
                 kHTMLElementWithAttributes);
  insertElements(Span(kDefaultMathMLElements), nsGkAtoms::nsuri_mathml,
                 kMathMLElementWithAttributes);
  insertElements(Span(kDefaultSVGElements), nsGkAtoms::nsuri_svg,
                 kSVGElementWithAttributes);
  mElements = Some(ListSet(std::move(elements)));

  nsTArray<CanonicalName> attributes;
  for (nsStaticAtom* name : kDefaultAttributes) {
    attributes.AppendElement(CanonicalName(name, nullptr));
  }
  mAttributes = Some(ListSet(std::move(attributes)));

  mIsDefaultConfig = false;
}

void Sanitizer::Get(SanitizerConfig& aConfig) {
  MaybeMaterializeDefaultConfig();

  if (mElements) {
    nsTArray<OwningStringOrSanitizerElementNamespaceWithAttributes> elements;
    for (const CanonicalElementWithAttributes& canonical :
         mElements->Values()) {
      elements.AppendElement()->SetAsSanitizerElementNamespaceWithAttributes() =
          canonical.ToSanitizerElementNamespaceWithAttributes();
    }
    aConfig.mElements.Construct(std::move(elements));
  } else {
    nsTArray<OwningStringOrSanitizerElementNamespace> removeElements;
    for (const CanonicalName& canonical : mRemoveElements->Values()) {
      removeElements.AppendElement()->SetAsSanitizerElementNamespace() =
          canonical.ToSanitizerElementNamespace();
    }
    aConfig.mRemoveElements.Construct(std::move(removeElements));
  }

  if (mReplaceWithChildrenElements) {
    nsTArray<OwningStringOrSanitizerElementNamespace>
        replaceWithChildrenElements;
    for (const CanonicalName& canonical :
         mReplaceWithChildrenElements->Values()) {
      replaceWithChildrenElements.AppendElement()
          ->SetAsSanitizerElementNamespace() =
          canonical.ToSanitizerElementNamespace();
    }
    aConfig.mReplaceWithChildrenElements.Construct(
        std::move(replaceWithChildrenElements));
  }

  if (mAttributes) {
    aConfig.mAttributes.Construct(ToSanitizerAttributes(*mAttributes));
  } else {
    aConfig.mRemoveAttributes.Construct(
        ToSanitizerAttributes(*mRemoveAttributes));
  }

  aConfig.mComments.Construct(mComments);
  if (mDataAttributes) {
    aConfig.mDataAttributes.Construct(*mDataAttributes);
  }
}

// https://wicg.github.io/sanitizer-api/#sanitizerconfig-allow-an-element
bool Sanitizer::AllowElement(
    const StringOrSanitizerElementNamespaceWithAttributes& aElement) {
  MaybeMaterializeDefaultConfig();

  // Step 1. Set element to the result of canonicalize a sanitizer element
  // with attributes with element.
  CanonicalElementWithAttributes element =
      CanonicalizeElementWithAttributes(aElement);

  // Step 2 If configuration["elements"] exists:
  if (mElements) {
    // Step 2.1. Set modified to the result of remove element from
    // configuration["replaceWithChildrenElements"].
    bool modified = mReplaceWithChildrenElements
                        ? mReplaceWithChildrenElements->Remove(element)
                        : false;

    // Step 2.2. Comment: We need to make sure the per-element attributes do
    // not overlap with global attributes.

    // Step 2.3. If element["attributes"] exists:
    if (element.mAttributes) {
      nsTArray<CanonicalName> attributes;
      for (const CanonicalName& attr : element.mAttributes->Values()) {
        // Step 2.3.1. Set element["attributes"] to remove duplicates from
        // element["attributes"].
        if (attributes.Contains(attr)) {
          continue;
        }

        // Step 2.3.2. If configuration["attributes"] exists:
        if (mAttributes) {
          // Step 2.3.2.1. Set element["attributes"] to the difference of
          // element["attributes"] and configuration["attributes"].
          if (mAttributes->Contains(attr)) {
            continue;
          }

          MOZ_ASSERT(mDataAttributes.isSome(),
                     "mDataAttributes exists iff mAttributes");

          // Step 2.3.2.2. If configuration["dataAttributes"] is true:
          if (*mDataAttributes) {
            // Step 2.3.2.2.1. Remove all items item from element["attributes"]
            // where item is a custom data attribute.
            if (attr.IsDataAttribute()) {
              continue;
            }
          }
        }

        // Step 2.3.3. If configuration["removeAttributes"] exists:
        if (mRemoveAttributes) {
          // Step 2.3.3.1. Set element["attributes"] to the difference of
          // element["attributes"] and configuration["removeAttributes"].
          if (mRemoveAttributes->Contains(attr)) {
            continue;
          }
        }

        attributes.AppendElement(attr.Clone());
      }
      element.mAttributes = Some(ListSet(std::move(attributes)));
    }

    // Step 2.4. If element["removeAttributes"] exists:
    if (element.mRemoveAttributes) {
      nsTArray<CanonicalName> removeAttributes;
      for (const CanonicalName& attr : element.mRemoveAttributes->Values()) {
        // Step 2.4.1. Set element["removeAttributes"] to remove duplicates from
        // element["removeAttributes"].
        if (removeAttributes.Contains(attr)) {
          continue;
        }

        // Step 2.4.2. If configuration["attributes"] exists:
        if (mAttributes) {
          // Step 2.4.2.1. Set element["removeAttributes"] to the intersection
          // of element["removeAttributes"] and configuration["attributes"].
          if (!mAttributes->Contains(attr)) {
            continue;
          }
        }

        // Step 2.4.3. If configuration["removeAttributes"] exists:
        if (mRemoveAttributes) {
          // Step 2.4.3.1. Set element["removeAttributes"] to the difference of
          // element["removeAttributes"] and configuration["removeAttributes"].
          if (mRemoveAttributes->Contains(attr)) {
            continue;
          }
        }

        removeAttributes.AppendElement(attr.Clone());
      }
      element.mRemoveAttributes = Some(ListSet(std::move(removeAttributes)));
    }

    // Step 2.5. If configuration["elements"] does not contain element:
    CanonicalElementWithAttributes* existingElement = mElements->Get(element);
    if (!existingElement) {
      // Step 2.5.1. Comment: This is the case with a global allow-list that
      // does not yet contain element.

      // Step 2.5.2. Append element to configuration["elements"].
      mElements->Insert(std::move(element));

      // Step 2.5.3. Return true.
      return true;
    }

    // Step 2.6. Comment: This is the case with a global allow-list that
    // already contains element.

    // Step 2.7. Let current element be the item in configuration["elements"]
    // where item[name] equals element[name] and item[namespace] equals
    // element[namespace]. (implict with existingElement)

    // Step 2.8. If element equals current element then return modified.
    if (element.EqualAttributes(*existingElement)) {
      return modified;
    }

    // Step 2.9. Remove element from configuration["elements"].
    mElements->Remove(element);

    // Step 2.10. Append element to configuration["elements"].
    mElements->Insert(std::move(element));

    // Step 2.11. Return true.
    return true;
  }

  // Step 3. Otherwise:
  // Step 3.1. If element["attributes"] exists or element["removeAttributes"]
  // with default « » is not empty:
  if (element.mAttributes ||
      (element.mRemoveAttributes && !element.mRemoveAttributes->IsEmpty())) {
    // Step 3.1.1. The user agent may report a warning to the console that this
    // operation is not supported.
    LogLocalizedString("SanitizerAllowElementIgnored", {},
                       nsIScriptError::warningFlag);

    // Step 3.1.2. Return false.
    return false;
  }

  // Step 3.2. Set modified to the result of remove element from
  // configuration["replaceWithChildrenElements"].
  bool modified = mReplaceWithChildrenElements
                      ? mReplaceWithChildrenElements->Remove(element)
                      : false;

  // Step 3.3. If configuration["removeElements"] does not contain element:
  if (!mRemoveElements->Contains(element)) {
    // Step 3.3.1. Comment: This is the case with a global remove-list that
    // does not contain element.

    // Step 3.3.2. Return modified.
    return modified;
  }

  // Step 3.4. Comment: This is the case with a global remove-list that
  // contains element.

  // Step 3.5. Remove element from configuration["removeElements"].
  mRemoveElements->Remove(element);

  // Step 3.6. Return true.
  return true;
}

// https://wicg.github.io/sanitizer-api/#sanitizer-remove-an-element
bool Sanitizer::RemoveElement(
    const StringOrSanitizerElementNamespace& aElement) {
  MaybeMaterializeDefaultConfig();

  // Step 1. Set element to the result of canonicalize a sanitizer element
  // with element.
  CanonicalName element = CanonicalizeElement(aElement);

  return RemoveElementCanonical(std::move(element));
}

bool Sanitizer::RemoveElementCanonical(CanonicalName&& aElement) {
  // Step 2. Set modified to the result of remove element from
  // configuration["replaceWithChildrenElements"].
  bool modified = mReplaceWithChildrenElements
                      ? mReplaceWithChildrenElements->Remove(aElement)
                      : false;

  // Step 3. If configuration["elements"] exists:
  if (mElements) {
    // Step 3.1. If configuration["elements"] contains element:
    if (mElements->Contains(aElement)) {
      // Step 3.1.1. Comment: We have a global allow list and it contains
      // element.

      // Step 3.1.2. Remove element from configuration["elements"].
      mElements->Remove(aElement);

      // Step 3.1.3. Return true.
      return true;
    }

    // Step 3.2. Comment: We have a global allow list and it does not contain
    // element.

    // Step 3.3. Return modified.
    return modified;
  }

  // Step 4. Otherwise:
  // Step 4.1. If configuration["removeElements"] contains element:
  if (mRemoveElements->Contains(aElement)) {
    // Step 4.1.1. Comment: We have a global remove list and it already
    // contains element.

    // Step 4.1.2. Return modified.
    return modified;
  }

  // Step 4.2. Comment: We have a global remove list and it does not contain
  // element.

  // Step 4.3. Add element to configuration["removeElements"].
  mRemoveElements->Insert(std::move(aElement));

  // Step 4.4. Return true.
  return true;
}

// https://wicg.github.io/sanitizer-api/#sanitizer-replace-an-element-with-its-children
bool Sanitizer::ReplaceElementWithChildren(
    const StringOrSanitizerElementNamespace& aElement) {
  MaybeMaterializeDefaultConfig();

  // Step 1. Set element to the result of canonicalize a sanitizer element
  // with element.
  CanonicalName element = CanonicalizeElement(aElement);

  // Step 2. If configuration["replaceWithChildrenElements"] contains element:
  if (mReplaceWithChildrenElements &&
      mReplaceWithChildrenElements->Contains(element)) {
    // Step 2.1. Return false.
    return false;
  }

  // Step 3. Remove element from configuration["removeElements"].
  if (mRemoveElements) {
    mRemoveElements->Remove(element);
  } else {
    // Step 4. Remove element from configuration["elements"] list.
    mElements->Remove(element);
  }

  // Step 5. Add element to configuration["replaceWithChildrenElements"].
  if (!mReplaceWithChildrenElements) {
    mReplaceWithChildrenElements.emplace();
  }
  mReplaceWithChildrenElements->Insert(std::move(element));

  // Step 6. Return true.
  return true;
}

// https://wicg.github.io/sanitizer-api/#sanitizer-allow-an-attribute
bool Sanitizer::AllowAttribute(
    const StringOrSanitizerAttributeNamespace& aAttribute) {
  MaybeMaterializeDefaultConfig();

  // Step 1. Set attribute to the result of canonicalize a sanitizer attribute
  // with attribute.
  CanonicalName attribute = CanonicalizeAttribute(aAttribute);

  // Step 2. If configuration["attributes"] exists:
  if (mAttributes) {
    // Step 2.1. Comment: If we have a global allow-list, we need to add
    // attribute.

    MOZ_ASSERT(mDataAttributes.isSome(),
               "mDataAttributes exists iff mAttributes exists");

    // Step 2.2. If configuration["dataAttributes"] is true and attribute is a
    // custom data attribute, then return false.
    if (*mDataAttributes && attribute.IsDataAttribute()) {
      return false;
    }

    // Step 2.3. If configuration["attributes"] contains attribute
    // return false.
    if (mAttributes->Contains(attribute)) {
      return false;
    }

    // Step 2.3. Comment: Fix-up per-element allow and remove lists.

    // Step 2.5. If configuration["elements"] exists:
    if (mElements) {
      // Step 2.5.1. For each element in configuration["elements"]:
      for (CanonicalElementWithAttributes& element : mElements->Values()) {
        // Step 2.5.1.1. If element["attributes"] with default « [] » contains
        // attribute:
        if (element.mAttributes && element.mAttributes->Contains(attribute)) {
          // Step 2.5.1.1.1. Remove attribute from element["attributes"].
          element.mAttributes->Remove(attribute);
        }

        // Step 2.5.1.2. Assert: element["removeAttributes"] with default « []
        // » does not contain attribute.
        MOZ_ASSERT_IF(element.mRemoveAttributes,
                      !element.mRemoveAttributes->Contains(attribute));
      }
    }

    // Step 2.6. Append attribute to configuration["attributes"]
    mAttributes->Insert(std::move(attribute));

    // Step 2.7. Return true.
    return true;
  }

  // Step 3. Otherwise:

  // Step 3.1. Comment: If we have a global remove-list, we need to remove
  // attribute.

  // Step 3.2. If configuration["removeAttributes"] does not contain
  // attribute:
  if (!mRemoveAttributes->Contains(attribute)) {
    // Step 3.2.1. Return false.
    return false;
  }

  // Step 3.3. Remove attribute from configuration["removeAttributes"].
  mRemoveAttributes->Remove(attribute);

  // Step 3.4. Return true.
  return true;
}

// https://wicg.github.io/sanitizer-api/#sanitizer-remove-an-attribute
bool Sanitizer::RemoveAttribute(
    const StringOrSanitizerAttributeNamespace& aAttribute) {
  MaybeMaterializeDefaultConfig();

  // Step 1. Set attribute to the result of canonicalize a sanitizer attribute
  // with attribute.
  CanonicalName attribute = CanonicalizeAttribute(aAttribute);

  return RemoveAttributeCanonical(std::move(attribute));
}

bool Sanitizer::RemoveAttributeCanonical(CanonicalName&& aAttribute) {
  // Step 2. If configuration["attributes"] exists:
  if (mAttributes) {
    // Step 2.1. Comment: If we have a global allow-list, we need to add
    // attribute.

    // Step 2.2. If configuration["attributes"] does not contain attribute:
    if (!mAttributes->Contains(aAttribute)) {
      // Step 2.2.1. Return false.
      return false;
    }

    // Step 2.3. Comment: Fix-up per-element allow and remove lists.

    // Step 2.4. If configuration["elements"] exists:
    if (mElements) {
      // Step 2.4.1. For each element in configuration["elements"]:
      for (CanonicalElementWithAttributes& element : mElements->Values()) {
        // Step 2.4.1.1. If element["removeAttributes"] with default « [] »
        // contains attribute:
        if (element.mRemoveAttributes &&
            element.mRemoveAttributes->Contains(aAttribute)) {
          // Step 2.4.1.1.1. Remove attribute from
          // element["removeAttributes"].
          element.mRemoveAttributes->Remove(aAttribute);
        }
      }
    }

    // Step 2.5. Remove attribute from configuration["attributes"].
    mAttributes->Remove(aAttribute);

    // Step 2.6. Return true.
    return true;
  }

  // Step 3. Otherwise:
  // Step 3.1. Comment: If we have a global remove-list, we need to add
  // attribute.

  // Step 3.2. If configuration["removeAttributes"] contains attribute return
  // false.
  if (mRemoveAttributes->Contains(aAttribute)) {
    return false;
  }

  // Step 3.3. Comment: Fix-up per-element allow and remove lists.
  // Step 3.4. If configuration["elements"] exists:
  if (mElements) {
    // Step 3.4.1. For each element in configuration["elements"]:
    for (CanonicalElementWithAttributes& element : mElements->Values()) {
      // Step 3.4.1.1. If element["attributes"] with default « [] » contains
      // attribute:
      if (element.mAttributes && element.mAttributes->Contains(aAttribute)) {
        // Step 3.4.1.1.1. Remove attribute from element["attributes"].
        element.mAttributes->Remove(aAttribute);
      }

      // Step 3.4.1.2. If element["removeAttributes"] with default « [] »
      // contains attribute:
      if (element.mRemoveAttributes &&
          element.mRemoveAttributes->Contains(aAttribute)) {
        // Step 3.4.1.2.1. Remove attribute from element["removeAttributes"].
        element.mRemoveAttributes->Remove(aAttribute);
      }
    }
  }

  // Step 3.5. Append attribute to configuration["removeAttributes"].
  mRemoveAttributes->Insert(std::move(aAttribute));

  // Step 3.6. Return true.
  return true;
}

// https://wicg.github.io/sanitizer-api/#sanitizer-set-comments
bool Sanitizer::SetComments(bool aAllow) {
  // The sanitize algorithm optimized for the default config supports
  // comments both being allowed and disallowed.

  // Step 1. If configuration["comments"] exists and configuration["comments"]
  // equals allow, then return false;
  if (mComments == aAllow) {
    return false;
  }

  // Step 2. Set configuration["comments"] to allow.
  mComments = aAllow;

  // Step 3. Return true.
  return true;
}

// https://wicg.github.io/sanitizer-api/#sanitizer-set-data-attributes
bool Sanitizer::SetDataAttributes(bool aAllow) {
  // Same as above for data-attributes.

  // Step 1. If configuration["attributes"] does not exist, then return false.
  // Note: The default config has "attributes".
  if (!mIsDefaultConfig && !mAttributes) {
    return false;
  }

  MOZ_ASSERT(mDataAttributes.isSome(),
             "mDataAttributes exists iff mAttributes exists (or in the default "
             "config)");

  // Step 2. If configuration["dataAttributes"] equals allow, then return false.
  if (*mDataAttributes == aAllow) {
    return false;
  }

  // Step 3. If allow is true:
  if (!mIsDefaultConfig && aAllow) {
    // Note: The default config does not contain any data-attributes.

    // Step 3.1. Remove any items attr from configuration["attributes"] where
    // attr is a custom data attribute.
    mAttributes->Values().RemoveElementsBy([](const CanonicalName& aAttribute) {
      return aAttribute.IsDataAttribute();
    });

    // Step 3.2. If configuration["elements"] exists:
    if (mElements) {
      // Step 3.2.1. For each element in configuration["elements"]:
      for (CanonicalElementWithAttributes& element : mElements->Values()) {
        // Step 3.2.1.1. If element[attributes] exists:
        if (element.mAttributes) {
          // Step 3.2.1.1.1. Remove any items attr from element[attributes]
          // where attr is a custom data attribute.
          element.mAttributes->Values().RemoveElementsBy(
              [](const CanonicalName& aAttribute) {
                return aAttribute.IsDataAttribute();
              });
        }
      }
    }
  }

  // Step 4. Set configuration["dataAttributes"] to allow.
  mDataAttributes = Some(aAllow);

  // Step 5. Return true.
  return true;
}

// https://wicg.github.io/sanitizer-api/#built-in-safe-baseline-configuration
// The built-in safe baseline configuration
#define FOR_EACH_BASELINE_REMOVE_ELEMENT(ELEMENT) \
  ELEMENT(XHTML, xhtml, script)                   \
  ELEMENT(XHTML, xhtml, frame)                    \
  ELEMENT(XHTML, xhtml, iframe)                   \
  ELEMENT(XHTML, xhtml, object)                   \
  ELEMENT(XHTML, xhtml, embed)                    \
  ELEMENT(SVG, svg, script)                       \
  ELEMENT(SVG, svg, use)

// https://wicg.github.io/sanitizer-api/#sanitizerconfig-remove-unsafe
bool Sanitizer::RemoveUnsafe() {
  // XXX this should be a no-op for the default config now.
  MaybeMaterializeDefaultConfig();

  // Step 1. Assert: The key set of built-in safe baseline configuration equals
  // «[ "removeElements", "removeAttributes" ] ».

  // Step 2. Let result be false.
  bool result = false;

  // Step 3. For each element in built-in safe baseline
  // configuration[removeElements]:
#define ELEMENT(_, NSURI, LOCAL_NAME)                                        \
  /* Step 3.1. Call remove an element element from configuration. */         \
  if (RemoveElementCanonical(                                                \
          CanonicalName(nsGkAtoms::LOCAL_NAME, nsGkAtoms::nsuri_##NSURI))) { \
    /* Step 3.2. If the call returned true, set result to true. */           \
    result = true;                                                           \
  }

  FOR_EACH_BASELINE_REMOVE_ELEMENT(ELEMENT)

#undef ELEMENT

  // Step 4. For each attribute in built-in safe baseline
  // configuration[removeAttributes]:
  // (This is an empty list)

  // Step 5. For each attribute listed in event handler content attributes:
  // TODO: Consider sorting these.
  nsContentUtils::ForEachEventAttributeName(
      EventNameType_All & ~EventNameType_XUL,
      [self = MOZ_KnownLive(this), &result](nsAtom* aName) {
        // Step 5.1. Call remove an attribute attribute from configuration.
        if (self->RemoveAttributeCanonical(CanonicalName(aName, nullptr))) {
          // Step 5.2. If the call returned true, set result to true.
          result = true;
        }
      });

  // Step 6. Return result.
  return result;
}

// https://wicg.github.io/sanitizer-api/#sanitize
void Sanitizer::Sanitize(nsINode* aNode, bool aSafe, ErrorResult& aRv) {
  MOZ_ASSERT(aNode->OwnerDoc()->IsLoadedAsData(),
             "SanitizeChildren relies on the document being inert to be safe");

  // Step 1. Let configuration be the value of sanitizer’s configuration.

  // Step 2. If safe is true, then set configuration to the result of calling
  // remove unsafe on configuration.
  //
  // Optimization: We really don't want to make a copy of the configuration
  // here, so we instead explictly remove the handful elements and
  // attributes that are part of "remove unsafe" in the
  // SanitizeChildren() and SanitizeAttributes() methods.

  // Step 3. Call sanitize core on node, configuration, and with
  // handleJavascriptNavigationUrls set to safe.
  if (mIsDefaultConfig) {
    AssertNoLists();
    SanitizeChildren<true>(aNode, aSafe);
  } else {
    AssertIsValid();
    SanitizeChildren<false>(aNode, aSafe);
  }
}

static RefPtr<nsAtom> ToNamespace(int32_t aNamespaceID) {
  if (aNamespaceID == kNameSpaceID_None) {
    return nullptr;
  }

  RefPtr<nsAtom> atom =
      nsNameSpaceManager::GetInstance()->NameSpaceURIAtom(aNamespaceID);
  return atom;
}

static bool IsUnsafeElement(nsAtom* aLocalName, int32_t aNamespaceID) {
#define ELEMENT(NSID, _, LOCAL_NAME)           \
  if (aNamespaceID == kNameSpaceID_##NSID) {   \
    if (aLocalName == nsGkAtoms::LOCAL_NAME) { \
      return true;                             \
    }                                          \
  }

  FOR_EACH_BASELINE_REMOVE_ELEMENT(ELEMENT)

#undef ELEMENT

  return false;
}

// https://wicg.github.io/sanitizer-api/#sanitize-core
template <bool IsDefaultConfig>
void Sanitizer::SanitizeChildren(nsINode* aNode, bool aSafe) {
  // Step 1. For each child in current’s children:
  nsCOMPtr<nsIContent> next = nullptr;
  for (nsCOMPtr<nsIContent> child = aNode->GetFirstChild(); child;
       child = next) {
    next = child->GetNextSibling();

    // Step 1.1. Assert: child implements Text, Comment, Element, or
    // DocumentType.
    MOZ_ASSERT(child->IsText() || child->IsComment() || child->IsElement() ||
               child->NodeType() == nsINode::DOCUMENT_TYPE_NODE);

    // Step 1.2. If child implements DocumentType, then continue.
    if (child->NodeType() == nsINode::DOCUMENT_TYPE_NODE) {
      continue;
    }

    // Step 1.3. If child implements Text, then continue.
    if (child->IsText()) {
      continue;
    }

    // Step 1.4. If child implements Comment:
    if (child->IsComment()) {
      // Step 1.4.1 If configuration["comments"] is not true, then remove
      // child.
      if (!mComments) {
        child->RemoveFromParent();
      }
      continue;
    }

    // Step 1.5. Otherwise:
    MOZ_ASSERT(child->IsElement());

    // Step 1.5.1. Let elementName be a SanitizerElementNamespace with child’s
    // local name and namespace.
    nsAtom* nameAtom = child->NodeInfo()->NameAtom();
    int32_t namespaceID = child->NodeInfo()->NamespaceID();
    // Make sure this is optimized away when using the default config.
    Maybe<CanonicalName> elementName;
    // This is only used for the default config case.
    [[maybe_unused]] StaticAtomSet* elementAttributes = nullptr;
    if constexpr (!IsDefaultConfig) {
      elementName.emplace(nameAtom, ToNamespace(namespaceID));

      // Optimization: Remove unsafe elements before doing anything else.
      // https://wicg.github.io/sanitizer-api/#built-in-safe-baseline-configuration
      //
      // We have to do this _before_ handling the
      // "replaceWithChildrenElements" list, because the "remove an element"
      // call in removeUnsafe() would implicitly remove it from the list.
      //
      // The default config's "elements" allow list does not contain any
      // unsafe elements so we can skip this.
      if (aSafe && IsUnsafeElement(nameAtom, namespaceID)) {
        child->RemoveFromParent();
        continue;
      }

      // Step 1.5.2. If configuration["replaceWithChildrenElements"] exists
      // and if configuration["replaceWithChildrenElements"] contains
      // elementName:
      if (mReplaceWithChildrenElements &&
          mReplaceWithChildrenElements->Contains(*elementName)) {
        // Note: This follows nsTreeSanitizer by first inserting the
        // child's children in place of the current child and then
        // continueing the sanitization from the first inserted grandchild.
        nsCOMPtr<nsIContent> parent = child->GetParent();
        nsCOMPtr<nsIContent> firstChild = child->GetFirstChild();
        nsCOMPtr<nsIContent> newChild = firstChild;
        for (; newChild; newChild = child->GetFirstChild()) {
          ErrorResult rv;
          parent->InsertBefore(*newChild, child, rv);
          if (rv.Failed()) {
            // TODO: Abort?
            break;
          }
        }

        child->RemoveFromParent();
        if (firstChild) {
          next = firstChild;
        }
        continue;
      }

      // Step 1.5.3. If configuration["removeElements"] exists and
      // configuration["removeElements"] contains elementName:
      if (mRemoveElements) {
        if (mRemoveElements->Contains(*elementName)) {
          // Step 1.5.3.1. Remove child.
          child->RemoveFromParent();
          // Step 1.5.3.2.Continue.
          continue;
        }
      }

      // Step 1.5.4. If configuration["elements"] exists and
      // configuration["elements"] does not contain elementName:
      if (mElements) {
        if (!mElements->Contains(*elementName)) {
          // Step 1.5.4.1. Remove child.
          child->RemoveFromParent();
          // Step 1.5.4.2. Continue.
          continue;
        }
      }
    } else {
      // (The default config has no replaceWithChildrenElements or
      // removeElements)

      // Step 1.5.4. If configuration["elements"] exists and
      // configuration["elements"] does not contain elementName:

      bool found = false;
      if (nameAtom->IsStatic()) {
        ElementsWithAttributes* elements = nullptr;
        if (namespaceID == kNameSpaceID_XHTML) {
          elements = sDefaultHTMLElements;
        } else if (namespaceID == kNameSpaceID_MathML) {
          elements = sDefaultMathMLElements;
        } else if (namespaceID == kNameSpaceID_SVG) {
          elements = sDefaultSVGElements;
        }
        if (elements) {
          if (auto lookup = elements->Lookup(nameAtom->AsStatic())) {
            found = true;
            // This is the nullptr for elements without specific allowed
            // attributes.
            elementAttributes = lookup->get();
          }
        }
      }
      if (!found) {
        // Step 1.5.4.1. Remove child.
        child->RemoveFromParent();
        // Step 1.5.4.2. Continue.
        continue;
      }

      MOZ_ASSERT(!IsUnsafeElement(nameAtom, namespaceID),
                 "The default config has no unsafe elements");
    }

    // Step 1.5.5. If elementName equals «[ "name" → "template", "namespace" →
    // HTML namespace ]», then call sanitize core on child’s template contents
    // with configuration and handleJavascriptNavigationUrls.
    if (auto* templateEl = HTMLTemplateElement::FromNode(child)) {
      RefPtr<DocumentFragment> frag = templateEl->Content();
      SanitizeChildren<IsDefaultConfig>(frag, aSafe);
    }

    // Step 1.5.6. If child is a shadow host, then call sanitize core on child’s
    // shadow root with configuration and handleJavascriptNavigationUrls.
    if (RefPtr<ShadowRoot> shadow = child->GetShadowRoot()) {
      SanitizeChildren<IsDefaultConfig>(shadow, aSafe);
    }

    // Step 1.5.7-9.
    if constexpr (!IsDefaultConfig) {
      SanitizeAttributes(child->AsElement(), *elementName, aSafe);
    } else {
      SanitizeDefaultConfigAttributes(child->AsElement(), elementAttributes,
                                      aSafe);
    }

    // Step 1.5.10. Call sanitize core on child with configuration and
    // handleJavascriptNavigationUrls.
    // TODO: Optimization: Remove recusion similar to nsTreeSanitizer
    SanitizeChildren<IsDefaultConfig>(child, aSafe);
  }
}

static inline bool IsDataAttribute(nsAtom* aName, int32_t aNamespaceID) {
  return StringBeginsWith(nsDependentAtomString(aName), u"data-"_ns) &&
         aNamespaceID == kNameSpaceID_None;
}

// https://wicg.github.io/sanitizer-api/#sanitize-core
// Step 2.4.9.5. If handleJavascriptNavigationUrls:
static bool RemoveJavascriptNavigationURLAttribute(Element* aElement,
                                                   nsAtom* aLocalName,
                                                   int32_t aNamespaceID) {
  // https://wicg.github.io/sanitizer-api/#contains-a-javascript-url
  auto containsJavascriptURL = [&]() {
    nsAutoString value;
    if (!aElement->GetAttr(aNamespaceID, aLocalName, value)) {
      return false;
    }

    // Step 1. Let url be the result of running the basic URL parser on
    // attribute’s value.
    nsCOMPtr<nsIURI> uri;
    if (NS_FAILED(NS_NewURI(getter_AddRefs(uri), value))) {
      // Step 2. If url is failure, then return false.
      return false;
    }

    // Step 3. Return whether url’s scheme is "javascript".
    return uri->SchemeIs("javascript");
  };

  // Step 1. If «[elementName, attrName]» matches an entry in the built-in
  // navigating URL attributes list, and if attribute contains a javascript:
  // URL, then remove attribute from child.
  if ((aElement->IsAnyOfHTMLElements(nsGkAtoms::a, nsGkAtoms::area,
                                     nsGkAtoms::base) &&
       aLocalName == nsGkAtoms::href && aNamespaceID == kNameSpaceID_None) ||
      (aElement->IsAnyOfHTMLElements(nsGkAtoms::button, nsGkAtoms::input) &&
       aLocalName == nsGkAtoms::formaction &&
       aNamespaceID == kNameSpaceID_None) ||
      (aElement->IsHTMLElement(nsGkAtoms::form) &&
       aLocalName == nsGkAtoms::action && aNamespaceID == kNameSpaceID_None) ||
      (aElement->IsHTMLElement(nsGkAtoms::iframe) &&
       aLocalName == nsGkAtoms::src && aNamespaceID == kNameSpaceID_None) ||
      (aElement->IsSVGElement(nsGkAtoms::a) && aLocalName == nsGkAtoms::href &&
       (aNamespaceID == kNameSpaceID_None ||
        aNamespaceID == kNameSpaceID_XLink))) {
    if (containsJavascriptURL()) {
      return true;
    }
  };

  // Step 2. If child’s namespace is the MathML Namespace and attr’s local
  // name is "href" and attr’s namespace is null or the XLink namespace and
  // attr contains a javascript: URL, then remove attr.
  if (aElement->IsMathMLElement() && aLocalName == nsGkAtoms::href &&
      (aNamespaceID == kNameSpaceID_None ||
       aNamespaceID == kNameSpaceID_XLink)) {
    if (containsJavascriptURL()) {
      return true;
    }
  }

  // Step 3. If the built-in animating URL attributes list contains
  // «[elementName, attrName]» and attr’s value is "href" or "xlink:href",
  // then remove attr.
  if (aLocalName == nsGkAtoms::attributeName &&
      aNamespaceID == kNameSpaceID_None &&
      aElement->IsAnyOfSVGElements(nsGkAtoms::animate, nsGkAtoms::animateMotion,
                                   nsGkAtoms::animateTransform,
                                   nsGkAtoms::set)) {
    nsAutoString value;
    if (!aElement->GetAttr(aNamespaceID, aLocalName, value)) {
      return false;
    }

    return value.EqualsLiteral("href") || value.EqualsLiteral("xlink:href");
  }

  return false;
}

void Sanitizer::SanitizeAttributes(Element* aChild,
                                   const CanonicalName& aElementName,
                                   bool aSafe) {
  MOZ_ASSERT(!mIsDefaultConfig);

  // https://wicg.github.io/sanitizer-api/#sanitize-core
  // Substeps of 1.5. that are relevant to attributes.

  // Step 7. Let elementWithLocalAttributes be « [] ».
  // Step 8. If configuration["elements"] exists and configuration["elements"]
  // contains elementName: Step 8.1. Set elementWithLocalAttributes to
  // configuration["elements"][elementName].
  const CanonicalElementWithAttributes* elementWithAttributes =
      mElements ? mElements->Get(aElementName) : nullptr;

  // Step 9. For each attribute in child’s attribute list:
  int32_t count = int32_t(aChild->GetAttrCount());
  for (int32_t i = count - 1; i >= 0; --i) {
    // Step 9.1. Let attrName be a SanitizerAttributeNamespace with attribute’s
    // local name and namespace.
    const nsAttrName* attr = aChild->GetAttrNameAt(i);
    RefPtr<nsAtom> attrLocalName = attr->LocalName();
    int32_t attrNs = attr->NamespaceID();
    CanonicalName attrName(attrLocalName, ToNamespace(attrNs));

    bool remove = false;
    // Optimization: Remove unsafe event handler content attributes.
    // https://wicg.github.io/sanitizer-api/#sanitizerconfig-remove-unsafe
    if (aSafe && attrNs == kNameSpaceID_None &&
        nsContentUtils::IsEventAttributeName(
            attrLocalName, EventNameType_All & ~EventNameType_XUL)) {
      remove = true;
    }

    // Step 9.2. If elementWithLocalAttributes["removeAttributes"] with default
    // « [] » contains attrName:
    else if (elementWithAttributes &&
             elementWithAttributes->mRemoveAttributes &&
             elementWithAttributes->mRemoveAttributes->Contains(attrName)) {
      // Step 9.2.1. Remove attribute.
      remove = true;
    }

    // Step 9.3. Otherwise, if configuration["attributes"] exists:
    else if (mAttributes) {
      // Step 9.3.1. If configuration["attributes"] does not contain attrName
      // and elementWithLocalAttributes["attributes"] with default « [] » does
      // not contain attrName, and if "data-" is not a code unit prefix of
      // attribute’s local name and namespace is not null or
      // configuration["dataAttributes"] is not true:
      MOZ_ASSERT(mDataAttributes.isSome(),
                 "mDataAttributes exists iff mAttributes exists");
      if (!mAttributes->Contains(attrName) &&
          !(elementWithAttributes && elementWithAttributes->mAttributes &&
            elementWithAttributes->mAttributes->Contains(attrName)) &&
          !(*mDataAttributes && IsDataAttribute(attrLocalName, attrNs))) {
        // Step 9.3.1.1. Remove attribute.
        remove = true;
      }
    }

    // Step 9.4. Otherwise:
    else {
      // Step 9.4.1. If elementWithLocalAttributes["attributes"] exists and
      // elementWithLocalAttributes["attributes"] does not contain attrName:
      if (elementWithAttributes && elementWithAttributes->mAttributes &&
          !elementWithAttributes->mAttributes->Contains(attrName)) {
        // Step 9.4.1.1. Remove attribute.
        remove = true;
      }

      // Step 9.4.2. Otherwise, if configuration["removeAttributes"] contains
      // attrName:
      else if (mRemoveAttributes->Contains(attrName)) {
        // Step 9.4.2.1. Remove attribute.
        remove = true;
      }
    }

    // Step 5. If handleJavascriptNavigationUrls:
    if (aSafe && !remove) {
      remove =
          RemoveJavascriptNavigationURLAttribute(aChild, attrLocalName, attrNs);
    }

    if (remove) {
      aChild->UnsetAttr(attr->NamespaceID(), attr->LocalName(), false);

      // XXX Copied from nsTreeSanitizer.
      // In case the attribute removal shuffled the attribute order, start the
      // loop again.
      --count;
      i = count;  // i will be decremented immediately thanks to the for loop
    }
  }
}

void Sanitizer::SanitizeDefaultConfigAttributes(
    Element* aChild, StaticAtomSet* aElementAttributes, bool aSafe) {
  MOZ_ASSERT(mIsDefaultConfig);

  // https://wicg.github.io/sanitizer-api/#sanitize-core
  // Substeps of 1.5. that are relevant to attributes.

  // Step 7-8. (aElementAttributes passed as an argument)

  // Step 9. For each attribute in child’s attribute list:
  int32_t count = int32_t(aChild->GetAttrCount());
  for (int32_t i = count - 1; i >= 0; --i) {
    // Step 1. Let attrName be a SanitizerAttributeNamespace with attribute’s
    // local name and namespace.
    const nsAttrName* attr = aChild->GetAttrNameAt(i);
    RefPtr<nsAtom> attrLocalName = attr->LocalName();
    int32_t attrNs = attr->NamespaceID();

    // Step 2. If elementWithLocalAttributes["removeAttributes"] with default «
    // [] » contains attrName:
    // (No local removeAttributes in the default config)

    // Step 3. Otherwise, if configuration["attributes"] exists:
    // Step 3.1. If configuration["attributes"] does not contain attrName and
    // elementWithLocalAttributes["attributes"] with default « [] » does not
    // contain attrName, and if "data-" is not a code unit prefix of attribute’s
    // local name and namespace is not null or configuration["dataAttributes"]
    // is not true:
    bool remove = false;
    // Note: All attributes allowed by the default config are in the "null"
    // namespace.
    MOZ_ASSERT(mDataAttributes.isSome(),
               "mDataAttributes always exists in the default config");
    if (attrNs != kNameSpaceID_None ||
        (!sDefaultAttributes->Contains(attrLocalName) &&
         !(aElementAttributes && aElementAttributes->Contains(attrLocalName)) &&
         !(*mDataAttributes && IsDataAttribute(attrLocalName, attrNs)))) {
      // Step 3.1.1. Remove attribute.
      remove = true;
    }

    // Step 4. Otherwise:
    // (not applicable)

    // Step 5. If handleJavascriptNavigationUrls:
    else if (aSafe) {
      // TODO: This could be further optimized, because the default config
      // at the moment only allows <a href>.
      remove =
          RemoveJavascriptNavigationURLAttribute(aChild, attrLocalName, attrNs);
    }

    // The default config attribute allow lists don't contain event
    // handler attributes.
    MOZ_ASSERT_IF(!remove,
                  !nsContentUtils::IsEventAttributeName(
                      attrLocalName, EventNameType_All & ~EventNameType_XUL));

    if (remove) {
      aChild->UnsetAttr(attr->NamespaceID(), attr->LocalName(), false);

      // XXX Copied from nsTreeSanitizer.
      // In case the attribute removal shuffled the attribute order, start the
      // loop again.
      --count;
      i = count;  // i will be decremented immediately thanks to the for loop
    }
  }
}

/* ------ Logging ------ */

void Sanitizer::LogLocalizedString(const char* aName,
                                   const nsTArray<nsString>& aParams,
                                   uint32_t aFlags) {
  uint64_t innerWindowID = 0;
  bool isPrivateBrowsing = true;
  nsCOMPtr<nsPIDOMWindowInner> window = do_QueryInterface(mGlobal);
  if (window && window->GetDoc()) {
    auto* doc = window->GetDoc();
    innerWindowID = doc->InnerWindowID();
    isPrivateBrowsing = doc->IsInPrivateBrowsing();
  }
  nsAutoString logMsg;
  nsContentUtils::FormatLocalizedString(nsContentUtils::eSECURITY_PROPERTIES,
                                        aName, aParams, logMsg);
  LogMessage(logMsg, aFlags, innerWindowID, isPrivateBrowsing);
}

/* static */
void Sanitizer::LogMessage(const nsAString& aMessage, uint32_t aFlags,
                           uint64_t aInnerWindowID, bool aFromPrivateWindow) {
  // Prepending 'Sanitizer' to the outgoing console message
  nsString message;
  message.AppendLiteral(u"Sanitizer: ");
  message.Append(aMessage);

  // Allow for easy distinction in devtools code.
  constexpr auto category = "Sanitizer"_ns;

  if (aInnerWindowID > 0) {
    // Send to content console
    nsContentUtils::ReportToConsoleByWindowID(message, aFlags, category,
                                              aInnerWindowID);
  } else {
    // Send to browser console
    nsContentUtils::LogSimpleConsoleError(message, category, aFromPrivateWindow,
                                          true /* from chrome context */,
                                          aFlags);
  }
}

}  // namespace mozilla::dom
