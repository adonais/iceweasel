/*
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifdef FREEBL_NO_DEPEND
#include "stubs.h"
#endif

#include <limits.h>

#include "prerror.h"
#include "secerr.h"

#include "prtypes.h"
#include "prinit.h"
#include "blapi.h"
#include "secitem.h"
#include "blapit.h"
#include "secport.h"
#include "secrng.h"
#include "ml_dsat.h"

#include "libcrux_mldsa44_portable.h"
#include "libcrux_mldsa65_portable.h"
#include "libcrux_mldsa87_portable.h"

/* Eurydice derives the names of the generated array and result types from a
 * hash of their contents, so re-vendoring libcrux can rename them out from
 * under us. Alias them all here; the rest of this file uses only the aliases,
 * so a re-vendor only has to fix up this block. The static assertions below
 * catch an alias that has been pointed at the wrong type.
 */
typedef Eurydice_arr_ec MlDsaSeed;       /* key generation seed */
typedef Eurydice_arr_ec MlDsaRandomness; /* per-signature randomness */
typedef Eurydice_arr_10 MlDsa44SigningKey;
typedef Eurydice_arr_02 MlDsa44VerificationKey;
typedef Eurydice_arr_85 MlDsa44Signature;
typedef Eurydice_arr_24 MlDsa65SigningKey;
typedef Eurydice_arr_29 MlDsa65VerificationKey;
typedef Eurydice_arr_0c MlDsa65Signature;
typedef Eurydice_arr_e2 MlDsa87SigningKey;
typedef Eurydice_arr_43 MlDsa87VerificationKey;
typedef Eurydice_arr_93 MlDsa87Signature;
typedef libcrux_ml_dsa_ml_dsa_generic_ml_dsa_44_MLDSA44KeyPair MlDsa44KeyPair;
typedef libcrux_ml_dsa_ml_dsa_generic_ml_dsa_65_MLDSA65KeyPair MlDsa65KeyPair;
typedef libcrux_ml_dsa_ml_dsa_generic_ml_dsa_87_MLDSA87KeyPair MlDsa87KeyPair;
typedef Eurydice_borrow_slice_u8 MlDsaSlice;
/* Result<(), SigningError> and Result<(), VerificationError> */
typedef core_result_Result_53 MlDsaSignResult;
typedef core_result_Result_41 MlDsaVerifyResult;

PR_STATIC_ASSERT(sizeof(((MlDsaSeed *)0)->data) == ML_DSA_SEED_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsaRandomness *)0)->data) == ML_DSA_SEED_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa44SigningKey *)0)->data) == ML_DSA_44_PRIVATEKEY_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa44VerificationKey *)0)->data) == ML_DSA_44_PUBLICKEY_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa44Signature *)0)->data) == ML_DSA_44_SIGNATURE_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa65SigningKey *)0)->data) == ML_DSA_65_PRIVATEKEY_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa65VerificationKey *)0)->data) == ML_DSA_65_PUBLICKEY_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa65Signature *)0)->data) == ML_DSA_65_SIGNATURE_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa87SigningKey *)0)->data) == ML_DSA_87_PRIVATEKEY_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa87VerificationKey *)0)->data) == ML_DSA_87_PUBLICKEY_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa87Signature *)0)->data) == ML_DSA_87_SIGNATURE_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa44KeyPair *)0)->signing_key.data) == ML_DSA_44_PRIVATEKEY_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa44KeyPair *)0)->verification_key.data) == ML_DSA_44_PUBLICKEY_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa65KeyPair *)0)->signing_key.data) == ML_DSA_65_PRIVATEKEY_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa65KeyPair *)0)->verification_key.data) == ML_DSA_65_PUBLICKEY_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa87KeyPair *)0)->signing_key.data) == ML_DSA_87_PRIVATEKEY_LEN);
PR_STATIC_ASSERT(sizeof(((MlDsa87KeyPair *)0)->verification_key.data) == ML_DSA_87_PUBLICKEY_LEN);

