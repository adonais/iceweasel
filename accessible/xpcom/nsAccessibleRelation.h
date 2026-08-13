/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsAccessibleRelation_H_
#define _nsAccessibleRelation_H_

#include "mozilla/a11y/RemoteAccessible.h"
#include "nsCOMPtr.h"
#include "nsIAccessibleRelation.h"
#include "nsIMutableArray.h"
#include "nsTArray.h"

namespace mozilla {
namespace a11y {

class Relation;

/**
 * Class represents an accessible relation.
 */
class nsAccessibleRelation final : public nsIAccessibleRelation {
 public:
  nsAccessibleRelation(uint32_t aType, Relation* aRel);

  nsAccessibleRelation() = delete;
  nsAccessibleRelation(const nsAccessibleRelation&) = delete;
  nsAccessibleRelation& operator=(const nsAccessibleRelation&) = delete;

  NS_DECL_ISUPPORTS
  NS_DECL_NSIACCESSIBLERELATION

 private:
  ~nsAccessibleRelation();

  uint32_t mType;
  nsCOMPtr<nsIMutableArray> mTargets;
};

}  // namespace a11y
}  // namespace mozilla

#endif
