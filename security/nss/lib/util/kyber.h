/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef KYBER_UTIL_H
#define KYBER_UTIL_H

#define MLKEM512_PUBLIC_KEY_BYTES 800U
#define MLKEM512_PRIVATE_KEY_BYTES 1632U
#define MLKEM512_CIPHERTEXT_BYTES 768U

#define KYBER768_PUBLIC_KEY_BYTES 1184U
#define KYBER768_PRIVATE_KEY_BYTES 2400U
#define KYBER768_CIPHERTEXT_BYTES 1088U

#define MLKEM1024_PUBLIC_KEY_BYTES 1568U
#define MLKEM1024_PRIVATE_KEY_BYTES 3168U
#define MLKEM1024_CIPHERTEXT_BYTES 1568U

#define KYBER_SHARED_SECRET_BYTES 32U
#define KYBER_KEYPAIR_COIN_BYTES 64U
#define KYBER_ENC_COIN_BYTES 32U

#define MAX_ML_KEM_CIPHER_LENGTH MLKEM1024_CIPHERTEXT_BYTES
#define MAX_ML_KEM_PRIVATE_KEY_LENGTH MLKEM1024_PRIVATE_KEY_BYTES
#define MAX_ML_KEM_PUBLIC_KEY_LENGTH MLKEM1024_PUBLIC_KEY_BYTES

typedef enum {
    params_kyber_invalid,

    /*
     * Deprecated: round-3 Kyber (pqcrystals) has been removed. These two
     * enumerators are retained as reserved slots so the ML-KEM values below keep
     * their ABI ordinals; they are no longer supported and are rejected.
     */
    params_kyber768_round3,
    params_kyber768_round3_test_mode,

    /*
     * The ML-KEM parameters specified in FIPS 203.
     * https://csrc.nist.gov/pubs/fips/203/final
     */
    params_ml_kem768,

    /*
     * Identical to params_ml_kem768 except that this parameter set allows
     * the use of a seed in `Kyber_Encapsulate` for testing.
     */
    params_ml_kem768_test_mode,

    /*
     * The ML-KEM parameters specified in FIPS 203.
     * https://csrc.nist.gov/pubs/fips/203/final
     */
    params_ml_kem1024,

    /*
     * Identical to params_ml_kem1024 except that this parameter set allows
     * the use of a seed in `Kyber_Encapsulate` for testing.
     */
    params_ml_kem1024_test_mode,

    /*
     * The ML-KEM parameters specified in FIPS 203.
     * https://csrc.nist.gov/pubs/fips/203/final
     *
     * Kept last so the enumerators above retain their ABI ordinals: this one
     * predates softoken/freebl support for ML-KEM-512, where it only served to
     * let NSS proper handle 512 keys mechanically.
     */
    params_ml_kem512,

    /*
     * Identical to params_ml_kem512 except that this parameter set allows
     * the use of a seed in `Kyber_Encapsulate` for testing.
     */
    params_ml_kem512_test_mode,

} KyberParams;

#endif /* KYBER_UTIL_H */