/* Number of coefficients in a polynomial (FIPS 204, n). */
#define MLDSA_POLY_COEFFICIENTS 256
/* Length of the rho || K || tr prefix of an encoded signing key. */
#define MLDSA_SIGNING_KEY_PREFIX_LEN (32 + 32 + 64)

/* An encoded signing key is rho || K || tr || s1 || s2 || t0, where s1 and s2
 * hold l and k polynomials at bitlen(2*eta) bits per coefficient and t0 holds
 * k polynomials at 13 bits per coefficient.
 */
#define MLDSA_SIGNING_KEY_LEN(l, k, bits)                 \
    (MLDSA_SIGNING_KEY_PREFIX_LEN +                       \
     ((l) + (k)) * MLDSA_POLY_COEFFICIENTS * (bits) / 8 + \
     (k) * MLDSA_POLY_COEFFICIENTS * 13 / 8)
PR_STATIC_ASSERT(MLDSA_SIGNING_KEY_LEN(4, 4, 3) == ML_DSA_44_PRIVATEKEY_LEN);
PR_STATIC_ASSERT(MLDSA_SIGNING_KEY_LEN(5, 6, 4) == ML_DSA_65_PRIVATEKEY_LEN);
PR_STATIC_ASSERT(MLDSA_SIGNING_KEY_LEN(7, 8, 3) == ML_DSA_87_PRIVATEKEY_LEN);

static PRBool
mldsa_ParamSetIsKnown(CK_ML_DSA_PARAMETER_SET_TYPE paramSet)
{
    switch (paramSet) {
        case CKP_ML_DSA_44:
        case CKP_ML_DSA_65:
        case CKP_ML_DSA_87:
            return PR_TRUE;
        default:
            return PR_FALSE;
    }
}

static SECStatus
mldsa_CheckSigningKey(CK_ML_DSA_PARAMETER_SET_TYPE paramSet,
                      const unsigned char *key, unsigned int keyLen)
{
    const unsigned char *s;
    unsigned int eta;
    unsigned int expectedLen, bits, count, mask, i;
    PRUint32 bad = 0;

    switch (paramSet) {
        case CKP_ML_DSA_44:
            expectedLen = ML_DSA_44_PRIVATEKEY_LEN;
            eta = 2;
            count = (4 + 4) * MLDSA_POLY_COEFFICIENTS;
            break;
        case CKP_ML_DSA_65:
            expectedLen = ML_DSA_65_PRIVATEKEY_LEN;
            eta = 4;
            count = (6 + 5) * MLDSA_POLY_COEFFICIENTS;
            break;
        case CKP_ML_DSA_87:
            expectedLen = ML_DSA_87_PRIVATEKEY_LEN;
            eta = 2;
            count = (8 + 7) * MLDSA_POLY_COEFFICIENTS;
            break;
        default:
            PORT_SetError(SEC_ERROR_INVALID_ALGORITHM);
            return SECFailure;
    }

    if (keyLen != expectedLen) {
        PORT_SetError(SEC_ERROR_BAD_KEY);
        return SECFailure;
    }

    /* Ensure all of the packed coefficients are in [0, 2*eta] */
    s = key + MLDSA_SIGNING_KEY_PREFIX_LEN;
    bits = (eta == 2) ? 3 : 4; /* bitlen(2*eta) */
    mask = (1u << bits) - 1;
    for (i = 0; i < count; i++) {
        unsigned int offset = i * bits;
        unsigned int w = (unsigned int)s[offset / 8] |
                         ((unsigned int)s[offset / 8 + 1] << 8);
        w = (w >> (offset % 8)) & mask;
        bad |= PORT_CT_GT(w, 2 * eta);
    }
    if (bad) {
        PORT_SetError(SEC_ERROR_BAD_KEY);
        return SECFailure;
    }

    return SECSuccess;
}

static MlDsaSlice
mldsa_slice(const unsigned char *p, size_t len)
{
    MlDsaSlice s = { 0 };
    s.ptr = p;
    s.meta = len;
    return s;
}

/* This is private to this file and can be changed at will. libcrux only offers
 * a one-shot sign/verify, so the context buffers the whole message here. */
