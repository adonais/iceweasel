/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* AArch64 platform AES-GCM wrapper.
 *
 * Bulk full-block AES-CTR + GHASH is performed by the SLOTHY-optimized
 * kernels from aws-lc.
 *
 * GHASH state (H-table init, AAD hashing, partial-block handling, IV
 * derivation when ivLen != 12, length-block, tag finalization) is delegated
 * to the freebl gcmHashContext, which on AArch64 uses ghash-aarch64.c
 * (PMULL with the vrbit convention). The SLOTHY kernel uses a different
 * H-representation internally but reads/writes the running tag via memory
 * in plain GCM big-endian byte order; we bridge by extracting the
 * gcmHashContext's running X to GCM-BE bytes before invoking the kernel
 * and writing the kernel's updated X back into the gcmHashContext.
 *
 * The SLOTHY kernel needs its own H-power table in the OpenSSL/aws-lc
 * "twisted, byte-reversed" layout. We compute it via gcm_init_v8 (PMULL)
 * intrinsics directly from H = E(K, 0).
 */

#ifdef FREEBL_NO_DEPEND
#include "stubs.h"
#endif

#include "blapii.h"
#include "blapit.h"
#include "gcm.h"
#include "platform-gcm.h"
#include "secerr.h"
#include "prtypes.h"
#include "pkcs11t.h"

#include <limits.h>
#include <stddef.h>
#include <string.h>

#include "rijndael.h"
#include "aarch64-gcm-slothy.h"

#include <arm_neon.h>

/**************************************************************************
 * Platform GCM context
 **************************************************************************/

struct platform_AES_GCMContextStr {
    /* GHASH state. */
    gcmHashContext *ghash_context;

    /* Precomputed H-power table for SLOTHY full-block kernels. */
    unsigned char Htbl[12 * AES_BLOCK_SIZE];

    /* E(K, J0) for tag finalization. */
    unsigned char tagKey[AES_BLOCK_SIZE];

    /* Current AES-CTR counter block. */
    unsigned char CTR[AES_BLOCK_SIZE];

    AESContext *aes_context;
    unsigned long tagBits;
    freeblCipherFunc cipher;
    PRBool ctr_context_init;
    gcmIVContext gcm_iv;
};

/* The GCM spec caps plaintext at (2^39 - 256) bits, i.e. (2^32 - 2) AES blocks
 * = ~64 GiB. Our inlen is unsigned int (32 bits = ~4 GiB max), so it cannot
 * reach that limit. If inlen is ever widened, restore an explicit length check
 * here. */
PR_STATIC_ASSERT(sizeof(unsigned int) <= 4);

/**************************************************************************
 **************************************************************************
 *
 * Internal helpers
 *
 **************************************************************************
 **************************************************************************/

/**************************************************************************
 * Bridging gcmHashContext <-> SLOTHY kernel running tag.
 *
 * The kernel's load_tag macro reads the tag from memory and applies vrev64
 * (byte-swap within each 64-bit half) to obtain its internal compute form,
 * and at the end of the kernel applies vrev64 + store. So the in-memory
 * tag format is just plain GCM big-endian bytes.
 *
 * gcmHashContext in the AArch64 hardware path stores X as vrbit(GCM-BE).
 * platform_gcm_support() requires PMULL, so gcmHash_InitContext always
 * selects the hardware path here (ghash->hw); we assert it rather than
 * carrying a software fallback.
 **************************************************************************/

static void
ghash_extract_X(const gcmHashContext *ghash, unsigned char T_be[16])
{
    PORT_Assert(ghash->hw);
    uint8x16_t ci = vrbitq_u8(vreinterpretq_u8_u64(ghash->x));
    vst1q_u8(T_be, ci);
}

static void
ghash_set_X(gcmHashContext *ghash, const unsigned char T_be[16])
{
    PORT_Assert(ghash->hw);
    ghash->x = vreinterpretq_u64_u8(vrbitq_u8(vld1q_u8(T_be)));
}

