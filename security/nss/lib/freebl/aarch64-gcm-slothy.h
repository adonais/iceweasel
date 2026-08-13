/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Declarations for SLOTHY-optimized AES-GCM assembly kernels (AArch64).
 *
 * These kernels perform combined AES-CTR encryption/decryption and GHASH
 * authentication in a single pass over the data. They process full 16-byte
 * blocks only; partial block handling must be done by the caller.
 *
 * All kernels share the same calling convention:
 *   x0 (in)      - input data pointer
 *   x1 (in_bits) - input length in BITS (not bytes)
 *   x2 (out)     - output data pointer
 *   x3 (Xi)      - GHASH accumulator (16 bytes, read/write)
 *   x4 (ivec)    - AES-CTR counter (16 bytes, read/write)
 *   x5 (key)     - AES round key schedule (PRUint32[] from AESContext.k)
 *   x6 (Htable)  - Precomputed H-power table (12 entries, 192 bytes)
 *
 * The Htable layout (produced by gcm_init_htable) stores H^1..H^8 with
 * Karatsuba precomputation in the OpenSSL/aws-lc byte-order convention
 * (rev64, NOT vrbit).
 *
 * Derived from aws-lc (hanno-becker/aws-lc, branch aarch64_aes_gcm_slothy).
 * Original code by Fangming Fang (ARM/OpenSSL), Samuel Lee (AArch64cryptolib),
 * and Hanno Becker (SLOTHY optimization).
 */

#ifndef AARCH64_GCM_SLOTHY_H
#define AARCH64_GCM_SLOTHY_H

#include <stdint.h>

void aes_gcm_enc_kernel_slothy_base_128(const uint8_t *in, uint64_t in_bits,
                                        void *out, void *Xi,
                                        uint8_t *ivec, const void *key,
                                        const void *Htable);

void aes_gcm_enc_kernel_slothy_base_192(const uint8_t *in, uint64_t in_bits,
                                        void *out, void *Xi,
                                        uint8_t *ivec, const void *key,
                                        const void *Htable);

void aes_gcm_enc_kernel_slothy_base_256(const uint8_t *in, uint64_t in_bits,
                                        void *out, void *Xi,
                                        uint8_t *ivec, const void *key,
                                        const void *Htable);

void aes_gcm_dec_kernel_slothy_base_128(const uint8_t *in, uint64_t in_bits,
                                        void *out, void *Xi,
                                        uint8_t *ivec, const void *key,
                                        const void *Htable);

void aes_gcm_dec_kernel_slothy_base_192(const uint8_t *in, uint64_t in_bits,
                                        void *out, void *Xi,
                                        uint8_t *ivec, const void *key,
                                        const void *Htable);

void aes_gcm_dec_kernel_slothy_base_256(const uint8_t *in, uint64_t in_bits,
                                        void *out, void *Xi,
                                        uint8_t *ivec, const void *key,
                                        const void *Htable);

#endif /* AARCH64_GCM_SLOTHY_H */
