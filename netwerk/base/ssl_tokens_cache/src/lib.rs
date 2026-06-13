/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use flate2::{read::ZlibDecoder, write::ZlibEncoder, Compression};
use log::warn;
use nsstring::nsCString;
use serde::{Deserialize, Serialize};
use static_assertions::const_assert;
use std::ffi::c_void;
use std::io::{Read as _, Write as _};
use std::path::Path;
use thin_vec::ThinVec;

/// Callback type for [`ssl_tokens_cache_read`].
pub type SslTokensReadCallback =
    unsafe extern "C" fn(ctx: *mut c_void, record: *const SslTokensPersistedRecord);

/// FFI-safe representation of one persisted token record.
/// All cert chain fields are included so that PSK-resumed TLS 1.3
/// connections (which receive no Certificate message from the server)
/// can reconstruct full security info after a browser restart.
#[repr(C)]
pub struct SslTokensPersistedRecord {
    pub id: u64,
    pub key: nsCString,
    pub expiration_time: PrTime,
    pub token: *const u8,
    pub token_len: usize,
    pub ev_status: u8,
    pub ct_status: u16,
    pub overridable_error: u8,
    pub server_cert: ThinVec<u8>,
    pub succeeded_cert_chain: ThinVec<ThinVec<u8>>,
    pub handshake_certs: ThinVec<ThinVec<u8>>,
    /// Empty = absent (`None`); one element = present (`Some(value)`).
    pub is_built_cert_chain_root_built_in_root: ThinVec<bool>,
}

#[derive(Clone, Serialize, Deserialize)]
#[expect(
    clippy::unsafe_derive_deserialize,
    reason = "from_record is unrelated to deserialization"
)]
struct PersistedRecord {
    id: u64,
    key: Vec<u8>,
    expiration_time: PrTime,
    token: Vec<u8>,
    ev_status: u8,
    ct_status: u16,
    overridable_error: u8,
    server_cert: Vec<u8>,
    succeeded_cert_chain: Option<Vec<Vec<u8>>>,
    handshake_certs: Option<Vec<Vec<u8>>>,
    is_built_cert_chain_root_built_in_root: Option<bool>,
}

impl PersistedRecord {
    fn thin_chain_to_opt(chain: &ThinVec<ThinVec<u8>>) -> Option<Vec<Vec<u8>>> {
        (!chain.is_empty()).then(|| chain.iter().map(|c| c.to_vec()).collect())
    }

    fn opt_chain_to_thin(chain: Option<&[Vec<u8>]>) -> ThinVec<ThinVec<u8>> {
        chain.map_or_else(ThinVec::new, |c| {
            c.iter().map(|b| ThinVec::from(b.as_slice())).collect()
        })
    }

    /// Constructs a `PersistedRecord` from a C-compatible record.
    ///
    /// # Safety
    ///
    /// `token` must be valid for `token_len` bytes.
    unsafe fn from_record(rec: &SslTokensPersistedRecord) -> Self {
        let key = rec.key.as_ref().to_vec();
        // SAFETY: token is valid for token_len bytes.
        let token = unsafe { std::slice::from_raw_parts(rec.token, rec.token_len) }.to_vec();
        Self {
            id: rec.id,
            key,
            expiration_time: rec.expiration_time,
            token,
            ev_status: rec.ev_status,
            ct_status: rec.ct_status,
            overridable_error: rec.overridable_error,
            server_cert: rec.server_cert.to_vec(),
            succeeded_cert_chain: Self::thin_chain_to_opt(&rec.succeeded_cert_chain),
            handshake_certs: Self::thin_chain_to_opt(&rec.handshake_certs),
            is_built_cert_chain_root_built_in_root: rec
                .is_built_cert_chain_root_built_in_root
                .first()
                .copied(),
        }
    }

    /// Constructs a stack-allocated `SslTokensPersistedRecord` that partially
    /// borrows from `self` (the `token` raw pointer) and partially copies (cert
    /// chain fields) and passes it to `f`. The record must not escape `f`.
    fn with_record<F: FnOnce(&SslTokensPersistedRecord)>(&self, f: F) {
        let rec = SslTokensPersistedRecord {
            id: self.id,
            key: nsCString::from(self.key.as_slice()),
            expiration_time: self.expiration_time,
            token: self.token.as_ptr(),
            token_len: self.token.len(),
            ev_status: self.ev_status,
            ct_status: self.ct_status,
            overridable_error: self.overridable_error,
            server_cert: ThinVec::from(self.server_cert.as_slice()),
            succeeded_cert_chain: Self::opt_chain_to_thin(self.succeeded_cert_chain.as_deref()),
            handshake_certs: Self::opt_chain_to_thin(self.handshake_certs.as_deref()),
            is_built_cert_chain_root_built_in_root: self
                .is_built_cert_chain_root_built_in_root
                .into_iter()
                .collect(),
        };
        f(&rec);
    }
}