struct MLDSAContextStr {
    CK_ML_DSA_PARAMETER_SET_TYPE paramSet;
    PRBool isSign;           /* set by MLDSA_SignInit, clear by *VerifyInit */
    CK_HEDGE_TYPE hedgeType; /* sign only */
    /* our copy of the signing key or verification key */
    unsigned char *key;
    unsigned int keyLen;
    /* domain-separation context. FIPS 204 caps this at 255 bytes, which is
     * what libcrux's CONTEXT_MAX_LEN is. */
    unsigned char context[LIBCRUX_ML_DSA_CONSTANTS_CONTEXT_MAX_LEN];
    unsigned int contextLen;
    /* buffered message, grown across *Update calls */
    unsigned char *msg;
    unsigned int msgLen;
    unsigned int msgCap;
    PRBool failed;       /* a prior *Update failed; fail the whole operation in *Final */
    PRErrorCode failure; /* the error that set "failed" */
};

/* Mark ctx as failed and remember the error, so that the later *Update and
 * *Final calls on this context can report the same failure. */
static SECStatus
mldsa_Fail(MLDSAContext *ctx, PRErrorCode error)
{
    ctx->failed = PR_TRUE;
    ctx->failure = error;
    PORT_SetError(error);
    return SECFailure;
}

static void
mldsa_FreeContext(MLDSAContext *ctx)
{
    if (ctx == NULL) {
        return;
    }
    if (ctx->msg != NULL) {
        PORT_SafeZero(ctx->msg, ctx->msgCap);
        PORT_Free(ctx->msg);
    }
    if (ctx->key != NULL) {
        PORT_SafeZero(ctx->key, ctx->keyLen);
        PORT_Free(ctx->key);
    }
    PORT_SafeZero(ctx, sizeof(*ctx));
    PORT_Free(ctx);
}

static MLDSAContext *
mldsa_NewContext(CK_ML_DSA_PARAMETER_SET_TYPE paramSet, const SECItem *sgnCtx,
                 const unsigned char *keyVal, unsigned int keyLen,
                 PRBool isSign)
{
    MLDSAContext *ctx;

    if (!mldsa_ParamSetIsKnown(paramSet)) {
        PORT_SetError(SEC_ERROR_INVALID_ALGORITHM);
        return NULL;
    }

    if (isSign && mldsa_CheckSigningKey(paramSet, keyVal, keyLen) != SECSuccess) {
        return NULL;
    }

    if (sgnCtx != NULL && sgnCtx->len > sizeof(ctx->context)) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return NULL;
    }

    ctx = PORT_ZNew(MLDSAContext);
    if (ctx == NULL) {
        return NULL;
    }
    ctx->paramSet = paramSet;
    ctx->isSign = isSign;
    if (sgnCtx != NULL && sgnCtx->len != 0) {
        PORT_Memcpy(ctx->context, sgnCtx->data, sgnCtx->len);
        ctx->contextLen = sgnCtx->len;
    }
    ctx->key = PORT_Alloc(keyLen);
    if (ctx->key == NULL) {
        mldsa_FreeContext(ctx); /* PORT_Alloc set the error */
        return NULL;
    }
    PORT_Memcpy(ctx->key, keyVal, keyLen);
    ctx->keyLen = keyLen;
    return ctx;
}

/* Append data to the buffered message, growing as needed. */
static SECStatus
mldsa_Update(MLDSAContext *ctx, const SECItem *data)
{
    if (ctx->failed) {
        PORT_SetError(ctx->failure);
        return SECFailure;
    }
    if (data == NULL || data->len == 0) {
        return SECSuccess;
    }
    if (data->len > UINT_MAX - ctx->msgLen) {
        return mldsa_Fail(ctx, SEC_ERROR_INPUT_LEN);
    }
    unsigned int needed = ctx->msgLen + data->len;
    if (needed > ctx->msgCap) {
        unsigned int newCap = ctx->msgCap ? ctx->msgCap : 1024;
        unsigned char *newMsg;
        while (newCap < needed) {
            if (newCap > UINT_MAX / 2) {
                newCap = needed;
                break;
            }
            newCap *= 2;
        }
        newMsg = PORT_Realloc(ctx->msg, newCap);
        if (newMsg == NULL) {
            return mldsa_Fail(ctx, SEC_ERROR_NO_MEMORY);
        }
        ctx->msg = newMsg;
        ctx->msgCap = newCap;
    }
    PORT_Memcpy(ctx->msg + ctx->msgLen, data->data, data->len);
    ctx->msgLen += data->len;
    return SECSuccess;
}

