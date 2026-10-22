/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use pkcs11_bindings::*;
use rsclientcerts::cryptoki::*;
use rsclientcerts::manager::{
    ClientCertsBackend, CryptokiObject, FindObjectsCallback, Sign, SignCallback,
};
use rsclientcerts_util::error::{Error, ErrorType};
use rsclientcerts_util::error_here;
use std::ffi::c_void;

// Wrapper of C RemoteCertsDoFindObjects function implemented in nsNSSIOLayer.cpp.
fn remote_certs_do_find_objects(
    searching_for: u8,
    callback: FindObjectsCallback,
    ctx: &mut FindObjectsContext,
) {
    // `RemoteCertsDoFindObjects` queries the remote PKCS#11 module process for
    // certificates.
    unsafe extern "C" {
        fn RemoteCertsDoFindObjects(
            searching_for: u8,
            callback: FindObjectsCallback,
            ctx: *mut c_void,
        );
    }

    unsafe {
        RemoteCertsDoFindObjects(searching_for, callback, ctx as *mut _ as *mut c_void);
    }
}

// Wrapper of C RemoteCertsDoSign function implemented in nsNSSIOLayer.cpp.
fn remote_certs_do_sign(
    cert_len: usize,
    cert: *const u8,
    data_len: usize,
    data: *const u8,
    params_len: usize,
    params: *const u8,
    callback: SignCallback,
    ctx: &mut Vec<u8>,
) {
    unsafe extern "C" {
        fn RemoteCertsDoSign(
            cert_len: usize,
            cert: *const u8,
            data_len: usize,
            data: *const u8,
            params_len: usize,
            params: *const u8,
            callback: SignCallback,
            ctx: *mut c_void,
        );
    }

    unsafe {
        RemoteCertsDoSign(
            cert_len,
            cert,
            data_len,
            data,
            params_len,
            params,
            callback,
            ctx as *mut _ as *mut c_void,
        );
    }
}

pub struct Key {
    cryptoki_key: CryptokiKey,
    cert: Vec<u8>,
}

impl Key {
    fn new(
        modulus: Option<Vec<u8>>,
        ec_params: Option<Vec<u8>>,
        cert: Vec<u8>,
    ) -> Result<Key, Error> {
        Ok(Key {
            cryptoki_key: CryptokiKey::new(modulus, ec_params, &cert)?,
            cert,
        })
    }
}

impl CryptokiObject for Key {
    fn matches(&self, attrs: &[(CK_ATTRIBUTE_TYPE, Vec<u8>)]) -> bool {
        self.cryptoki_key.matches(attrs)
    }

    fn get_attribute(&self, attribute: CK_ATTRIBUTE_TYPE) -> Option<&[u8]> {
        self.cryptoki_key.get_attribute(attribute)
    }
}

impl Sign for Key {
    fn get_signature_length(
        &mut self,
        data: &[u8],
        params: &Option<CK_RSA_PKCS_PSS_PARAMS>,
    ) -> Result<usize, Error> {
        // Unfortunately we don't have a way of getting the length of a signature without creating
        // one.
        let dummy_signature_bytes = self.sign(data, params)?;
        Ok(dummy_signature_bytes.len())
    }

    fn sign(
        &mut self,
        data: &[u8],
        params: &Option<CK_RSA_PKCS_PSS_PARAMS>,
    ) -> Result<Vec<u8>, Error> {
        let mut signature = Vec::new();
        let (sign_params_len, sign_params) = match params {
            Some(params) => (
                std::mem::size_of::<CK_RSA_PKCS_PSS_PARAMS>(),
                params as *const _ as *const u8,
            ),
            None => (0, std::ptr::null()),
        };
        remote_certs_do_sign(
            self.cert.len(),
            self.cert.as_ptr(),
            data.len(),
            data.as_ptr(),
            sign_params_len,
            sign_params,
            Some(sign_callback),
            &mut signature,
        );
        // If this succeeded, return the result.
        if signature.len() > 0 {
            return Ok(signature);
        }
        // If signing failed and this is an RSA-PSS signature, perhaps the token the key is on does
        // not support RSA-PSS. In that case, emsa-pss-encode the data (hash, really) and try
        // signing with raw RSA.
        let Some(params) = params.as_ref() else {
            return Err(error_here!(ErrorType::LibraryFailure));
        };
        // `params` should only be `Some` if this is an RSA key.
        let Some(modulus) = self.cryptoki_key.modulus().as_ref() else {
            return Err(error_here!(ErrorType::LibraryFailure));
        };
        let emsa_pss_encoded = emsa_pss_encode(data, modulus_bit_length(modulus) - 1, params)?;
        remote_certs_do_sign(
            self.cert.len(),
            self.cert.as_ptr(),
            emsa_pss_encoded.len(),
            emsa_pss_encoded.as_ptr(),
            0,
            std::ptr::null(),
            Some(sign_callback),
            &mut signature,
        );
        if signature.len() > 0 {
            Ok(signature)
        } else {
            Err(error_here!(ErrorType::LibraryFailure))
        }
    }
}

