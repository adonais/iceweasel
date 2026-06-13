/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef HappyEyeballsConnectionAttempt_h_
#define HappyEyeballsConnectionAttempt_h_

#include "ConnectionAttempt.h"
#include "nsAHttpConnection.h"
#include "nsICancelable.h"
#include "nsIDNSListener.h"
#include "mozilla/Result.h"
#include "nsTHashSet.h"
#include "happy_eyeballs_glue/HappyEyeballs.h"
#include "ConnectionEstablisher.h"
#include "HappyEyeballsTransaction.h"

namespace mozilla {
namespace net {

class HttpConnectionUDP;
class nsHttpConnection;
class PendingTransactionInfo;

class DnsRequestInfo final {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(DnsRequestInfo)

  DnsRequestInfo(uint64_t aId, happy_eyeballs::DnsRecordType aType)
      : mId(aId), mType(aType) {}

  uint64_t Id() const { return mId; }
  happy_eyeballs::DnsRecordType Type() const { return mType; }
  void SetRequest(nsICancelable* aRequest) { mRequest = aRequest; }

  void Cancel() {
    if (mRequest) {
      mRequest->Cancel(NS_ERROR_ABORT);
      mRequest = nullptr;
    }
  }

 private:
  ~DnsRequestInfo() = default;

