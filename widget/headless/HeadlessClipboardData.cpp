/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "HeadlessClipboardData.h"

namespace mozilla::widget {

void HeadlessClipboardData::SetText(const nsAString& aText) {
  mPlain = aText;
  mChangeCount++;
}

bool HeadlessClipboardData::HasText() const { return !mPlain.IsVoid(); }

const nsAString& HeadlessClipboardData::GetText() const { return mPlain; }

void HeadlessClipboardData::SetHTML(const nsAString& aHTML) {
  mHTML = aHTML;
  mChangeCount++;
}

bool HeadlessClipboardData::HasHTML() const { return !mHTML.IsVoid(); }

const nsAString& HeadlessClipboardData::GetHTML() const { return mHTML; }

void HeadlessClipboardData::SetPNG(nsTArray<uint8_t>&& aPNG) {
  mPNG = std::move(aPNG);
  mChangeCount++;
}

bool HeadlessClipboardData::HasPNG() const { return !mPNG.IsEmpty(); }

const nsTArray<uint8_t>& HeadlessClipboardData::GetPNG() const { return mPNG; }

int32_t HeadlessClipboardData::GetChangeCount() const { return mChangeCount; }

void HeadlessClipboardData::Clear() {
  mPlain.SetIsVoid(true);
  mHTML.SetIsVoid(true);
  mPNG.Clear();
  mChangeCount++;
}

}  // namespace mozilla::widget