/// Microseconds since the Unix epoch, matching the C++ `PRTime` type.
type PrTime = i64;

const MAGIC: [u8; 4] = *b"STCF";
const VERSION: u8 = 2;
/// Derived from the header layout: magic(4) + version(1).
/// Integrity is provided by the Adler-32 embedded in the zlib stream.
const HEADER_SIZE: usize = MAGIC.len() + size_of::<u8>();
const_assert!(HEADER_SIZE == 5);
/// Maximum allowed size for the compressed body and decompressed payload.
const MAX_PAYLOAD_SIZE: usize = 16 * 1024 * 1024;

#[derive(Debug)]
enum ParseError {
    BadMagic,
    BadVersion,
    Truncated,
}

/// Zlib-compresses `data` using default compression. The embedded Adler-32
/// checksum allows `zlib_decompress` to detect corruption or tampering.
fn zlib_compress(data: &[u8]) -> Option<Vec<u8>> {
    let mut enc = ZlibEncoder::new(Vec::new(), Compression::default());
    enc.write_all(data).ok()?;
    enc.finish().ok()
}

/// Zlib-decompresses `data`, verifying the embedded Adler-32 checksum.
/// Returns `None` on corruption, tampering, or if the output exceeds
/// `MAX_PAYLOAD_SIZE`.
fn zlib_decompress(data: &[u8]) -> Option<Vec<u8>> {
    if data.len() > MAX_PAYLOAD_SIZE {
        return None;
    }
    let mut out = Vec::new();
    ZlibDecoder::new(data)
        .take(MAX_PAYLOAD_SIZE as u64 + 1)
        .read_to_end(&mut out)
        .ok()?;
    if out.len() > MAX_PAYLOAD_SIZE {
        return None;
    }
    Some(out)
}

fn to_file_bytes(records: &[PersistedRecord], magic: [u8; 4]) -> Vec<u8> {
    let record_bytes = bincode::serialize(records).unwrap_or_default();
    let body = zlib_compress(&record_bytes).unwrap_or_default();
    let mut out = Vec::with_capacity(HEADER_SIZE + body.len());
    out.extend_from_slice(&magic);
    out.push(VERSION);
    out.extend_from_slice(&body);
    out
}

fn from_file_bytes(
    data: &[u8],
    expected_magic: [u8; 4],
) -> Result<Vec<PersistedRecord>, ParseError> {
    // Destructure the fixed header in one slice pattern — avoids repeated indexing.
    let Some(([magic @ .., version], body)) = data.split_first_chunk::<HEADER_SIZE>() else {
        return Err(ParseError::Truncated);
    };
    if magic != &expected_magic {
        return Err(ParseError::BadMagic);
    }
    if *version != VERSION {
        return Err(ParseError::BadVersion);
    }
    let record_bytes = zlib_decompress(body).ok_or(ParseError::Truncated)?;
    bincode::deserialize::<Vec<PersistedRecord>>(&record_bytes).map_err(|_| ParseError::Truncated)
}

/// Reads `bin_path`, falling back to `bin_path.with_extension("tmp")` if the
/// canonical file is absent (crash-mid-rename recovery). Discards a stale .tmp
/// when the .bin is present. Returns `(data, loaded_from_tmp)` or `None`.
fn read_file_with_tmp_fallback(bin_path: &Path) -> Option<(Vec<u8>, bool)> {
    let tmp_path = bin_path.with_extension("tmp");
    std::fs::read(bin_path)
        .map(|data| {
            _ = std::fs::remove_file(&tmp_path);
            (data, false)
        })
        .or_else(|_| std::fs::read(&tmp_path).map(|data| (data, true)))
        .ok()
}

fn nscstring_as_path(s: &nsCString) -> Option<&Path> {
    std::str::from_utf8(s.as_ref()).ok().map(Path::new)
}

fn write_atomically(buf: &[u8], bin_path: &Path) -> std::io::Result<()> {
    let tmp_path = bin_path.with_extension("tmp");
    let mut f = std::fs::File::create(&tmp_path)?; // nosemgrep
    f.write_all(buf)?;
    f.sync_all()?;
    std::fs::rename(tmp_path, bin_path)
}