  uint64_t mId = 0;
  happy_eyeballs::DnsRecordType mType = happy_eyeballs::DnsRecordType::A;
  nsCOMPtr<nsICancelable> mRequest;
};

#define NS_HAPPYEYEBALLSCONNECTIONATTEMPT_IID \
  {0x3d2e8a41, 0x9c5b, 0x4f6e, {0xa1, 0x02, 0x2b, 0x7c, 0x8e, 0x4d, 0x6f, 0x90}}

class HappyEyeballsConnectionAttempt final : public ConnectionAttempt,
                                             public nsIDNSListener,
                                             public nsITimerCallback,
                                             public nsINamed {
 public:
  NS_INLINE_DECL_STATIC_IID(NS_HAPPYEYEBALLSCONNECTIONATTEMPT_IID)

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIDNSLISTENER
  NS_DECL_NSITIMERCALLBACK
  NS_DECL_NSINAMED

  HappyEyeballsConnectionAttempt(nsHttpConnectionInfo* ci,
                                 nsAHttpTransaction* trans, uint32_t caps,
                                 bool speculative, bool urgentStart);

  nsresult Init(ConnectionEntry* ent) override;
  void Abandon() override;
  double Duration(TimeStamp epoch) override;
  void OnTimeout() override;
  void PrintDiagnostics(nsCString& log) override;
  bool Claim(nsHttpTransaction* newTransaction = nullptr) override;
  // No-op: HE attempts are 1:1 owned by their creator transaction. See
  // ConnectionAttempt::Unclaim's comment for the failure mode this
  // override prevents.
  void Unclaim() override {}
  uint32_t UnconnectedUDPConnsLength() const override;

  // Real transaction accessor, used by the shared ZeroRttHandle.
  nsHttpTransaction* RealHttpTransaction() const {
    return mTransaction ? mTransaction->QueryHttpTransaction() : nullptr;
  }

  // Called by ZeroRttHandle::Finish0RTT on the winning HT. Pulls the
  // real nsHttpTransaction out of the pending queue (so a reject-path
  // real_txn.Close → Restart doesn't trip the pending-queue assertion,
  // and so OnSucceeded won't re-dispatch it) and calls
  // aWinner->Adopt(). No-op if the HE race was started without a
  // real txn yet (speculative entry) or the txn can't be queried.
  void AdoptWinner(HappyEyeballsTransaction* aWinner);

  // Remove the real nsHttpTransaction from this entry's pending queue
  // if it's still there. Returns true if the trans was found and
  // removed, false if it was already gone (dispatched elsewhere).
  // Called by ZeroRttHandle at the first Do0RTT acceptance: if the
  // trans is already gone (returns false), Do0RTT must decline 0-RTT
  // so we don't put early-data bytes on the wire for a trans that is
  // already being served by a different connection.
  bool LockInRealTxnFromPendingQueue();

 private:
  ~HappyEyeballsConnectionAttempt();

  nsresult CreateHappyEyeballs(ConnectionEntry* ent);

  nsresult ProcessConnectionResult(const NetAddr& aAddr, nsresult aStatus,
                                   uint64_t aId);
  nsresult ProcessHappyEyeballsOutput();
  void MaybeSendTransportStatus(nsresult aStatus,
                                nsITransport* aTransport = nullptr,
                                int64_t aProgress = 0);

  // DNS lookups
  Result<nsIDNSService::DNSFlags, nsresult> SetupDnsFlags(
      happy_eyeballs::DnsRecordType aType);
  void DNSLookup(happy_eyeballs::DnsRecordType aType,
                 Result<nsIDNSService::DNSFlags, nsresult> aFlags, uint64_t aId,
                 const nsACString& aHostname);

  // DNS answers
  nsresult OnARecord(nsIDNSRecord* aRecord, nsresult status, uint64_t aId);
  nsresult OnAAAARecord(nsIDNSRecord* aRecord, nsresult status, uint64_t aId);
  nsresult OnHTTPSRecord(nsIDNSRecord* aRecord, nsresult status, uint64_t aId);

  // Connection Attempt
  // Build a per-establisher HappyEyeballsTransaction wired up to forward
  // its OnTransportStatus events back through MaybeSendTransportStatus
  // for dedup + propagation to the real transaction.
  already_AddRefed<HappyEyeballsTransaction> CreateAttemptTransaction(
      nsHttpConnectionInfo* aInfo);

  nsresult EstablishTCPConnection(NetAddr aAddr, uint16_t aPort,
                                  nsTArray<uint8_t>&& aEchConfig, uint64_t aId);
  void HandleTCPConnectionResult(
      Result<RefPtr<HttpConnectionBase>, nsresult> aResult,
      TCPConnectionEstablisher* aEstablisher, uint64_t aId);
  // If 0-RTT was active, forward the connection's security info to the real
  // transaction so MaybeRemoveSSLToken() in nsHttpTransaction::Restart() can
  // clear the SSL token cache for the retry.
  void MaybeForward0RTTSecurityInfo(ConnectionEstablisher* aEstablisher);
  void CancelConnection(uint64_t aId);
  nsresult EstablishUDPConnection(NetAddr aAddr, uint16_t aPort,
                                  nsTArray<uint8_t>&& aEchConfig, uint64_t aId);
  void HandleUDPConnectionResult(
      Result<RefPtr<HttpConnectionBase>, nsresult> aResult,
      UDPConnectionEstablisher* aEstablisher, uint64_t aId);

  nsresult CheckLNA(nsISocketTransport* aTransport);
  nsresult CheckLNAForAddr(const NetAddr& aAddr);

  // Timer
  void SetupTimer(uint64_t aTimeout);

  void OnSucceeded();
  void ProcessTCPConn(nsHttpConnection* aConn, ConnectionEntry* aEntry,
                      bool aTransactionAlreadyOnConn);
  void ProcessUDPConn(HttpConnectionUDP* aConn, ConnectionEntry* aEntry,
                      bool aTransactionAlreadyOnConn);
  void CloseHttpTransaction(happy_eyeballs::FailureReason aReason);

  RefPtr<HappyEyeballs> mHappyEyeballs;

  nsCString mHost;

  nsRefPtrHashtable<nsPtrHashKey<nsICancelable>, DnsRequestInfo>
      mDnsRequestTable;

  nsRefPtrHashtable<nsUint64HashKey, ConnectionEstablisher>
      mConnectionEstablisherTable;
  RefPtr<HttpConnectionBase> mOutputConn;
  // Winning establisher's per-attempt transaction; used to read its
  // collected handshake timings before we dispatch the real transaction.
  RefPtr<HappyEyeballsTransaction> mOutputTrans;
  uint64_t mOutputConnId{0};
  uint16_t mAddrFamily{0};

  nsCOMPtr<nsITimer> mTimer;
  WeakPtr<ConnectionEntry> mEntry;
  bool mDone = false;
  nsresult mLastConnectionError = NS_OK;
  nsresult mLastDnsError = NS_OK;
  nsTHashSet<uint32_t> mSentTransportStatuses;

  // Shared 0-RTT coordinator. Created lazily (first time we hand out a
  // per-attempt HappyEyeballsTransaction) and passed to every racer.
  RefPtr<ZeroRttHandle> mZeroRttHandle;

  DnsMetadata mDnsMetadata;
  bool mTRRInfoForwarded = false;

  TimeStamp mDomainLookupStart;
  TimeStamp mDomainLookupEnd;
  TimeStamp mFirstConnectionStart;
};

}  // namespace net
}  // namespace mozilla

#endif
