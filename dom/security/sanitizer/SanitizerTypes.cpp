/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SanitizerTypes.h"

namespace mozilla::dom::sanitizer {

bool CanonicalName::IsDataAttribute() const {
  return StringBeginsWith(nsDependentAtomString(mLocalName), u"data-"_ns) &&
         !mNamespace;
}

SanitizerAttributeNamespace CanonicalName::ToSanitizerAttributeNamespace()
    const {
  SanitizerAttributeNamespace result;
  mLocalName->ToString(result.mName);
  if (mNamespace) {
    mNamespace->ToString(result.mNamespace);
  } else {
    result.mNamespace.SetIsVoid(true);
  }
  return result;
}

SanitizerElementNamespaceWithAttributes
CanonicalElementWithAttributes::ToSanitizerElementNamespaceWithAttributes()
    const {
  SanitizerElementNamespaceWithAttributes result;
  mLocalName->ToString(result.mName);
  if (mNamespace) {
    mNamespace->ToString(result.mNamespace);
  } else {
    result.mNamespace.SetIsVoid(true);
  }
  if (mAttributes) {
    result.mAttributes.Construct(ToSanitizerAttributes(*mAttributes));
  }
  if (mRemoveAttributes) {
    result.mRemoveAttributes.Construct(
        ToSanitizerAttributes(*mRemoveAttributes));
  }
  return result;
}

SanitizerElementNamespace CanonicalName::ToSanitizerElementNamespace() const {
  SanitizerElementNamespace result;
  mLocalName->ToString(result.mName);
  if (mNamespace) {
    mNamespace->ToString(result.mNamespace);
  } else {
    result.mNamespace.SetIsVoid(true);
  }
  return result;
}

// TODO(bug 1989215): This is obviously quadratic. Fix this!
template <typename ValueType>
bool ListSet<ValueType>::HasDuplicates() const {
  for (size_t i = 0; i + 1 < mValues.Length(); i++) {
    if (mValues.IndexOf(mValues[i], i + 1) != mValues.NoIndex) {
      return true;
    }
  }
  return false;
}

template class ListSet<CanonicalName>;
template class ListSet<CanonicalElementWithAttributes>;

bool CanonicalElementWithAttributes::EqualAttributes(
    const CanonicalElementWithAttributes& aOther) const {
  MOZ_ASSERT(*this == aOther);

  if (mAttributes.isSome() != aOther.mAttributes.isSome() ||
      mRemoveAttributes.isSome() != aOther.mRemoveAttributes.isSome()) {
    return false;
  }

  if (mAttributes) {
    if (mAttributes->Values() != aOther.mAttributes->Values()) {
      return false;
    }
  }

  if (mRemoveAttributes) {
    if (mRemoveAttributes->Values() != aOther.mRemoveAttributes->Values()) {
      return false;
    }
  }

  return true;
}

CanonicalElementWithAttributes CanonicalElementWithAttributes::Clone() const {
  CanonicalElementWithAttributes elem(CanonicalName::Clone());

  if (mAttributes) {
    nsTArray<CanonicalName> attributes;
    for (const auto& attr : mAttributes->Values()) {
      attributes.AppendElement(attr.Clone());
    }
    elem.mAttributes = Some(ListSet(std::move(attributes)));
  }

  if (mRemoveAttributes) {
    nsTArray<CanonicalName> attributes;
    for (const auto& attr : mRemoveAttributes->Values()) {
      attributes.AppendElement(attr.Clone());
    }
    elem.mRemoveAttributes = Some(ListSet(std::move(attributes)));
  }

  return elem;
}

nsTArray<OwningStringOrSanitizerAttributeNamespace> ToSanitizerAttributes(
    const ListSet<CanonicalName>& aList) {
  nsTArray<OwningStringOrSanitizerAttributeNamespace> attributes;
  for (const CanonicalName& canonical : aList.Values()) {
    attributes.AppendElement()->SetAsSanitizerAttributeNamespace() =
        canonical.ToSanitizerAttributeNamespace();
  }
  return attributes;
}

}  // namespace mozilla::dom::sanitizer
