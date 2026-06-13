/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PKCS11Token.h"
#include "ScopedNSSTypes.h"
#include "mozilla/Casting.h"
#include "mozilla/Logging.h"
#include "nsISupports.h"
#include "nsNSSCertHelper.h"
#include "nsNSSComponent.h"
#include "nsPromiseFlatString.h"
#include "nsReadableUtils.h"
#include "nsServiceManagerUtils.h"
#include "prerror.h"
#include "secerr.h"

extern mozilla::LazyLogModule gPIPNSSLog;

NS_IMPL_ISUPPORTS(PKCS11Token, nsIPKCS11Token)

PKCS11Token::PKCS11Token() : mUIContext(new PipUIContext()) {}

nsresult PKCS11Token::Init() {
  static NS_DEFINE_CID(kNSSComponentCID, NS_NSSCOMPONENT_CID);
  nsCOMPtr<nsINSSComponent> nss(do_GetService(kNSSComponentCID));
  if (!nss) {
    return NS_ERROR_FAILURE;
  }
  mSlot.reset(PK11_GetInternalKeySlot());
  mIsInternalCryptoToken = false;
  mIsInternalKeyToken = true;
  mSeries = PK11_GetSlotSeries(mSlot.get());
  return refreshTokenInfo();
}

PKCS11Token::PKCS11Token(PK11SlotInfo* slot) : mUIContext(new PipUIContext()) {
  MOZ_ASSERT(slot);
  mSlot.reset(PK11_ReferenceSlot(slot));
  mIsInternalCryptoToken =
      PK11_IsInternal(mSlot.get()) && !PK11_IsInternalKeySlot(mSlot.get());
  mIsInternalKeyToken = PK11_IsInternalKeySlot(mSlot.get());
  mSeries = PK11_GetSlotSeries(slot);
  (void)refreshTokenInfo();
}

nsresult PKCS11Token::refreshTokenInfo() {
  if (mIsInternalCryptoToken) {
    nsresult rv;
    if (PK11_IsFIPS()) {
      rv = GetPIPNSSBundleString("Fips140TokenDescription", mTokenName);
    } else {
      rv = GetPIPNSSBundleString("TokenDescription", mTokenName);
    }
    if (NS_FAILED(rv)) {
      return rv;
    }
  } else if (mIsInternalKeyToken) {
    nsresult rv = GetPIPNSSBundleString("PrivateTokenDescription", mTokenName);
    if (NS_FAILED(rv)) {
      return rv;
    }
  } else {
    mTokenName.Assign(PK11_GetTokenName(mSlot.get()));
  }

  CK_TOKEN_INFO tokInfo;
  nsresult rv = mozilla::MapSECStatus(PK11_GetTokenInfo(mSlot.get(), &tokInfo));
  if (NS_FAILED(rv)) {
    return rv;
  }

  // Set the Manufacturer field
  if (mIsInternalCryptoToken || mIsInternalKeyToken) {
    rv = GetPIPNSSBundleString("ManufacturerID", mTokenManufacturerID);
    if (NS_FAILED(rv)) {
      return rv;
    }
  } else {
    const char* ccManID =
        mozilla::BitwiseCast<char*, CK_UTF8CHAR*>(tokInfo.manufacturerID);
    mTokenManufacturerID.Assign(
        ccManID, strnlen(ccManID, sizeof(tokInfo.manufacturerID)));
    mTokenManufacturerID.Trim(" ", false, true);
  }

  // Set the Hardware Version field
  mTokenHWVersion.Truncate();
  mTokenHWVersion.AppendInt(tokInfo.hardwareVersion.major);
  mTokenHWVersion.Append('.');
  mTokenHWVersion.AppendInt(tokInfo.hardwareVersion.minor);

  // Set the Firmware Version field
  mTokenFWVersion.Truncate();
  mTokenFWVersion.AppendInt(tokInfo.firmwareVersion.major);
  mTokenFWVersion.Append('.');
  mTokenFWVersion.AppendInt(tokInfo.firmwareVersion.minor);

  // Set the Serial Number field
  const char* ccSerial =
      mozilla::BitwiseCast<char*, CK_CHAR*>(tokInfo.serialNumber);
  mTokenSerialNum.Assign(ccSerial,
                         strnlen(ccSerial, sizeof(tokInfo.serialNumber)));
  mTokenSerialNum.Trim(" ", false, true);

  return NS_OK;
}

nsresult PKCS11Token::GetAttributeHelper(const nsACString& attribute,
                                         /*out*/ nsACString& xpcomOutParam) {
  // Handle removals/insertions.
  if (PK11_GetSlotSeries(mSlot.get()) != mSeries) {
    nsresult rv = refreshTokenInfo();
    if (NS_FAILED(rv)) {
      return rv;
    }
  }

  xpcomOutParam = attribute;
  return NS_OK;
}

NS_IMETHODIMP
PKCS11Token::GetTokenName(/*out*/ nsACString& tokenName) {
  return GetAttributeHelper(mTokenName, tokenName);
}

NS_IMETHODIMP
PKCS11Token::GetIsInternalKeyToken(/*out*/ bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = mIsInternalKeyToken;
  return NS_OK;
}

NS_IMETHODIMP
PKCS11Token::GetTokenManID(/*out*/ nsACString& tokenManufacturerID) {
  return GetAttributeHelper(mTokenManufacturerID, tokenManufacturerID);
}