/// Calls `callback` for each non-expired record, passing a stack-allocated FFI
/// struct. The pointer passed to the callback is only valid during the call.
///
/// # Safety
///
/// `callback` must be a valid function pointer. `ctx` must remain valid for the
/// duration of this call.
unsafe fn dispatch_records(
    records: &[PersistedRecord],
    now: PrTime,
    callback: SslTokensReadCallback,
    ctx: *mut c_void,
) {
    for rec in records.iter().filter(|r| r.expiration_time > now) {
        // SAFETY: callback is a valid function pointer and ctx is caller-managed.
        rec.with_record(|c_rec| unsafe { callback(ctx, &raw const *c_rec) });
    }
}

/// Reads the persisted file and calls `callback` for each valid record.
///
/// # Safety
///
/// `callback` must be a valid function pointer. `ctx` must remain valid for
/// the duration of this call. The `callback` is invoked with a pointer to a
/// stack-allocated FFI struct; the pointer is only valid inside the callback.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ssl_tokens_cache_read(
    path: &nsCString,
    now: PrTime,
    callback: SslTokensReadCallback,
    ctx: *mut c_void,
) {
    let Some(bin_path) = nscstring_as_path(path) else {
        return;
    };

    let Some((data, loaded_from_tmp)) = read_file_with_tmp_fallback(bin_path) else {
        return;
    };

    let records = match from_file_bytes(&data, MAGIC) {
        Ok(r) => r,
        Err(e) => {
            let bad = if loaded_from_tmp {
                bin_path.with_extension("tmp")
            } else {
                bin_path.to_path_buf()
            };
            warn!(
                "SslTokensCache: parse error ({e:?}), discarding {}",
                bad.display()
            );
            _ = std::fs::remove_file(&bad);
            return;
        }
    };

    if loaded_from_tmp {
        _ = std::fs::rename(bin_path.with_extension("tmp"), bin_path);
    }

    // SAFETY: callback and ctx are valid for the duration of this call.
    unsafe {
        dispatch_records(&records, now, callback, ctx);
    }
}

/// Serializes `records` to STCF format, appending the bytes to `out`.
/// Stateless — does not touch any global state.
///
/// # Safety
///
/// Each record's `token` pointer must be valid and stable (no reallocation
/// of the owning buffer) for `token_len` bytes for the duration of this
/// call. `records` and `out` must be valid non-null references.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ssl_tokens_cache_serialize_snapshot(
    records: &ThinVec<SslTokensPersistedRecord>,
    out: &mut ThinVec<u8>,
) {
    let persisted: Vec<_> = records
        .iter()
        .map(|r| unsafe { PersistedRecord::from_record(r) })
        .collect();
    out.extend_from_slice(&to_file_bytes(&persisted, MAGIC));
}

/// Writes `data` atomically to `path` via the .tmp + rename dance.
///
/// # Safety
///
/// `path` and `data` must be valid non-null references.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ssl_tokens_cache_write_bytes(path: &nsCString, data: &ThinVec<u8>) {
    let Some(path) = nscstring_as_path(path) else {
        return;
    };
    if let Err(e) = write_atomically(data, path) {
        warn!("SslTokensCache: write failed: {e}");
    }
}