/* Common key generation body for one parameter set. Reads "seedArr" and fills
 * in the keyVal/keyValLen of "privKey" and "pubKey", all from the enclosing
 * scope.
 */
#define MLDSA_NEWKEY_BODY(KPT, GENFN)                          \
    do {                                                       \
        KPT _kp = GENFN(seedArr);                              \
        PORT_Memcpy(privKey->keyVal, _kp.signing_key.data,     \
                    sizeof _kp.signing_key.data);              \
        privKey->keyValLen = sizeof _kp.signing_key.data;      \
        PORT_Memcpy(pubKey->keyVal, _kp.verification_key.data, \
                    sizeof _kp.verification_key.data);         \
        pubKey->keyValLen = sizeof _kp.verification_key.data;  \
        PORT_SafeZero(&_kp, sizeof _kp);                       \
    } while (0)

/*
** Generate a new ML-DSA key pair for the given parameter set.
** If "seed" is supplied it must be ML_DSA_SEED_LEN bytes and the key is derived
** deterministically from it; otherwise a fresh random seed is generated. The
** seed is stored in the private key so the pair can be regenerated later.
*/
SECStatus
MLDSA_NewKey(CK_ML_DSA_PARAMETER_SET_TYPE paramSet, SECItem *seed,
             MLDSAPrivateKey *privKey, MLDSAPublicKey *pubKey)
{
    MlDsaSeed seedArr = { .data = { 0 } };

    if (privKey == NULL || pubKey == NULL) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }
    if (seed != NULL) {
        if (seed->len != ML_DSA_SEED_LEN) {
            PORT_SetError(SEC_ERROR_INVALID_ARGS);
            return SECFailure;
        }
        PORT_Memcpy(seedArr.data, seed->data, ML_DSA_SEED_LEN);
    } else {
        if (RNG_GenerateGlobalRandomBytes(seedArr.data, ML_DSA_SEED_LEN) != SECSuccess) {
            PORT_SetError(SEC_ERROR_NEED_RANDOM);
            return SECFailure;
        }
    }

    switch (paramSet) {
        case CKP_ML_DSA_44:
            MLDSA_NEWKEY_BODY(MlDsa44KeyPair,
                              libcrux_ml_dsa_ml_dsa_44_portable_generate_key_pair);
            break;
        case CKP_ML_DSA_65:
            MLDSA_NEWKEY_BODY(MlDsa65KeyPair,
                              libcrux_ml_dsa_ml_dsa_65_portable_generate_key_pair);
            break;
        case CKP_ML_DSA_87:
            MLDSA_NEWKEY_BODY(MlDsa87KeyPair,
                              libcrux_ml_dsa_ml_dsa_87_portable_generate_key_pair);
            break;
        default:
            PORT_SetError(SEC_ERROR_INVALID_ALGORITHM);
            PORT_SafeZero(seedArr.data, ML_DSA_SEED_LEN);
            return SECFailure;
    }

    privKey->paramSet = paramSet;
    pubKey->paramSet = paramSet;
    PORT_Memcpy(privKey->seed, seedArr.data, ML_DSA_SEED_LEN);
    privKey->seedLen = ML_DSA_SEED_LEN;
    PORT_SafeZero(seedArr.data, ML_DSA_SEED_LEN);
    return SECSuccess;
}

/*
 * We don't have a streaming interface into libcrux, so use our own local context
 * to accumulate the message and stash the signing key/context.
 */
