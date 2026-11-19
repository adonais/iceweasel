/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PrintTarget.h"

#include "mozilla/gfx/2D.h"
#include "mozilla/gfx/Logging.h"
#include "nsReadableUtils.h"
#include "nsString.h"
#include "nsUTF8Utils.h"

// IPP spec disallow the job-name which is over 255 characters.
// RFC: https://tools.ietf.org/html/rfc2911#section-4.1.2
#define IPP_JOB_NAME_LIMIT_LENGTH 255

namespace mozilla::gfx {

/* static */
void PrintTarget::AdjustPrintJobNameForIPP(const nsAString& aJobName,
                                           nsCString& aAdjustedJobName) {
  CopyUTF16toUTF8(aJobName, aAdjustedJobName);

  if (aAdjustedJobName.Length() > IPP_JOB_NAME_LIMIT_LENGTH) {
    uint32_t length = RewindToPriorUTF8Codepoint(
        aAdjustedJobName.get(), (IPP_JOB_NAME_LIMIT_LENGTH - 3U));
    aAdjustedJobName.SetLength(length);
    aAdjustedJobName.AppendLiteral("...");
  }
}

/* static */
void PrintTarget::AdjustPrintJobNameForIPP(const nsAString& aJobName,
                                           nsString& aAdjustedJobName) {
  nsAutoCString jobName;
  AdjustPrintJobNameForIPP(aJobName, jobName);

  CopyUTF8toUTF16(jobName, aAdjustedJobName);
}

/* static */
already_AddRefed<DrawTarget> PrintTarget::CreateRecordingDrawTarget(
    DrawEventRecorder* aRecorder, DrawTarget* aDrawTarget) {
  MOZ_ASSERT(aRecorder);
  MOZ_ASSERT(aDrawTarget);

  RefPtr<DrawTarget> dt;

  if (aRecorder) {
    // It doesn't really matter what we pass as the DrawTarget here.
    dt = gfx::Factory::CreateRecordingDrawTarget(aRecorder, aDrawTarget,
                                                 aDrawTarget->GetRect());
  }

  if (!dt || !dt->IsValid()) {
    gfxCriticalNote
        << "Failed to create a recording DrawTarget for PrintTarget";
    return nullptr;
  }

  return dt.forget();
}

}  // namespace mozilla::gfx