/**************************************************************************
 * H-table for the SLOTHY kernels (OpenSSL twisted-byte-reversed layout).
 *
 * Translation of openssl/aws-lc gcm_init_v8 to NEON intrinsics, then the
 * SLOTHY-specific Karatsuba mid pair packing.
 **************************************************************************/

static inline uint8x16_t
gcm_pmull_mul_compute(uint8x16_t A_c, uint8x16_t B_c)
{
    const uint64x2_t xC2_64 = vshlq_n_u64(vdupq_n_u64(0xe1), 57);

    poly64x2_t A_p = vreinterpretq_p64_u8(A_c);
    poly64x2_t B_p = vreinterpretq_p64_u8(B_c);

    uint64x2_t A_64 = vreinterpretq_u64_u8(A_c);
    uint64x2_t B_64 = vreinterpretq_u64_u8(B_c);
    poly64_t A_mid = (poly64_t)(vgetq_lane_u64(A_64, 0) ^ vgetq_lane_u64(A_64, 1));
    poly64_t B_mid = (poly64_t)(vgetq_lane_u64(B_64, 0) ^ vgetq_lane_u64(B_64, 1));

    uint8x16_t Xl = vreinterpretq_u8_p128(
        vmull_p64((poly64_t)vgetq_lane_u64(A_64, 0),
                  (poly64_t)vgetq_lane_u64(B_64, 0)));
    uint8x16_t Xh = vreinterpretq_u8_p128(vmull_high_p64(A_p, B_p));
    uint8x16_t Xm = vreinterpretq_u8_p128(vmull_p64(A_mid, B_mid));

    uint8x16_t t1 = vextq_u8(Xl, Xh, 8);
    uint8x16_t t2 = veorq_u8(Xl, Xh);
    Xm = veorq_u8(Xm, t1);
    Xm = veorq_u8(Xm, t2);

    t2 = vreinterpretq_u8_p128(vmull_p64(
        (poly64_t)vgetq_lane_u64(vreinterpretq_u64_u8(Xl), 0),
        (poly64_t)vgetq_lane_u64(xC2_64, 0)));

    uint64x2_t Xh_64 = vreinterpretq_u64_u8(Xh);
    uint64x2_t Xm_64 = vreinterpretq_u64_u8(Xm);
    uint64x2_t Xl_64 = vreinterpretq_u64_u8(Xl);

    Xh_64 = vsetq_lane_u64(vgetq_lane_u64(Xm_64, 1), Xh_64, 0);
    Xm_64 = vsetq_lane_u64(vgetq_lane_u64(Xl_64, 0), Xm_64, 1);

    Xh = vreinterpretq_u8_u64(Xh_64);
    Xl = veorq_u8(vreinterpretq_u8_u64(Xm_64), t2);

    t2 = vextq_u8(Xl, Xl, 8);
    Xl = vreinterpretq_u8_p128(vmull_p64(
        (poly64_t)vgetq_lane_u64(vreinterpretq_u64_u8(Xl), 0),
        (poly64_t)vgetq_lane_u64(xC2_64, 0)));
    t2 = veorq_u8(t2, Xh);

    return veorq_u8(Xl, t2);
}

static uint8x16_t
gcm_init_h1(const unsigned char H_be[16])
{
    /* Upstream gcm_init_v8 takes u64 H[2] where each u64 was loaded big-endian
     * from the GCM-BE H bytes (CRYPTO_load_u64_be). On little-endian aarch64,
     * that means the bytes of each 8-byte half are reversed in the NEON
     * register compared to a plain vld1q_u8 of H_be. Match that. */
    uint8x16_t t1 = vrev64q_u8(vld1q_u8(H_be));
    uint64x2_t xC2_64 = vshlq_n_u64(vdupq_n_u64(0xe1), 57);
    uint8x16_t xC2 = vreinterpretq_u8_u64(xC2_64);

    uint8x16_t IN = vextq_u8(t1, t1, 8);

    uint8x16_t t2 = vreinterpretq_u8_u64(vshrq_n_u64(xC2_64, 63));

    uint32x4_t t1_dup = vdupq_laneq_u32(vreinterpretq_u32_u8(t1), 1);
    uint8x16_t t1_carry = vreinterpretq_u8_s32(
        vshrq_n_s32(vreinterpretq_s32_u32(t1_dup), 31));

    uint8x16_t t0 = vextq_u8(t2, xC2, 8);

    t2 = vreinterpretq_u8_u64(vshrq_n_u64(vreinterpretq_u64_u8(IN), 63));
    t2 = vandq_u8(t2, t0);

    IN = vreinterpretq_u8_u64(vshlq_n_u64(vreinterpretq_u64_u8(IN), 1));
    t2 = vextq_u8(t2, t2, 8);
    t0 = vandq_u8(t0, t1_carry);
    IN = vorrq_u8(IN, t2);

    uint8x16_t H_compute = veorq_u8(IN, t0);

    return vextq_u8(H_compute, H_compute, 8);
}