SECStatus
MLDSA_SignInit(MLDSAPrivateKey *key, CK_HEDGE_TYPE hedgeType,
               const SECItem *sgnCtx, MLDSAContext **ctx)
{
    MLDSAContext *context;

    if (key == NULL || ctx == NULL) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }
    context = mldsa_NewContext(key->paramSet, sgnCtx, key->keyVal,
                               key->keyValLen, PR_TRUE);
    if (context == NULL) {
        return SECFailure;
    }
    context->hedgeType = hedgeType;
    *ctx = context;
    return SECSuccess;
}

SECStatus
MLDSA_SignUpdate(MLDSAContext *ctx, const SECItem *data)
{
    if (ctx == NULL || !ctx->isSign) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }
    return mldsa_Update(ctx, data);
}

/* Common signing body for one parameter set. Reads "ctx->key", "ctx->keyLen",
 * "msgSlice", "ctxSlice", and "rnd", and sets "rv" plus "signature->data" and
 * "signature->len", all from the enclosing scope.
 */
#define MLDSA_SIGN_BODY(SKT, SIGT, SIGNFN)                         \
    do {                                                           \
        SKT _sk;                                                   \
        SIGT _sig = { .data = { 0 } };                             \
        MlDsaSignResult _res;                                      \
        if (ctx->keyLen != sizeof _sk.data) {                      \
            PORT_SetError(SEC_ERROR_INVALID_ARGS);                 \
            break;                                                 \
        }                                                          \
        if (signature->len < sizeof _sig.data) {                   \
            PORT_SetError(SEC_ERROR_OUTPUT_LEN);                   \
            break;                                                 \
        }                                                          \
        PORT_Memcpy(_sk.data, ctx->key, sizeof _sk.data);          \
        _res = SIGNFN(&_sk, msgSlice, ctxSlice, rnd, &_sig);       \
        PORT_SafeZero(_sk.data, sizeof _sk.data);                  \
        if (_res.tag != core_result_Ok) {                          \
            PORT_SetError(SEC_ERROR_LIBRARY_FAILURE);              \
            break;                                                 \
        }                                                          \
        PORT_Memcpy(signature->data, _sig.data, sizeof _sig.data); \
        signature->len = sizeof _sig.data;                         \
        rv = SECSuccess;                                           \
    } while (0)

SECStatus
MLDSA_SignFinal(MLDSAContext *ctx, SECItem *signature)
{
    MlDsaRandomness rnd = { .data = { 0 } };
    MlDsaSlice msgSlice;
    MlDsaSlice ctxSlice;

    if (ctx == NULL || signature == NULL || !ctx->isSign) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }
    if (ctx->failed) {
        PORT_SetError(ctx->failure);
        return SECFailure;
    }

    /* Deterministic signatures use all-zero randomness; every other hedge
     * variant (preferred/required) uses fresh randomness. */
    if (ctx->hedgeType != CKH_DETERMINISTIC_REQUIRED) {
        if (RNG_GenerateGlobalRandomBytes(rnd.data, sizeof rnd.data) != SECSuccess) {
            PORT_SetError(SEC_ERROR_NEED_RANDOM);
            return SECFailure;
        }
    }

    msgSlice = mldsa_slice(ctx->msg, ctx->msgLen);
    ctxSlice = mldsa_slice(ctx->context, ctx->contextLen);

    SECStatus rv = SECFailure; /* MLDSA_SIGN_BODY sets rv on success */
    switch (ctx->paramSet) {
        case CKP_ML_DSA_44:
            MLDSA_SIGN_BODY(MlDsa44SigningKey, MlDsa44Signature,
                            libcrux_ml_dsa_ml_dsa_44_portable_sign_mut);
            break;
        case CKP_ML_DSA_65:
            MLDSA_SIGN_BODY(MlDsa65SigningKey, MlDsa65Signature,
                            libcrux_ml_dsa_ml_dsa_65_portable_sign_mut);
            break;
        case CKP_ML_DSA_87:
            MLDSA_SIGN_BODY(MlDsa87SigningKey, MlDsa87Signature,
                            libcrux_ml_dsa_ml_dsa_87_portable_sign_mut);
            break;
        default:
            PORT_SetError(SEC_ERROR_INVALID_ALGORITHM);
            break;
    }
    return rv;
}

