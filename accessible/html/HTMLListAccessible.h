/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_a11y_HTMLListAccessible_h_
#define mozilla_a11y_HTMLListAccessible_h_

#include "BaseAccessibles.h"
#include "HyperTextAccessible.h"
#include "TextLeafAccessible.h"

namespace mozilla {
namespace a11y {

class HTMLListBulletAccessible;

/**
 * Used for HTML list (like HTML ul).
 */
class HTMLListAccessible : public HyperTextAccessible {
 public:
  HTMLListAccessible(nsIContent* aContent, DocAccessible* aDoc)
      : HyperTextAccessible(aContent, aDoc) {
    mGenericTypes |= eList;
  }

  // nsISupports
  NS_INLINE_DECL_REFCOUNTING_INHERITED(HTMLListAccessible, HyperTextAccessible)

  // LocalAccessible
  virtual a11y::role NativeRole() const override;
  virtual uint64_t NativeState() const override;

 protected:
  virtual ~HTMLListAccessible() = default;
};

/**
 * Used for HTML list item (e.g. HTML li).
 */
class HTMLLIAccessible : public HyperTextAccessible {
 public:
  HTMLLIAccessible(nsIContent* aContent, DocAccessible* aDoc);

  // nsISupports
  NS_INLINE_DECL_REFCOUNTING_INHERITED(HTMLLIAccessible, HyperTextAccessible)

  // LocalAccessible
  virtual nsRect BoundsInAppUnits() const override;
  virtual a11y::role NativeRole() const override;
  virtual uint64_t NativeState() const override;

  // HTMLLIAccessible
  LocalAccessible* Bullet() const;

 protected:
  virtual ~HTMLLIAccessible() = default;
};

/**
 * Used for bullet of HTML list item element (for example, HTML li).
 */
class HTMLListBulletAccessible : public TextLeafAccessible {
 public:
  HTMLListBulletAccessible(nsIContent* aContent, DocAccessible* aDoc)
      : TextLeafAccessible(aContent, aDoc) {
    mType = eHTMLListBulletType;
  }
  virtual ~HTMLListBulletAccessible() = default;

  // LocalAccessible
  virtual a11y::role NativeRole() const override;
  virtual uint64_t NativeState() const override;
  virtual already_AddRefed<AccAttributes> NativeAttributes() override;
  virtual bool IsAcceptableChild(nsIContent* aEl) const override {
    // The ::marker's children are never exposed.
    return false;
  }

  /**
   * Compute the text for the bullet of the given ::marker element. This uses
   * CSS alt content if there is any. Otherwise, it uses layout. This is used
   * both when creating the bullet and when updating its text.
   */
  static void ComputeText(nsIContent* aMarker, nsAString& aText);
};

inline HTMLLIAccessible* LocalAccessible::AsHTMLListItem() {
  return IsHTMLListItem() ? static_cast<HTMLLIAccessible*>(this) : nullptr;
}

}  // namespace a11y
}  // namespace mozilla

#endif
