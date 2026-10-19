/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef NSSSocketControl_h
#define NSSSocketControl_h

#include "CommonSocketControl.h"
#include "SharedSSLState.h"
#include "TLSClientAuthCertSelection.h"
#include "mozilla/Casting.h"
#include "mozilla/Maybe.h"
#include "mozilla/Span.h"
#include "nsNSSIOLayer.h"
#include "nsThreadUtils.h"

extern mozilla::LazyLogModule gPIPNSSLog;

class SelectClientAuthCertificate;

class NSSSocketControl final : public CommonSocketControl {
 public:
  NSSSocketControl(const nsCString& aHostName, int32_t aPort,
                   mozilla::psm::SharedSSLState& aState, uint32_t providerFlags,
                   uint32_t providerTlsFlags);

  NS_INLINE_DECL_REFCOUNTING_INHERITED(NSSSocketControl, CommonSocketControl);

  void SetForSTARTTLS(bool aForSTARTTLS);
  bool GetForSTARTTLS();

  nsresult GetFileDescPtr(PRFileDesc** aFilePtr);
  nsresult SetFileDescPtr(PRFileDesc* aFilePtr);

  bool IsHandshakePending() const {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    return mHandshakePending;
  }
  void SetHandshakeNotPending() {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    mHandshakePending = false;
  }

  void SetTLSVersionRange(SSLVersionRange range) {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    mTLSVersionRange = range;
  }
  SSLVersionRange GetTLSVersionRange() const {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    return mTLSVersionRange;
  };

  // From nsITLSSocketControl.
  NS_IMETHOD ProxyStartSSL(void) override;
  NS_IMETHOD StartTLS(void) override;
  NS_IMETHOD SetNPNList(nsTArray<nsCString>& aNPNList) override;
  NS_IMETHOD GetAlpnEarlySelection(nsACString& _retval) override;
  NS_IMETHOD GetEarlyDataAccepted(bool* aEarlyDataAccepted) override;
  NS_IMETHOD DriveHandshake(void) override;
  NS_IMETHOD GetKEAUsed(int16_t* aKEAUsed) override;
  NS_IMETHOD GetKEAKeyBits(uint32_t* aKEAKeyBits) override;
  NS_IMETHOD GetSSLVersionOffered(int16_t* aSSLVersionOffered) override;
  NS_IMETHOD GetMACAlgorithmUsed(int16_t* aMACAlgorithmUsed) override;
  bool GetDenyClientCert() override;
  void SetDenyClientCert(bool aDenyClientCert) override;
  NS_IMETHOD GetEsniTxt(nsACString& aEsniTxt) override;
  NS_IMETHOD SetEsniTxt(const nsACString& aEsniTxt) override;
  NS_IMETHOD GetEchConfig(nsACString& aEchConfig) override;
  NS_IMETHOD SetEchConfig(const nsACString& aEchConfig) override;
  NS_IMETHOD GetPeerId(nsACString& aResult) override;
  NS_IMETHOD GetRetryEchConfig(nsACString& aEchConfig) override;
  NS_IMETHOD DisableEarlyData(void) override;
  NS_IMETHOD SetHandshakeCallbackListener(
      nsITlsHandshakeCallbackListener* callback) override;
  NS_IMETHOD Claim() override;

  PRStatus CloseSocketAndDestroy();

  void SetNegotiatedNPN(const char* value, uint32_t length);
  void SetEarlyDataAccepted(bool aAccepted);

  void SetHandshakeCompleted();
  bool IsHandshakeCompleted() const {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    return mHandshakeCompleted;
  }
  void NoteTimeUntilReady();

  void SetFalseStartCallbackCalled() {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    mFalseStartCallbackCalled = true;
  }
  void SetFalseStarted() {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    mFalseStarted = true;
  }

  // Note that this is only valid *during* a handshake; at the end of the
  // handshake, it gets reset back to false.
  void SetFullHandshake() {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    mIsFullHandshake = true;
  }
  bool IsFullHandshake() const {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    return mIsFullHandshake;
  }