static inline uint8x16_t
gcm_mul_stored(uint8x16_t A_stored, uint8x16_t B_stored)
{
    uint8x16_t A_c = vextq_u8(A_stored, A_stored, 8);
    uint8x16_t B_c = vextq_u8(B_stored, B_stored, 8);
    uint8x16_t result_c = gcm_pmull_mul_compute(A_c, B_c);
    return vextq_u8(result_c, result_c, 8);
}

static inline uint8x16_t
karatsuba_mid_pair(uint8x16_t H_odd_stored, uint8x16_t H_even_stored)
{
    uint64x2_t odd = vreinterpretq_u64_u8(H_odd_stored);
    uint64x2_t even = vreinterpretq_u64_u8(H_even_stored);
    uint64_t mid_odd = vgetq_lane_u64(odd, 0) ^ vgetq_lane_u64(odd, 1);
    uint64_t mid_even = vgetq_lane_u64(even, 0) ^ vgetq_lane_u64(even, 1);
    return vreinterpretq_u8_u64(vcombine_u64(vcreate_u64(mid_odd),
                                             vcreate_u64(mid_even)));
}

static void
gcm_init_htable(unsigned char Htable[12 * 16], const unsigned char H_be[16])
{
    uint8x16_t Hpow[8];
    Hpow[0] = gcm_init_h1(H_be);
    for (unsigned int k = 1; k < 8; k++) {
        Hpow[k] = gcm_mul_stored(Hpow[k - 1], Hpow[0]);
    }

    for (unsigned int g = 0; g < 4; g++) {
        unsigned int odd = 2 * g;
        unsigned int even = odd + 1;
        unsigned char *p = Htable + (size_t)(3 * g) * 16;
        vst1q_u8(p + 0, Hpow[odd]);
        vst1q_u8(p + 16, karatsuba_mid_pair(Hpow[odd], Hpow[even]));
        vst1q_u8(p + 32, Hpow[even]);
    }
    PORT_SafeZero(Hpow, sizeof(Hpow));
}

/**************************************************************************
 * SLOTHY kernel dispatch
 **************************************************************************/

typedef void (*aarch64_gcm_kernel_t)(const uint8_t *in, uint64_t in_bits,
                                     void *out, void *Xi,
                                     uint8_t *ivec, const void *key,
                                     const void *Htable);

typedef enum {
    AES_GCM_ENCRYPT = 0,
    AES_GCM_DECRYPT = 1
} aes_gcm_direction;

static aarch64_gcm_kernel_t
get_kernel(aes_gcm_direction dir, unsigned int Nr)
{
    static const aarch64_gcm_kernel_t table[2][3] = {
        { aes_gcm_enc_kernel_slothy_base_128,
          aes_gcm_enc_kernel_slothy_base_192,
          aes_gcm_enc_kernel_slothy_base_256 },
        { aes_gcm_dec_kernel_slothy_base_128,
          aes_gcm_dec_kernel_slothy_base_192,
          aes_gcm_dec_kernel_slothy_base_256 },
    };
    unsigned int idx;
    switch (Nr) {
        case 10:
            idx = 0;
            break;
        case 12:
            idx = 1;
            break;
        case 14:
            idx = 2;
            break;
        default:
            return NULL;
    }
    return table[dir][idx];
}