unsafe extern "C" fn sign_callback(data_len: usize, data: *const u8, ctx: *mut c_void) {
    let signature: &mut Vec<u8> = unsafe { std::mem::transmute(ctx) };
    signature.clear();
    if data_len != 0 {
        signature.extend_from_slice(unsafe { std::slice::from_raw_parts(data, data_len) });
    }
}

unsafe extern "C" fn find_objects_callback(
    typ: u8,
    data_len: usize,
    data: *const u8,
    extra_len: usize,
    extra: *const u8,
    ctx: *mut c_void,
) {
    let data = if data_len == 0 || data.is_null() {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(data, data_len) }
    }
    .to_vec();
    let extra = if extra_len == 0 || extra.is_null() {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(extra, extra_len) }
    }
    .to_vec();
    let find_objects_context: &mut FindObjectsContext = unsafe { std::mem::transmute(ctx) };
    match typ {
        1 => {
            // For remotecerts, the extra data in the case of certificates is a byte indicating if
            // the certificate is a TLS server auth trust anchor. Only add trust records for trust anchors.
            if extra == &[1] {
                if let Ok(trust) =
                    CryptokiTrust::new(&data, b"remote certificate trust".to_vec(), true)
                {
                    find_objects_context.trusts.push(trust);
                }
            }
            if let Ok(cert) = CryptokiCert::new(data, b"remote certificate".to_vec()) {
                find_objects_context.certs.push(cert);
            }
        }
        2 => match Key::new(Some(data), None, extra) {
            Ok(key) => find_objects_context.keys.push(key),
            Err(_) => {}
        },
        3 => match Key::new(None, Some(data), extra) {
            Ok(key) => find_objects_context.keys.push(key),
            Err(_) => {}
        },
        _ => {}
    }
}

struct FindObjectsContext {
    certs: Vec<CryptokiCert>,
    keys: Vec<Key>,
    trusts: Vec<CryptokiTrust>,
}

impl FindObjectsContext {
    fn new() -> FindObjectsContext {
        FindObjectsContext {
            certs: Vec::new(),
            keys: Vec::new(),
            trusts: Vec::new(),
        }
    }
}

const SLOT_DESCRIPTION_BYTES: &[u8; 64] =
    b"Remote Certificates and Keys                                    ";
const TOKEN_LABEL_BYTES: &[u8; 32] = b"Remote Certificates and Keys    ";
const TOKEN_MODEL_BYTES: &[u8; 16] = b"remotecerts     ";
const TOKEN_SERIAL_NUMBER_BYTES: &[u8; 16] = b"0000000000000000";

unsafe extern "C" {
    fn IsGeckoSearchingForClientAuthCertificates(unique_slot_id: u64) -> bool;
    fn IsGeckoSearchingForCertificates(unique_slot_id: u64) -> bool;
}

const UNIQUE_MODULE_ID: u64 = (u32::from_be_bytes(*b"RCRT") as u64) << 32;

// Keep these in sync with `SearchingFor` in PSMIPCUtils.h
const SEARCHING_FOR_CLIENT_CERTIFICATES: u8 = 1;
const SEARCHING_FOR_CA_CERTIFICATES: u8 = 2;

pub struct Backend {}

impl Backend {
    pub fn new() -> Backend {
        Backend {}
    }
}

impl ClientCertsBackend for Backend {
    type Key = Key;

    fn find_objects(
        &mut self,
        slot_id: CK_SLOT_ID,
    ) -> Result<Option<(Vec<CryptokiCert>, Vec<Key>, Vec<CryptokiTrust>)>, Error> {
        let searching_for = if unsafe {
            IsGeckoSearchingForClientAuthCertificates(UNIQUE_MODULE_ID | (slot_id as u64))
        } {
            SEARCHING_FOR_CLIENT_CERTIFICATES
        } else if unsafe { IsGeckoSearchingForCertificates(UNIQUE_MODULE_ID | (slot_id as u64)) } {
            SEARCHING_FOR_CA_CERTIFICATES
        } else {
            return Ok(None);
        };

        let mut find_objects_context = FindObjectsContext::new();
        remote_certs_do_find_objects(
            searching_for,
            Some(find_objects_callback),
            &mut find_objects_context,
        );
        Ok(Some((
            find_objects_context.certs,
            find_objects_context.keys,
            find_objects_context.trusts,
        )))
    }

    fn get_slot_info(&self) -> CK_SLOT_INFO {
        CK_SLOT_INFO {
            slotDescription: *SLOT_DESCRIPTION_BYTES,
            manufacturerID: *crate::MANUFACTURER_ID_BYTES,
            flags: CKF_TOKEN_PRESENT,
            ..Default::default()
        }
    }

    fn get_token_info(&self) -> CK_TOKEN_INFO {
        CK_TOKEN_INFO {
            label: *TOKEN_LABEL_BYTES,
            manufacturerID: *crate::MANUFACTURER_ID_BYTES,
            model: *TOKEN_MODEL_BYTES,
            serialNumber: *TOKEN_SERIAL_NUMBER_BYTES,
            ..Default::default()
        }
    }

    fn get_mechanism_list(&self) -> Vec<CK_MECHANISM_TYPE> {
        vec![CKM_ECDSA, CKM_RSA_PKCS, CKM_RSA_PKCS_PSS]
    }
}
