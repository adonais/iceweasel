/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_MaybeFmt_h
#define mozilla_MaybeFmt_h

#include "mozilla/Maybe.h"

#include <fmt/base.h>

template <typename T, typename Char>
struct fmt::formatter<mozilla::Maybe<T>, Char> {
 private:
  fmt::formatter<T, Char> mInner;

 public:
  template <typename ParseContext>
  FMT_CONSTEXPR auto parse(ParseContext& ctx) {
    return mInner.parse(ctx);
  }

  template <typename FormatContext>
  decltype(auto) format(const mozilla::Maybe<T>& aMaybe,
                        FormatContext& ctx) const {
    if (aMaybe.isNothing()) {
      return fmt::formatter<fmt::string_view, Char>{}.format("<Nothing>", ctx);
    }
    return mInner.format(*aMaybe, ctx);
  }
};

#endif /* mozilla_MaybeFmt_h */