/**************************************************************************
 * Counter and single-block AES helpers
 **************************************************************************/

static void
ctr_inc(unsigned char CTR[AES_BLOCK_SIZE])
{
    for (int i = 15; i >= 12 && ++CTR[i] == 0; i--) {
    }
}

/* Encrypt a single AES block in place using the ARMv8 AES instructions and the
 * expanded round-key schedule (the same key layout the SLOTHY kernels and
 * aes-armv8.c consume). platform_gcm_support() guarantees AES instruction
 * availability, so we encrypt the block with the intrinsics directly rather
 * than paying an indirect call through the generic cipher for one block. This
 * is on the per-message path (tag key, partial-block keystream). */
static inline uint8x16_t
aes_encrypt_block_neon(const AESContext *aes, uint8x16_t state)
{
    const PRUint8 *rk = (const PRUint8 *)aes->k.expandedKey;
    unsigned int nr = aes->Nr;
    unsigned int r;

    for (r = 0; r < nr - 1; r++) {
        state = vaesmcq_u8(vaeseq_u8(state, vld1q_u8(rk + 16 * r)));
    }
    state = vaeseq_u8(state, vld1q_u8(rk + 16 * (nr - 1)));
    return veorq_u8(state, vld1q_u8(rk + 16 * nr));
}

static inline unsigned int
gcm_tag_bytes(const platform_AES_GCMContext *gcm)
{
    return (unsigned int)((gcm->tagBits + (PR_BITS_PER_BYTE - 1)) / PR_BITS_PER_BYTE);
}

/**************************************************************************
 * Payload processing (full-block kernel + partial-block fallback)
 **************************************************************************/

/* Run the SLOTHY full-block AES-CTR + GHASH kernel.
 *
 * The kernel reads the running tag X from memory (plain GCM-BE byte order),
 * processes fullLen bytes (= fullLen*8 bits, a whole number of 16-bytes blocks),
 * updates X to include GHASH over the ciphertext, and writes X back to the
 * same memory. We bridge to gcmHashContext via ghash_extract_X / ghash_set_X.
 *
 * Precondition: ghash_context->bufLen == 0. After gcmHash_Reset(...AAD), the
 * AAD is zero-padded and absorbed by gcmHash_Sync, leaving bufLen == 0. The
 * platform Update functions are one-shot (a single call covers the entire
 * payload and writes the tag), so this invariant always holds. */
static SECStatus
run_slothy_kernel(platform_AES_GCMContext *gcm,
                  aarch64_gcm_kernel_t kernel,
                  const unsigned char *inbuf, unsigned char *outbuf,
                  unsigned int fullLen)
{
    unsigned char T_be[AES_BLOCK_SIZE];
    PORT_Assert(gcm->ghash_context->bufLen == 0);
    if (gcm->ghash_context->bufLen != 0) {
        return SECFailure;
    }
    ghash_extract_X(gcm->ghash_context, T_be);
    kernel(inbuf, (uint64_t)fullLen * 8, outbuf, T_be,
           gcm->CTR, gcm->aes_context, gcm->Htbl);
    ghash_set_X(gcm->ghash_context, T_be);
    /* The kernel processed fullLen bytes of GHASH input; cLen counts bits
     * and is consumed by gcmHash_Sync to build the GCM length block. */
    gcm->ghash_context->cLen += (uint64_t)fullLen * PR_BITS_PER_BYTE;
    PORT_SafeZero(T_be, sizeof(T_be));
    return SECSuccess;
}

/* Encrypt or decrypt a single partial (<16-byte) block. The only direction-
 * specific behavior is whether GHASH absorbs the input (decrypt) or output
 * (encrypt) ciphertext. */
