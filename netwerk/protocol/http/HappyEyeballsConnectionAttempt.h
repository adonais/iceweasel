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

namespace mozilla {
namespace net {

class HttpConnectionUDP;
class nsHttpConnection;

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

class HappyEyeballsConnectionAttempt final : public ConnectionAttempt,
                                             public nsIDNSListener,
                                             public nsITimerCallback,
                                             public nsINamed {
 public:
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
  uint32_t UnconnectedUDPConnsLength() const override;

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
  nsresult DNSLookup(happy_eyeballs::DnsRecordType aType,
                     nsIDNSService::DNSFlags aFlags, uint64_t aId);

  // DNS answers
  nsresult OnARecord(nsIDNSRecord* aRecord, nsresult status, uint64_t aId);
  nsresult OnAAAARecord(nsIDNSRecord* aRecord, nsresult status, uint64_t aId);
  nsresult OnHTTPSRecord(nsIDNSRecord* aRecord, nsresult status, uint64_t aId);

  // Connection Attempt
  nsresult EstablishTCPConnection(NetAddr aAddr, uint16_t aPort,
                                  nsTArray<uint8_t>&& aEchConfig, uint64_t aId);
  void HandleTCPConnectionResult(
      Result<RefPtr<HttpConnectionBase>, nsresult> aResult,
      TCPConnectionEstablisher* aEstablisher, uint64_t aId);
  void CancelConnection(uint64_t aId);
  nsresult EstablishUDPConnection(NetAddr aAddr, uint16_t aPort,
                                  nsTArray<uint8_t>&& aEchConfig, uint64_t aId);
  void HandleUDPConnectionResult(
      Result<RefPtr<HttpConnectionBase>, nsresult> aResult,
      UDPConnectionEstablisher* aEstablisher, uint64_t aId);

  // Timer
  void SetupTimer(uint64_t aTimeout);

  void OnSucceeded();
  void ProcessTCPConn(nsHttpConnection* aConn, ConnectionEntry* aEntry);
  void ProcessUDPConn(HttpConnectionUDP* aConn, ConnectionEntry* aEntry);

  RefPtr<HappyEyeballs> mHappyEyeballs;

  nsCString mHost;

  nsRefPtrHashtable<nsPtrHashKey<nsICancelable>, DnsRequestInfo>
      mDnsRequestTable;

  nsRefPtrHashtable<nsUint64HashKey, ConnectionEstablisher>
      mConnectionEstablisherTable;
  RefPtr<HttpConnectionBase> mOutputConn;
  uint16_t mAddrFamily{0};

  nsCOMPtr<nsITimer> mTimer;
  WeakPtr<ConnectionEntry> mEntry;
  bool mDone = false;
  nsTHashSet<uint32_t> mSentTransportStatuses;

  TimeStamp mDomainLookupStart;
  TimeStamp mDomainLookupEnd;
  TimeStamp mFirstConnectionStart;
};

}  // namespace net
}  // namespace mozilla

#endif
