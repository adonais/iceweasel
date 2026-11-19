/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsFunctionInterfaceUtils.h"

NS_IMPL_NAMED_ADDREF(nsFunctionInterfaceBase, mName.get())
NS_IMPL_NAMED_RELEASE(nsFunctionInterfaceBase, mName.get())
NS_IMPL_QUERY_INTERFACE(nsFunctionInterfaceBase, nsINamed)

NS_IMETHODIMP nsFunctionInterfaceBase::GetName(nsACString& aName) {
  aName = mName;
  return NS_OK;
}