static SECStatus
xcrypt_partial(platform_AES_GCMContext *gcm, aes_gcm_direction dir,
               unsigned char *outbuf, const unsigned char *inbuf,
               unsigned int remLen)
{
    unsigned char keystream[AES_BLOCK_SIZE];
    SECStatus rv = SECSuccess;

    if (dir == AES_GCM_DECRYPT) {
        rv = gcmHash_Update(gcm->ghash_context, inbuf, remLen);
        if (rv != SECSuccess) {
            return SECFailure;
        }
    }
    vst1q_u8(keystream,
             aes_encrypt_block_neon(gcm->aes_context, vld1q_u8(gcm->CTR)));
    for (unsigned int j = 0; j < remLen; j++) {
        outbuf[j] = inbuf[j] ^ keystream[j];
    }
    if (dir == AES_GCM_ENCRYPT) {
        rv = gcmHash_Update(gcm->ghash_context, outbuf, remLen);
    }
    ctr_inc(gcm->CTR);

    PORT_SafeZero(keystream, AES_BLOCK_SIZE);
    return rv;
}

/* Process a full payload: SLOTHY kernel for whole blocks + one final partial
 * block. Direction selects the kernel and the partial-block helper. */
static SECStatus
process_payload(platform_AES_GCMContext *gcm, aes_gcm_direction dir,
                unsigned char *outbuf, const unsigned char *inbuf,
                unsigned int inlen)
{
    unsigned int fullLen = inlen & ~0xfu;
    unsigned int remLen = inlen & 0xf;
    SECStatus rv;

    if (fullLen > 0) {
        aarch64_gcm_kernel_t kernel = get_kernel(dir, gcm->aes_context->Nr);
        if (kernel == NULL) {
            PORT_SetError(SEC_ERROR_LIBRARY_FAILURE);
            return SECFailure;
        }
        rv = run_slothy_kernel(gcm, kernel, inbuf, outbuf, fullLen);
        if (rv != SECSuccess) {
            return SECFailure;
        }
    }

    if (remLen > 0) {
        rv = xcrypt_partial(gcm, dir, outbuf + fullLen, inbuf + fullLen, remLen);
        if (rv != SECSuccess) {
            return SECFailure;
        }
    }

    return SECSuccess;
}

/**************************************************************************
 * Tag finalization and verification
 **************************************************************************/

static SECStatus
finalize_tag(platform_AES_GCMContext *gcm, unsigned char tag_out[AES_BLOCK_SIZE])
{
    unsigned int outlen;
    SECStatus rv;

    rv = gcmHash_Final(gcm->ghash_context, tag_out, &outlen, AES_BLOCK_SIZE);
    if (rv != SECSuccess) {
        return SECFailure;
    }
    /* tag = GHASH ^ E(K, J0); one AES block is exactly one NEON vector. */
    vst1q_u8(tag_out, veorq_u8(vld1q_u8(tag_out), vld1q_u8(gcm->tagKey)));
    return SECSuccess;
}

/* Compute the tag and write the leading tagBytes to tag_out, wiping the
 * full 16-byte tag from the stack before returning. */
static SECStatus
finalize_and_emit_tag(platform_AES_GCMContext *gcm,
                      unsigned char *tag_out, unsigned int tagBytes)
{
    unsigned char T[AES_BLOCK_SIZE];
    SECStatus rv = finalize_tag(gcm, T);
    if (rv == SECSuccess) {
        PORT_Memcpy(tag_out, T, tagBytes);
    }
    PORT_SafeZero(T, AES_BLOCK_SIZE);
    return rv;
}

/* Compute the tag, compare it to intag in constant time, and on mismatch wipe
 * the plaintext and signal SEC_ERROR_BAD_DATA. On success sets *outlen. */
static SECStatus
verify_and_emit(platform_AES_GCMContext *gcm,
                const unsigned char *intag, unsigned int tagBytes,
                unsigned char *outbuf, unsigned int inlen, unsigned int *outlen)
{
    unsigned char T[AES_BLOCK_SIZE];
    SECStatus rv = finalize_tag(gcm, T);
    if (rv != SECSuccess) {
        PORT_SafeZero(outbuf, inlen);
        *outlen = 0;
        PORT_SafeZero(T, AES_BLOCK_SIZE);
        return SECFailure;
    }
    if (NSS_SecureMemcmp(T, intag, tagBytes) != 0) {
        PORT_SafeZero(outbuf, inlen);
        *outlen = 0;
        PORT_SetError(SEC_ERROR_BAD_DATA);
        PORT_SafeZero(T, AES_BLOCK_SIZE);
        return SECFailure;
    }
    *outlen = inlen;
    PORT_SafeZero(T, AES_BLOCK_SIZE);
    return SECSuccess;
}