/// Parses an STCF-format buffer and dispatches each non-expired record to
/// `callback`.
///
/// # Safety
///
/// `data` must point to `data_len` valid bytes. `callback` must be a valid
/// function pointer. `ctx` must remain valid for the duration of this call.
/// The pointer passed to `callback` is stack-allocated and is only valid inside
/// the callback. `callback` is always invoked synchronously — it is never
/// called after this function returns, so callers may safely pass pointers to
/// stack-allocated context.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ssl_tokens_cache_deserialize_ipc(
    data: *const u8,
    data_len: usize,
    now: PrTime,
    callback: SslTokensReadCallback,
    ctx: *mut c_void,
) {
    // SAFETY: data points to data_len valid bytes per the contract.
    let bytes = unsafe { std::slice::from_raw_parts(data, data_len) };
    let records = match from_file_bytes(bytes, MAGIC) {
        Ok(r) => r,
        Err(e) => {
            warn!("SslTokensCache: IPC deserialize error ({e:?})");
            return;
        }
    };
    // SAFETY: callback and ctx are valid for the duration of this call.
    unsafe {
        dispatch_records(&records, now, callback, ctx);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    type TestResult = Result<(), Box<dyn std::error::Error>>;

    fn make_record(id: u64, key: &str, token: &[u8], expiration_time: i64) -> PersistedRecord {
        PersistedRecord {
            id,
            key: key.as_bytes().to_vec(),
            expiration_time,
            token: token.to_vec(),
            ev_status: 0,
            ct_status: 0,
            overridable_error: 0,
            server_cert: vec![1, 2, 3],
            succeeded_cert_chain: Some(vec![vec![4, 5], vec![6, 7, 8]]),
            handshake_certs: None,
            is_built_cert_chain_root_built_in_root: Some(true),
        }
    }

    // --- to_file_bytes / from_file_bytes ---

    #[test]
    fn round_trip_empty() {
        let records = from_file_bytes(&to_file_bytes(&[], MAGIC), MAGIC).expect("valid file bytes");
        assert!(records.is_empty());
    }

    #[test]
    fn round_trip_records() {
        let input = vec![
            make_record(1, "example.com:443", b"token1", i64::MAX),
            make_record(2, "other.net:443", b"tok2", 9999),
        ];
        let output =
            from_file_bytes(&to_file_bytes(&input, MAGIC), MAGIC).expect("valid file bytes");
        assert_eq!(output.len(), 2);
        assert_eq!(output[0].key, b"example.com:443");
        assert_eq!(output[0].token, b"token1");
        assert_eq!(output[0].server_cert, [1, 2, 3]);
        assert_eq!(
            output[0].succeeded_cert_chain,
            Some(vec![vec![4, 5], vec![6, 7, 8]])
        );
        assert_eq!(output[0].is_built_cert_chain_root_built_in_root, Some(true));
        assert_eq!(output[1].id, 2);
    }

    #[test]
    fn bad_magic() {
        let bytes = to_file_bytes(&[], MAGIC);
        assert!(matches!(
            from_file_bytes(&bytes, *b"XXXX"),
            Err(ParseError::BadMagic)
        ));
    }

    #[test]
    fn bad_version() {
        let mut bytes = to_file_bytes(&[], MAGIC);
        bytes[4] = VERSION.wrapping_add(1);
        assert!(matches!(
            from_file_bytes(&bytes, MAGIC),
            Err(ParseError::BadVersion)
        ));
    }

    #[test]
    fn corrupt_body() {
        // Corrupt the last byte of the zlib body — zlib's Adler-32 detects it.
        let mut bytes = to_file_bytes(&[], MAGIC);
        *bytes.last_mut().expect("non-empty") ^= 0xFF;
        assert!(matches!(
            from_file_bytes(&bytes, MAGIC),
            Err(ParseError::Truncated)
        ));
    }

    #[test]
    fn truncated() {
        assert!(matches!(
            from_file_bytes(&[0u8; 4], MAGIC),
            Err(ParseError::Truncated)
        ));
    }

    // --- read_file_with_tmp_fallback ---

    #[test]
    fn fallback_bin_exists() -> TestResult {
        let dir = tempfile::tempdir()?;
        let bin = dir.path().join("cache.bin");
        let tmp_path = dir.path().join("cache.tmp");
        std::fs::write(&bin, b"bin")?;
        std::fs::write(&tmp_path, b"tmp")?;

        let (data, from_tmp) = read_file_with_tmp_fallback(&bin).expect("bin present");
        assert_eq!(data, b"bin");
        assert!(!from_tmp);
        assert!(!tmp_path.exists()); // stale .tmp deleted
        Ok(())
    }

    #[test]
    fn fallback_only_tmp_exists() -> TestResult {
        let dir = tempfile::tempdir()?;
        let bin = dir.path().join("cache.bin");
        std::fs::write(bin.with_extension("tmp"), b"recovered")?;

        let (data, from_tmp) = read_file_with_tmp_fallback(&bin).expect("tmp present");
        assert_eq!(data, b"recovered");
        assert!(from_tmp);
        Ok(())
    }

    #[test]
    fn fallback_neither_exists() -> TestResult {
        let dir = tempfile::tempdir()?;
        assert!(read_file_with_tmp_fallback(&dir.path().join("cache.bin")).is_none());
        Ok(())
    }

    // --- write_atomically ---

    #[test]
    fn write_atomically_leaves_no_tmp() -> TestResult {
        let dir = tempfile::tempdir()?;
        let bin = dir.path().join("cache.bin");
        write_atomically(b"hello", &bin)?;
        assert_eq!(std::fs::read(&bin)?, b"hello");
        assert!(!bin.with_extension("tmp").exists());
        Ok(())
    }

    #[test]
    fn write_atomically_round_trip_with_fallback() -> TestResult {
        let dir = tempfile::tempdir()?;
        let bin = dir.path().join("cache.bin");
        let records = vec![make_record(1, "a.com:443", b"tok", i64::MAX)];
        write_atomically(&to_file_bytes(&records, MAGIC), &bin)?;
        let (data, from_tmp) = read_file_with_tmp_fallback(&bin).expect("bin present");
        assert!(!from_tmp);
        let out = from_file_bytes(&data, MAGIC).expect("valid file bytes");
        assert_eq!(out[0].key, b"a.com:443");
        Ok(())
    }

    #[test]
    fn ipc_deserialize_bad_data() {
        assert!(from_file_bytes(b"not valid STCF data at all", MAGIC).is_err());
    }
}