/* Release a context from either MLDSA_SignInit or MLDSA_VerifyInit. The *Final
 * calls deliberately do not do this, so that a caller which abandons an
 * operation without reaching *Final still has a way to free it. */
void
MLDSA_DestroyContext(MLDSAContext *ctx)
{
    mldsa_FreeContext(ctx);
}

/*
 * We don't have a streaming interface into libcrux, so use our own local context
 * to accumulate the message and stash the verification key/context.
 */
SECStatus
MLDSA_VerifyInit(MLDSAPublicKey *key, const SECItem *sgnCtx, MLDSAContext **ctx)
{
    MLDSAContext *context;

    if (key == NULL || ctx == NULL) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }
    context = mldsa_NewContext(key->paramSet, sgnCtx, key->keyVal,
                               key->keyValLen, PR_FALSE);
    if (context == NULL) {
        return SECFailure;
    }
    *ctx = context;
    return SECSuccess;
}

SECStatus
MLDSA_VerifyUpdate(MLDSAContext *ctx, const SECItem *data)
{
    if (ctx == NULL || ctx->isSign) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }
    return mldsa_Update(ctx, data);
}

/* Common verification body for one parameter set. Reads "ctx->key",
 * "ctx->keyLen", "signature", "msgSlice", and "ctxSlice", and sets "rv", all
 * from the enclosing scope.
 */
#define MLDSA_VERIFY_BODY(VKT, SIGT, VERIFYFN)                     \
    do {                                                           \
        VKT _vk;                                                   \
        SIGT _sig;                                                 \
        MlDsaVerifyResult _res;                                    \
        if (ctx->keyLen != sizeof _vk.data ||                      \
            signature->len != sizeof _sig.data) {                  \
            PORT_SetError(SEC_ERROR_BAD_SIGNATURE);                \
            break;                                                 \
        }                                                          \
        PORT_Memcpy(_vk.data, ctx->key, sizeof _vk.data);          \
        PORT_Memcpy(_sig.data, signature->data, sizeof _sig.data); \
        _res = VERIFYFN(&_vk, msgSlice, ctxSlice, &_sig);          \
        if (_res.tag == core_result_Ok) {                          \
            rv = SECSuccess;                                       \
        } else {                                                   \
            PORT_SetError(SEC_ERROR_BAD_SIGNATURE);                \
        }                                                          \
    } while (0)

SECStatus
MLDSA_VerifyFinal(MLDSAContext *ctx, const SECItem *signature)
{
    MlDsaSlice msgSlice;
    MlDsaSlice ctxSlice;

    if (ctx == NULL || signature == NULL || ctx->isSign) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }
    if (ctx->failed) {
        PORT_SetError(ctx->failure);
        return SECFailure;
    }

    msgSlice = mldsa_slice(ctx->msg, ctx->msgLen);
    ctxSlice = mldsa_slice(ctx->context, ctx->contextLen);

    SECStatus rv = SECFailure; /* MLDSA_VERIFY_BODY sets rv on success */
    switch (ctx->paramSet) {
        case CKP_ML_DSA_44:
            MLDSA_VERIFY_BODY(MlDsa44VerificationKey, MlDsa44Signature,
                              libcrux_ml_dsa_ml_dsa_44_portable_verify);
            break;
        case CKP_ML_DSA_65:
            MLDSA_VERIFY_BODY(MlDsa65VerificationKey, MlDsa65Signature,
                              libcrux_ml_dsa_ml_dsa_65_portable_verify);
            break;
        case CKP_ML_DSA_87:
            MLDSA_VERIFY_BODY(MlDsa87VerificationKey, MlDsa87Signature,
                              libcrux_ml_dsa_ml_dsa_87_portable_verify);
            break;
        default:
            PORT_SetError(SEC_ERROR_INVALID_ALGORITHM);
            break;
    }
    return rv;
}