/* Shared param/state validation for the AEAD entry points. */
static SECStatus
aead_validate_params(const platform_AES_GCMContext *gcm,
                     unsigned int paramLen, unsigned int maxout,
                     unsigned int inlen, unsigned int *outlen)
{
    if (paramLen != sizeof(CK_GCM_MESSAGE_PARAMS)) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }
    if (gcm->ctr_context_init) {
        PORT_SetError(SEC_ERROR_LIBRARY_FAILURE);
        return SECFailure;
    }
    if (maxout < inlen) {
        *outlen = inlen;
        PORT_SetError(SEC_ERROR_OUTPUT_LEN);
        return SECFailure;
    }
    return SECSuccess;
}

/**************************************************************************
 **************************************************************************
 *
 * Platform API
 *
 **************************************************************************
 **************************************************************************/

PRBool
platform_gcm_support(void)
{
    return arm_aes_support() && arm_pmull_support();
}

SECStatus
platform_aes_gcmInitCounter(platform_AES_GCMContext *gcm,
                            const unsigned char *iv, unsigned long ivLen,
                            unsigned long tagBits,
                            const unsigned char *aad, unsigned long aadLen);

platform_AES_GCMContext *
platform_AES_GCM_CreateContext(void *context,
                               freeblCipherFunc cipher,
                               const unsigned char *params)
{
    platform_AES_GCMContext *gcm = NULL;
    AESContext *aes = (AESContext *)context;
    const CK_NSS_GCM_PARAMS *gcmParams = (const CK_NSS_GCM_PARAMS *)params;
    unsigned char H[AES_BLOCK_SIZE];
    SECStatus rv;

    gcm = PORT_ZNew(platform_AES_GCMContext);
    if (gcm == NULL) {
        return NULL;
    }

    gcm->aes_context = aes;
    gcm->cipher = cipher;
    gcm->ctr_context_init = PR_FALSE;

    gcm->ghash_context = PORT_ZNewAligned(gcmHashContext, 16, mem);
    if (gcm->ghash_context == NULL) {
        PORT_Free(gcm);
        return NULL;
    }

    /* H = E(K, 0^128) */
    vst1q_u8(H, aes_encrypt_block_neon(aes, vdupq_n_u8(0)));

    /* Init both the gcmHashContext (for GHASH operations) and the SLOTHY
     * kernels' H-power table. */
    rv = gcmHash_InitContext(gcm->ghash_context, H, PR_FALSE);
    if (rv != SECSuccess) {
        goto loser;
    }
    gcm_init_htable(gcm->Htbl, H);
    PORT_SafeZero(H, AES_BLOCK_SIZE);

    gcm_InitIVContext(&gcm->gcm_iv);

    if (gcmParams == NULL) {
        return gcm;
    }

    rv = platform_aes_gcmInitCounter(gcm, gcmParams->pIv,
                                     gcmParams->ulIvLen, gcmParams->ulTagBits,
                                     gcmParams->pAAD, gcmParams->ulAADLen);
    if (rv != SECSuccess) {
        goto loser;
    }
    gcm->ctr_context_init = PR_TRUE;

    return gcm;

loser:
    PORT_SafeZero(H, AES_BLOCK_SIZE);
    platform_AES_GCM_DestroyContext(gcm, PR_TRUE);
    return NULL;
}