NS_IMETHODIMP
PKCS11Token::GetTokenHWVersion(/*out*/ nsACString& tokenHWVersion) {
  return GetAttributeHelper(mTokenHWVersion, tokenHWVersion);
}

NS_IMETHODIMP
PKCS11Token::GetTokenFWVersion(/*out*/ nsACString& tokenFWVersion) {
  return GetAttributeHelper(mTokenFWVersion, tokenFWVersion);
}

NS_IMETHODIMP
PKCS11Token::GetTokenSerialNumber(/*out*/ nsACString& tokenSerialNum) {
  return GetAttributeHelper(mTokenSerialNum, tokenSerialNum);
}

NS_IMETHODIMP
PKCS11Token::IsLoggedIn(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = PK11_IsLoggedIn(mSlot.get(), 0);
  return NS_OK;
}

NS_IMETHODIMP
PKCS11Token::Login(bool force) {
  bool test;
  nsresult rv = this->NeedsLogin(&test);
  if (NS_FAILED(rv)) {
    return rv;
  }
  if (test && force) {
    rv = this->LogoutSimple();
    if (NS_FAILED(rv)) {
      return rv;
    }
  }

  return mozilla::MapSECStatus(
      PK11_Authenticate(mSlot.get(), true, mUIContext));
}

NS_IMETHODIMP
PKCS11Token::LogoutSimple() {
  // PK11_Logout() can fail if the user wasn't logged in beforehand. We want
  // this method to succeed even in this case, so we ignore the return value.
  (void)PK11_Logout(mSlot.get());
  return NS_OK;
}

NS_IMETHODIMP
PKCS11Token::LogoutAndDropAuthenticatedResources() {
  static NS_DEFINE_CID(kNSSComponentCID, NS_NSSCOMPONENT_CID);

  nsresult rv = LogoutSimple();

  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsINSSComponent> nssComponent(do_GetService(kNSSComponentCID, &rv));
  if (NS_FAILED(rv)) return rv;

  return nssComponent->LogoutAuthenticatedPK11();
}

NS_IMETHODIMP
PKCS11Token::Reset() {
  return mozilla::MapSECStatus(PK11_ResetToken(mSlot.get(), nullptr));
}

NS_IMETHODIMP
PKCS11Token::GetNeedsUserInit(bool* aNeedsUserInit) {
  NS_ENSURE_ARG_POINTER(aNeedsUserInit);
  *aNeedsUserInit = PK11_NeedUserInit(mSlot.get());
  return NS_OK;
}

NS_IMETHODIMP
PKCS11Token::CheckPassword(const nsACString& password, bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  SECStatus srv =
      PK11_CheckUserPassword(mSlot.get(), PromiseFlatCString(password).get());
  if (srv != SECSuccess) {
    *_retval = false;
    PRErrorCode error = PR_GetError();
    if (error != SEC_ERROR_BAD_PASSWORD) {
      /* something really bad happened - throw an exception */
      return mozilla::psm::GetXPCOMFromNSSError(error);
    }
  } else {
    *_retval = true;
  }
  return NS_OK;
}

NS_IMETHODIMP
PKCS11Token::InitPassword(const nsACString& initialPassword) {
  const nsCString& passwordCStr = PromiseFlatCString(initialPassword);
  // PSM initializes the sqlite-backed softoken with an empty password. The
  // implementation considers this not to be a password (GetHasPassword returns
  // false), but we can't actually call PK11_InitPin again. Instead, we call
  // PK11_ChangePW with the empty password.
  bool hasPassword;
  nsresult rv = GetHasPassword(&hasPassword);
  if (NS_FAILED(rv)) {
    return rv;
  }
  if (!PK11_NeedUserInit(mSlot.get()) && !hasPassword) {
    return mozilla::MapSECStatus(
        PK11_ChangePW(mSlot.get(), "", passwordCStr.get()));
  }
  return mozilla::MapSECStatus(
      PK11_InitPin(mSlot.get(), "", passwordCStr.get()));
}

NS_IMETHODIMP
PKCS11Token::ChangePassword(const nsACString& oldPassword,
                            const nsACString& newPassword) {
  // PK11_ChangePW() has different semantics for the empty string and for
  // nullptr. In order to support this difference, we need to check IsVoid() to
  // find out if our caller supplied null/undefined args or just empty strings.
  // See Bug 447589.
  return mozilla::MapSECStatus(PK11_ChangePW(
      mSlot.get(),
      oldPassword.IsVoid() ? nullptr : PromiseFlatCString(oldPassword).get(),
      newPassword.IsVoid() ? nullptr : PromiseFlatCString(newPassword).get()));
}

NS_IMETHODIMP
PKCS11Token::GetHasPassword(bool* hasPassword) {
  NS_ENSURE_ARG_POINTER(hasPassword);
  // PK11_NeedLogin returns true if the token is currently configured to require
  // the user to log in (whether or not the user is actually logged in makes no
  // difference).
  *hasPassword = PK11_NeedLogin(mSlot.get()) && !PK11_NeedUserInit(mSlot.get());
  return NS_OK;
}

NS_IMETHODIMP
PKCS11Token::NeedsLogin(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = PK11_NeedLogin(mSlot.get());
  return NS_OK;
}
