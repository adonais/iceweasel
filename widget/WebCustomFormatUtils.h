/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef WIDGET_WEBCUSTOMFORMATUTILS_H
#define WIDGET_WEBCUSTOMFORMATUTILS_H

#include "nsString.h"
#include "nsTHashMap.h"

namespace mozilla::widget {

using WebCustomFormatMap = nsTHashMap<nsCStringHashKey, nsCString>;

void WebCustomFormatMapToJSON(const WebCustomFormatMap& aMap,
                              nsACString& aResult);

bool JSONToWebCustomFormatMap(const nsACString& aJSON,
                              WebCustomFormatMap& aResult);

}  // namespace mozilla::widget

#endif