SECStatus
platform_aes_gcmInitCounter(platform_AES_GCMContext *gcm,
                            const unsigned char *iv, unsigned long ivLen,
                            unsigned long tagBits,
                            const unsigned char *aad, unsigned long aadLen)
{
    unsigned int j;
    SECStatus rv;

    if (ivLen == 0) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }

    if (tagBits != 128 && tagBits != 120 && tagBits != 112 &&
        tagBits != 104 && tagBits != 96 && tagBits != 64 &&
        tagBits != 32) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }
    gcm->tagBits = tagBits;

    if (ivLen == 12) {
        PORT_Memcpy(gcm->CTR, iv, 12);
        gcm->CTR[12] = 0;
        gcm->CTR[13] = 0;
        gcm->CTR[14] = 0;
        gcm->CTR[15] = 1;
    } else {
        /* J0 = GHASH(IV || pad || len_block) */
        rv = gcmHash_Reset(gcm->ghash_context, NULL, 0);
        if (rv != SECSuccess) {
            return SECFailure;
        }
        rv = gcmHash_Update(gcm->ghash_context, iv, (unsigned int)ivLen);
        if (rv != SECSuccess) {
            return SECFailure;
        }
        rv = gcmHash_Final(gcm->ghash_context, gcm->CTR, &j, AES_BLOCK_SIZE);
        if (rv != SECSuccess) {
            return SECFailure;
        }
    }

    /* tagKey = E(K, J0) */
    vst1q_u8(gcm->tagKey,
             aes_encrypt_block_neon(gcm->aes_context, vld1q_u8(gcm->CTR)));

    ctr_inc(gcm->CTR);

    /* Reset GHASH and feed AAD. */
    rv = gcmHash_Reset(gcm->ghash_context, aad, (unsigned int)aadLen);
    if (rv != SECSuccess) {
        return SECFailure;
    }

    return SECSuccess;
}

void
platform_AES_GCM_DestroyContext(platform_AES_GCMContext *gcm, PRBool freeit)
{
    if (gcm->ghash_context) {
        void *mem = gcm->ghash_context->mem;
        PORT_SafeZero(gcm->ghash_context, sizeof(gcmHashContext));
        PORT_Free(mem);
        gcm->ghash_context = NULL;
    }
    PORT_SafeZero(gcm, sizeof(platform_AES_GCMContext));
    if (freeit) {
        PORT_Free(gcm);
    }
}

SECStatus
platform_AES_GCM_EncryptUpdate(platform_AES_GCMContext *gcm,
                               unsigned char *outbuf,
                               unsigned int *outlen, unsigned int maxout,
                               const unsigned char *inbuf, unsigned int inlen,
                               unsigned int blocksize)
{
    unsigned int tagBytes;
    SECStatus rv;

    if (!gcm->ctr_context_init) {
        PORT_SetError(SEC_ERROR_NOT_INITIALIZED);
        return SECFailure;
    }

    tagBytes = gcm_tag_bytes(gcm);
    if (UINT_MAX - inlen < tagBytes) {
        PORT_SetError(SEC_ERROR_INPUT_LEN);
        return SECFailure;
    }
    if (maxout < inlen + tagBytes) {
        *outlen = inlen + tagBytes;
        PORT_SetError(SEC_ERROR_OUTPUT_LEN);
        return SECFailure;
    }

    rv = process_payload(gcm, AES_GCM_ENCRYPT, outbuf, inbuf, inlen);
    if (rv != SECSuccess) {
        return SECFailure;
    }

    rv = finalize_and_emit_tag(gcm, outbuf + inlen, tagBytes);
    if (rv != SECSuccess) {
        return SECFailure;
    }
    *outlen = inlen + tagBytes;
    return SECSuccess;
}

