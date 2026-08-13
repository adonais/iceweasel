/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Compatibility macros for SLOTHY AES-GCM assembly files.
 * Replaces openssl/asm_base.h and openssl/arm_arch.h from aws-lc. */

#ifndef AARCH64_GCM_ASM_COMPAT_H
#define AARCH64_GCM_ASM_COMPAT_H

/* ARMv8 crypto extensions are required */
#ifndef __ARM_MAX_ARCH__
#define __ARM_MAX_ARCH__ 8
#endif

/* BTI (Branch Target Identification) - Armv8.5-A */
#if defined(__ARM_FEATURE_BTI_DEFAULT) && __ARM_FEATURE_BTI_DEFAULT == 1
#define AARCH64_VALID_CALL_TARGET hint #34
#else
#define AARCH64_VALID_CALL_TARGET
#endif

/* PAC (Pointer Authentication Code) - Armv8.3-A */
#if defined(__ARM_FEATURE_PAC_DEFAULT)
#if ((__ARM_FEATURE_PAC_DEFAULT & 1) != 0) /* A-key */
#define AARCH64_SIGN_LINK_REGISTER paciasp
#define AARCH64_VALIDATE_LINK_REGISTER autiasp
#elif ((__ARM_FEATURE_PAC_DEFAULT & 2) != 0) /* B-key */
#define AARCH64_SIGN_LINK_REGISTER pacibsp
#define AARCH64_VALIDATE_LINK_REGISTER autibsp
#else
#define AARCH64_SIGN_LINK_REGISTER
#define AARCH64_VALIDATE_LINK_REGISTER
#endif
#else
#define AARCH64_SIGN_LINK_REGISTER
#define AARCH64_VALIDATE_LINK_REGISTER
#endif

/* Mark ELF object files as not needing executable stack */
#if defined(__ELF__)
// clang-format off
.pushsection .note.GNU-stack,"",%progbits
.popsection
// clang-format on
#endif

#endif /* AARCH64_GCM_ASM_COMPAT_H */
