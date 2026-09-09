/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "CacheCrypto.h"

#include "CacheFileIOManager.h"
#include "CacheIOThread.h"
#include "CacheLog.h"
#include "CacheObserver.h"
#include "LockstoreService.h"
#include "ScopedNSSTypes.h"
#include "mozilla/Atomics.h"
#include "mozilla/StaticMutex.h"
#include "mozilla/StaticPrefs_browser.h"
#include "mozilla/StaticPtr.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"
#include "pk11pub.h"
#include "pkcs11t.h"
#include "secitem.h"

namespace mozilla {
namespace net {

using mozilla::security::lockstore::LockstoreService;

// Name of the disk cache's data encryption key in the profile keystore, and
// the identifier of the "local" KEK wrapping it.
static constexpr auto kDekName = "httpcache"_ns;
static constexpr auto kKekIdentifier = "profileEncryption"_ns;

// Written on the cache I/O thread when the key load finishes, and on the main
// thread at lifecycle boundaries (InitForTesting/Shutdown), so every access
// goes through gCacheCryptoMutex. The object is threadsafe-refcounted, so
// GetInstanceOrNull() hands out a strong reference that keeps it alive while
// in use even if Shutdown() drops this one; the mutex is not held across any
// cipher operation.
static StaticMutex gCacheCryptoMutex;
static StaticRefPtr<CacheCrypto> gCacheCrypto MOZ_GUARDED_BY(gCacheCryptoMutex);

// Mirrors "a usable gCacheCrypto exists" so callers can cheaply test whether
// encryption is active without taking a strong reference or the mutex. Kept in
// sync with gCacheCrypto by Publish()/Shutdown().
static Atomic<bool> gCacheCryptoActive(false);

// Whether disk cache encryption is enabled. IsEnabled() caches the pref value
// here on its first call (on whatever thread), so the value is stable for the
// session ("takes effect on restart") and can be read from the cache I/O thread
// without touching libpref. Distinct from gCacheCryptoActive: the pref can be
// on while no usable cipher could be loaded. gCacheCryptoEnabledInited guards
// the one-time capture.
static Atomic<bool> gCacheCryptoEnabled(false);
static Atomic<bool> gCacheCryptoEnabledInited(false);

// Overwrites a buffer with zeros in a way the compiler may not optimize away,
// used to clear key material from memory.
static void SecureZero(void* aBuf, size_t aLen) {
  volatile unsigned char* p = static_cast<volatile unsigned char*>(aBuf);
  while (aLen--) {
    *p++ = 0;
  }
}

// Runs an AES-256-GCM operation (encrypt or decrypt) for the given block. The
// 64-bit block number, followed by any caller-supplied aAad, is bound as
// additional authenticated data so a block cannot be silently moved to a
// different position and the extra context cannot be tampered with. On encrypt,
// aIn is the plaintext and aOut receives ciphertext||tag (aInLen +
// kBlockTagLength); on decrypt, aIn is ciphertext||tag and aOut receives the
// plaintext.
static nsresult AesGcmOp(const uint8_t* aKey, uint64_t aBlockNumber,
                         const uint8_t* aNonce, bool aEncrypt,
                         const uint8_t* aIn, uint32_t aInLen, uint8_t* aOut,
                         uint32_t aOutMax, const uint8_t* aExtraAad,
                         uint32_t aExtraAadLen) {
  UniquePK11SlotInfo slot(PK11_GetInternalSlot());
  if (!slot) {
    return NS_ERROR_FAILURE;
  }

  SECItem keyItem = {siBuffer, const_cast<unsigned char*>(aKey),
                     CacheCrypto::kKeyLength};
  UniquePK11SymKey symKey(PK11_ImportSymKey(slot.get(), CKM_AES_GCM,
                                            PK11_OriginUnwrap, CKA_ENCRYPT,
                                            &keyItem, nullptr));
  if (!symKey) {
    return NS_ERROR_FAILURE;
  }

  // AAD = block number || caller-supplied extra AAD.
  nsTArray<uint8_t> aad;
  aad.AppendElements(reinterpret_cast<const uint8_t*>(&aBlockNumber),
                     sizeof(aBlockNumber));
  if (aExtraAad && aExtraAadLen) {
    aad.AppendElements(aExtraAad, aExtraAadLen);
  }

  CK_GCM_PARAMS gcmParams = {};
  gcmParams.pIv = const_cast<unsigned char*>(aNonce);
  gcmParams.ulIvLen = CacheCrypto::kBlockNonceLength;
  gcmParams.ulIvBits = CacheCrypto::kBlockNonceLength * 8;
  gcmParams.pAAD = aad.Elements();
  gcmParams.ulAADLen = aad.Length();
  gcmParams.ulTagBits = CacheCrypto::kBlockTagLength * 8;

  SECItem params = {siBuffer, reinterpret_cast<unsigned char*>(&gcmParams),
                    sizeof(gcmParams)};

  unsigned int outLen = 0;
  SECStatus rv = aEncrypt ? PK11_Encrypt(symKey.get(), CKM_AES_GCM, &params,
                                         aOut, &outLen, aOutMax, aIn, aInLen)
                          : PK11_Decrypt(symKey.get(), CKM_AES_GCM, &params,
                                         aOut, &outLen, aOutMax, aIn, aInLen);
  if (rv != SECSuccess) {
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

// static
void CacheCrypto::Init() {
  MOZ_ASSERT(NS_IsMainThread());

  if (IsActive() || !IsEnabled()) {
    LOG(("CacheCrypto::Init() - nothing to load, disk cache encryption %s",
         IsActive() ? "already initialized" : "disabled"));
    return;
  }

  // The cipher needs NSS, here and later on the cache I/O thread.
  if (!EnsureNSSInitializedChromeOrContent()) {
    LOG(("CacheCrypto::Init() - NSS not available"));
    return;
  }

  // Resolve the service on the main thread even though it is used off it:
  // creating it is what caches its profile path, which LockstoreService only
  // does on the main thread. We are inside profile-do-change, so the profile
  // is available by now.
  RefPtr<LockstoreService> lockstore = LockstoreService::GetSingleton();
  RefPtr<CacheIOThread> ioThread = CacheFileIOManager::IOThread();
  if (!lockstore || !ioThread) {
    LOG(("CacheCrypto::Init() - no keystore or no cache I/O thread"));
    return;
  }

  // The load runs on the cache I/O thread because Lockstore's synchronous tier
  // must not run on the main thread, and it both loads and publishes there so
  // that the key is in place before anything that consults it.
  //
  // OPEN_PRIORITY is what orders this against the rest of the cache. It is the
  // highest level queue, and this is dispatched before OnProfile() queues any
  // work, so every consumer of the key runs after it:
  //   - entry opens go to OPEN_PRIORITY/OPEN (CacheFileIOManager::OpenFile),
  //     and CacheFile::SetupEncryption only runs from their completions;
  //   - the index rebuild, which reads entry metadata via SyncReadMetadata,
  //     goes to the INDEX level.
  // Events dispatched to the thread's XPCOM level do jump ahead of the level
  // queues (see CacheIOThread::ThreadFunc), but the only ones queued this
  // early are index writes, which need IsEnabled() -- a pref read -- and not
  // the key.
  nsresult rv = ioThread->Dispatch(
      NS_NewRunnableFunction(
          "CacheCrypto::LoadFromKeystore",
          [lockstore]() { Publish(LoadFromKeystore(lockstore)); }),
      CacheIOThread::OPEN_PRIORITY);

  if (NS_FAILED(rv)) {
    LOG(("CacheCrypto::Init() - failed to dispatch the key load"));
  }
}

// static
void CacheCrypto::InitForTesting() {
  MOZ_ASSERT(NS_IsMainThread());

  if (IsActive()) {
    return;
  }

  if (!EnsureNSSInitializedChromeOrContent()) {
    LOG(("CacheCrypto::InitForTesting() - NSS not available"));
    return;
  }

  // A throwaway key, so gtests need neither the enabled pref nor a keystore.
  RefPtr<CacheCrypto> crypto = new CacheCrypto();
  if (PK11_GenerateRandom(crypto->mKeyBytes, kKeyLength) != SECSuccess) {
    LOG(("CacheCrypto::InitForTesting() - key generation failed"));
    return;
  }

  crypto->mUsable = true;
  Publish(crypto.forget());
}

// static
already_AddRefed<CacheCrypto> CacheCrypto::LoadFromKeystore(
    LockstoreService* aLockstore) {
  MOZ_ASSERT(!NS_IsMainThread());

  // A non-empty identifier makes this a deterministic get-or-create, so the
  // kekRef does not have to be persisted anywhere.
  auto kekRef = aLockstore->DoCreateKek("local"_ns, kKekIdentifier, ""_ns, 0);
  if (kekRef.isErr()) {
    LOG(
        ("CacheCrypto::LoadFromKeystore() - could not obtain the KEK "
         "[rv=%" PRIx32 "]",
         static_cast<uint32_t>(kekRef.unwrapErr())));
    return nullptr;
  }

  // Mint the DEK on first use only: asking for one that already exists is an
  // error the keystore logs, and after the first run that would be every
  // startup.
  auto deks = aLockstore->DoListDeks();
  if (deks.isErr()) {
    LOG(("CacheCrypto::LoadFromKeystore() - could not list DEKs [rv=%" PRIx32
         "]",
         static_cast<uint32_t>(deks.unwrapErr())));
    return nullptr;
  }

  if (!deks.inspect().Contains(kDekName)) {
    // Extractable: the cache does its own AES-GCM per block, binding the block
    // number as AAD, which the keystore's blob-oriented encrypt() cannot
    // express.
    nsresult rv = aLockstore->DoCreateDek(kDekName, kekRef.inspect(),
                                          /* aExtractable */ true, kKeyLength);
    if (NS_FAILED(rv)) {
      LOG(
          ("CacheCrypto::LoadFromKeystore() - could not mint the DEK "
           "[rv=%" PRIx32 "]",
           static_cast<uint32_t>(rv)));
      return nullptr;
    }
  }

  auto dek = aLockstore->DoGetDek(kDekName, kekRef.inspect());
  if (dek.isErr()) {
    LOG(("CacheCrypto::LoadFromKeystore() - could not read the DEK [rv=%" PRIx32
         "]",
         static_cast<uint32_t>(dek.unwrapErr())));
    return nullptr;
  }

  nsTArray<uint8_t> keyBytes = dek.unwrap();
  if (keyBytes.Length() != kKeyLength) {
    LOG(("CacheCrypto::LoadFromKeystore() - DEK is %zu bytes, expected %u",
         keyBytes.Length(), kKeyLength));
    SecureZero(keyBytes.Elements(), keyBytes.Length());
    return nullptr;
  }

  RefPtr<CacheCrypto> crypto = new CacheCrypto();
  memcpy(crypto->mKeyBytes, keyBytes.Elements(), kKeyLength);
  SecureZero(keyBytes.Elements(), keyBytes.Length());
  crypto->mUsable = true;
  return crypto.forget();
}

// static
void CacheCrypto::Publish(already_AddRefed<CacheCrypto> aCrypto) {
  RefPtr<CacheCrypto> crypto = aCrypto;
  if (!crypto) {
    // Encryption stays inactive. CacheFile::SetupEncryption() then fails new
    // entries closed rather than writing them as plaintext, because
    // IsEnabled() is still true.
    LOG(("CacheCrypto::Publish() - no cipher, disk cache encryption inactive"));
    return;
  }

  {
    StaticMutexAutoLock lock(gCacheCryptoMutex);
    gCacheCrypto = crypto.forget();
    // Set after gCacheCrypto so that IsActive() never reports a cipher that
    // GetInstanceOrNull() cannot yet hand out.
    gCacheCryptoActive = true;
  }
  LOG(("CacheCrypto::Publish() - disk cache encryption ready"));
}

// static
void CacheCrypto::Shutdown() {
  MOZ_ASSERT(NS_IsMainThread());
  {
    StaticMutexAutoLock lock(gCacheCryptoMutex);
    gCacheCryptoActive = false;
    gCacheCrypto = nullptr;
  }
  // gCacheCryptoEnabled is intentionally left cached: it reflects the pref as
  // of the first IsEnabled() call and is meant to be stable for the process.
}

// static
already_AddRefed<CacheCrypto> CacheCrypto::GetInstanceOrNull() {
  StaticMutexAutoLock lock(gCacheCryptoMutex);
  RefPtr<CacheCrypto> crypto = gCacheCrypto;
  if (crypto && crypto->mUsable) {
    return crypto.forget();
  }
  return nullptr;
}

// static
bool CacheCrypto::IsActive() { return gCacheCryptoActive; }

// static
bool CacheCrypto::IsEnabled() {
  // Capture the pref value on the first call (on whatever thread) and reuse it
  // afterwards, so the encryption decision is stable for the session. The pref
  // is RelaxedAtomicBool/mirror:always, so the StaticPrefs read is itself
  // thread-safe. The race between two first-callers is benign: the pref value
  // doesn't change between them, so both cache the same value.
  if (!gCacheCryptoEnabledInited) {
    gCacheCryptoEnabled = StaticPrefs::browser_cache_disk_encryption_enabled();
    gCacheCryptoEnabledInited = true;
  }
  return gCacheCryptoEnabled;
}

CacheCrypto::~CacheCrypto() { SecureZero(mKeyBytes, sizeof(mKeyBytes)); }

nsresult CacheCrypto::EncryptBlock(uint64_t aBlockNumber,
                                   const uint8_t* aPlaintext, uint32_t aLen,
                                   uint8_t* aOut, const uint8_t* aAad,
                                   uint32_t aAadLen) {
  if (!mUsable) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  // Layout: [ciphertext(aLen)][tag(kBlockTagLength)][nonce(kBlockNonceLength)].
  // ciphertext||tag are written contiguously by PK11_Encrypt; the nonce
  // follows.
  uint8_t* nonce = aOut + aLen + kBlockTagLength;
  if (PK11_GenerateRandom(nonce, kBlockNonceLength) != SECSuccess) {
    return NS_ERROR_FAILURE;
  }

  return AesGcmOp(mKeyBytes, aBlockNumber, nonce, /* aEncrypt */ true,
                  aPlaintext, aLen, aOut, aLen + kBlockTagLength, aAad,
                  aAadLen);
}

nsresult CacheCrypto::DecryptBlock(uint64_t aBlockNumber, uint8_t* aIn,
                                   uint32_t aLen, uint8_t* aOut,
                                   const uint8_t* aAad, uint32_t aAadLen) {
  if (!mUsable) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  // aIn is [ciphertext(aLen)][tag(kBlockTagLength)][nonce(kBlockNonceLength)].
  const uint8_t* nonce = aIn + aLen + kBlockTagLength;

  return AesGcmOp(mKeyBytes, aBlockNumber, nonce, /* aEncrypt */ false, aIn,
                  aLen + kBlockTagLength, aOut, aLen, aAad, aAadLen);
}

}  // namespace net
}  // namespace mozilla