SECStatus
platform_AES_GCM_DecryptUpdate(platform_AES_GCMContext *gcm,
                               unsigned char *outbuf,
                               unsigned int *outlen, unsigned int maxout,
                               const unsigned char *inbuf, unsigned int inlen,
                               unsigned int blocksize)
{
    unsigned int tagBytes;
    const unsigned char *intag;
    SECStatus rv;

    if (!gcm->ctr_context_init) {
        PORT_SetError(SEC_ERROR_NOT_INITIALIZED);
        return SECFailure;
    }

    tagBytes = gcm_tag_bytes(gcm);
    if (inlen < tagBytes) {
        PORT_SetError(SEC_ERROR_INPUT_LEN);
        return SECFailure;
    }
    inlen -= tagBytes;
    intag = inbuf + inlen;

    if (maxout < inlen) {
        *outlen = inlen;
        PORT_SetError(SEC_ERROR_OUTPUT_LEN);
        return SECFailure;
    }

    rv = process_payload(gcm, AES_GCM_DECRYPT, outbuf, inbuf, inlen);
    if (rv != SECSuccess) {
        PORT_SafeZero(outbuf, inlen);
        *outlen = 0;
        return SECFailure;
    }

    return verify_and_emit(gcm, intag, tagBytes, outbuf, inlen, outlen);
}

SECStatus
platform_AES_GCM_EncryptAEAD(platform_AES_GCMContext *gcm,
                             unsigned char *outbuf,
                             unsigned int *outlen, unsigned int maxout,
                             const unsigned char *inbuf, unsigned int inlen,
                             void *params, unsigned int paramLen,
                             const unsigned char *aad, unsigned int aadLen,
                             unsigned int blocksize)
{
    unsigned int tagBytes;
    const CK_GCM_MESSAGE_PARAMS *gcmParams =
        (const CK_GCM_MESSAGE_PARAMS *)params;
    SECStatus rv;

    rv = aead_validate_params(gcm, paramLen, maxout, inlen, outlen);
    if (rv != SECSuccess) {
        return SECFailure;
    }

    rv = gcm_GenerateIV(&gcm->gcm_iv, gcmParams->pIv,
                        (unsigned int)gcmParams->ulIvLen,
                        (unsigned int)gcmParams->ulIvFixedBits,
                        gcmParams->ivGenerator);
    if (rv != SECSuccess) {
        return SECFailure;
    }

    rv = platform_aes_gcmInitCounter(gcm, gcmParams->pIv, gcmParams->ulIvLen,
                                     gcmParams->ulTagBits, aad, aadLen);
    if (rv != SECSuccess) {
        return SECFailure;
    }

    tagBytes = gcm_tag_bytes(gcm);

    rv = process_payload(gcm, AES_GCM_ENCRYPT, outbuf, inbuf, inlen);
    if (rv != SECSuccess) {
        return SECFailure;
    }

    rv = finalize_and_emit_tag(gcm, gcmParams->pTag, tagBytes);
    if (rv != SECSuccess) {
        return SECFailure;
    }
    *outlen = inlen;
    return SECSuccess;
}

SECStatus
platform_AES_GCM_DecryptAEAD(platform_AES_GCMContext *gcm,
                             unsigned char *outbuf,
                             unsigned int *outlen, unsigned int maxout,
                             const unsigned char *inbuf, unsigned int inlen,
                             void *params, unsigned int paramLen,
                             const unsigned char *aad, unsigned int aadLen,
                             unsigned int blocksize)
{
    unsigned int tagBytes;
    const unsigned char *intag;
    const CK_GCM_MESSAGE_PARAMS *gcmParams =
        (const CK_GCM_MESSAGE_PARAMS *)params;
    SECStatus rv;

    rv = aead_validate_params(gcm, paramLen, maxout, inlen, outlen);
    if (rv != SECSuccess) {
        return SECFailure;
    }

    rv = platform_aes_gcmInitCounter(gcm, gcmParams->pIv, gcmParams->ulIvLen,
                                     gcmParams->ulTagBits, aad, aadLen);
    if (rv != SECSuccess) {
        return SECFailure;
    }

    tagBytes = gcm_tag_bytes(gcm);
    intag = gcmParams->pTag;
    PORT_Assert(tagBytes != 0);

    rv = process_payload(gcm, AES_GCM_DECRYPT, outbuf, inbuf, inlen);
    if (rv != SECSuccess) {
        PORT_SafeZero(outbuf, inlen);
        *outlen = 0;
        return SECFailure;
    }

    return verify_and_emit(gcm, intag, tagBytes, outbuf, inlen, outlen);
}