  void UpdateEchExtensionStatus(EchExtensionStatus aEchExtensionStatus) {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    mEchExtensionStatus = std::max(aEchExtensionStatus, mEchExtensionStatus);
  }
  EchExtensionStatus GetEchExtensionStatus() const {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    return mEchExtensionStatus;
  }

  bool GetJoined() {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    return mJoined;
  }

  uint32_t GetProviderTlsFlags() const {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    return mProviderTlsFlags;
  }

  mozilla::psm::SharedSSLState& SharedState();

  enum CertVerificationState {
    BeforeCertVerification,
    WaitingForCertVerification,
    AfterCertVerification
  };

  void SetCertVerificationWaiting();

  // Use errorCode == 0 to indicate success;
  void SetCertVerificationResult(PRErrorCode errorCode) override;

  void ClientAuthCertificateSelected(
      nsTArray<uint8_t>& certBytes,
      nsTArray<nsTArray<uint8_t>>& certChainBytes);

  bool IsWaitingForCertVerification() const {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    return mCertVerificationState == WaitingForCertVerification;
  }
  void AddPlaintextBytesRead(uint64_t val) {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    mPlaintextBytesRead += val;
  }

  bool IsPreliminaryHandshakeDone() const {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    return mPreliminaryHandshakeDone;
  }
  void SetPreliminaryHandshakeDone() {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    mPreliminaryHandshakeDone = true;
  }

  void SetKEAUsed(int16_t kea) {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    mKEAUsed = kea;
  }

  void SetKEAKeyBits(uint32_t keaBits) {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    mKEAKeyBits = keaBits;
  }

  void SetMACAlgorithmUsed(int16_t mac) {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    mMACAlgorithmUsed = mac;
  }

  void SetShortWritePending(const void* data, size_t amount) {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    MOZ_ASSERT(mMaybeShortWrite.isNothing());
    nsTArray<uint8_t> shortWrite(amount);
    shortWrite.AppendElements(
        reinterpret_cast<uint8_t*>(const_cast<void*>(data)), amount);
    mMaybeShortWrite.emplace(std::move(shortWrite));
  }

  bool IsShortWritePending() {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    return mMaybeShortWrite.isSome();
  }

  size_t ResetShortWritePending() {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    MOZ_ASSERT(mMaybeShortWrite.isSome());
    size_t shortWriteLength = mMaybeShortWrite->Length();
    mMaybeShortWrite.reset();
    return shortWriteLength;
  }

  // Ensure that the caller is trying to send the same data as it was
  // previously when we hit the short-write. To do otherwise would be an error.
  const void* CheckShortWriteBuffer(const void* data, int32_t amount) {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    MOZ_ASSERT(mMaybeShortWrite.isSome());
    if (mMaybeShortWrite.isNothing()) {
      return nullptr;
    }
    MOZ_ASSERT(amount > 0);
    if (amount <= 0) {
      return nullptr;
    }
    if (static_cast<size_t>(amount) < mMaybeShortWrite->Length()) {
      return nullptr;
    }
    if (mozilla::Span(*mMaybeShortWrite) !=
        mozilla::Span(reinterpret_cast<uint8_t*>(const_cast<void*>(data)),
                      mMaybeShortWrite->Length())) {
      return nullptr;
    }
    // Return a pointer to the byte that has yet to be written.
    return static_cast<const uint8_t*>(data) + mMaybeShortWrite->Length() - 1;
  }

  void SetSharedOwningReference(mozilla::psm::SharedSSLState* ref);

  nsresult SetResumptionTokenFromExternalCache(PRFileDesc* fd);

  void SetPreliminaryHandshakeInfo(const SSLChannelInfo& channelInfo,
                                   const SSLCipherSuiteInfo& cipherInfo);

  void SetPendingSelectClientAuthCertificate(
      nsCOMPtr<nsIRunnable>&& selectClientAuthCertificate) {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    MOZ_LOG(
        gPIPNSSLog, mozilla::LogLevel::Debug,
        ("[%p] setting pending select client auth certificate", (void*)mFd));
    // If the connection corresponding to this socket hasn't been claimed, it
    // is a speculative connection. The connection will block until the "choose
    // a client auth certificate" dialog has been shown. The dialog will only
    // be shown when this connection gets claimed. However, necko will never
    // claim the connection as long as it is blocking. Thus, this connection
    // can't proceed, so it's best to cancel it. Necko will create a new,
    // non-speculative connection instead.
    if (!mClaimed) {
      SetCanceled(PR_CONNECT_RESET_ERROR);
    } else {
      mPendingSelectClientAuthCertificate =
          std::move(selectClientAuthCertificate);
    }
  }

  void MaybeDispatchSelectClientAuthCertificate() {
    COMMON_SOCKET_CONTROL_ASSERT_ON_OWNING_THREAD();
    if (!IsWaitingForCertVerification() && mClaimed &&
        mPendingSelectClientAuthCertificate) {
      MOZ_LOG(gPIPNSSLog, mozilla::LogLevel::Debug,
              ("[%p] dispatching pending select client auth certificate",
               (void*)mFd));
      mozilla::Unused << NS_DispatchToMainThread(
          mPendingSelectClientAuthCertificate);
      mPendingSelectClientAuthCertificate = nullptr;
    }
  }

 private:
  ~NSSSocketControl() = default;

  PRFileDesc* mFd;

  CertVerificationState mCertVerificationState;

  mozilla::psm::SharedSSLState& mSharedState;
  bool mForSTARTTLS;
  SSLVersionRange mTLSVersionRange;
  bool mHandshakePending;
  bool mPreliminaryHandshakeDone;  // after false start items are complete

  nsresult ActivateSSL();

  nsCString mEsniTxt;
  nsCString mEchConfig;
  bool mEarlyDataAccepted;
  bool mDenyClientCert;
  bool mFalseStartCallbackCalled;
  bool mFalseStarted;
  bool mIsFullHandshake;
  bool mNotedTimeUntilReady;
  EchExtensionStatus mEchExtensionStatus;  // Currently only used for telemetry.

  // If libssl has indicated a "short write", the layer above PSM must retry
  // sending the exact same data. If this is Some, all but the last byte has
  // already been written to libssl.
  mozilla::Maybe<nsTArray<uint8_t>> mMaybeShortWrite;

  // mKEA* are used in false start and http/2 detetermination
  // Values are from nsITLSSocketControl
  int16_t mKEAUsed;
  uint32_t mKEAKeyBits;
  int16_t mMACAlgorithmUsed;

  uint32_t mProviderTlsFlags;
  mozilla::TimeStamp mSocketCreationTimestamp;
  uint64_t mPlaintextBytesRead;

  bool mClaimed;
  nsCOMPtr<nsIRunnable> mPendingSelectClientAuthCertificate;

  // Regarding the client certificate message in the TLS handshake, RFC 5246
  // (TLS 1.2) says:
  //   If the certificate_authorities list in the certificate request
  //   message was non-empty, one of the certificates in the certificate
  //   chain SHOULD be issued by one of the listed CAs.
  // (RFC 8446 (TLS 1.3) has a similar provision)
  // These certificates may be known to gecko but not NSS (e.g. enterprise
  // intermediates). In order to make these certificates discoverable to NSS
  // so it can include them in the message, we cache them here as temporary
  // certificates.
  mozilla::UniqueCERTCertList mClientCertChain;

  // if non-null this is a reference to the mSharedState (which is
  // not an owning reference). If this is used, the info has a private
  // state that does not share things like intolerance lists with the
  // rest of the session. This is normally used when you have per
  // socket tls flags overriding session wide defaults.
  RefPtr<mozilla::psm::SharedSSLState> mOwningSharedRef;

  nsCOMPtr<nsITlsHandshakeCallbackListener> mTlsHandshakeCallback;
};

#endif  // NSSSocketControl_h
