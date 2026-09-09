# Vendored libcrux ML-KEM + ML-DSA (combined C extraction)

This directory holds a **combined** C extraction of the libcrux ML-KEM
(FIPS 203) and ML-DSA (FIPS 204) implementations. ML-KEM and ML-DSA share a
single copy of the SHA-3/Keccak code (`libcrux_sha3_portable.c`) and the
`combined_core.c` runtime, rather than each carrying its own — the reason this
is one extraction rather than two.

Consumers are the freebl wrappers `lib/freebl/kyber.c` (ML-KEM) and
`lib/freebl/ml_dsa.c` (ML-DSA). The vendored `.c` files are self-contained
(no NSS/NSPR dependencies) and are compiled into a single `libcrux` static
library with an isolated include scope so their `krml/...` / `eurydice_glue.h`
headers never collide with the HACL* extraction in `lib/freebl/verified/`.
See the freebl build files.

## Provenance

Vendored from upstream libcrux:

- Repository: https://github.com/cryspen/libcrux
- Commit: `87eda899b207aa8fecbdf7a6ecfa5f70a9b2c68c` (`main`)
- Source path: `combined_extraction/c/` (portable variant only; the `*_avx2.*`,
  `intrinsics/`, and ML-KEM-512 files are intentionally not vendored)

Generated with the following toolchain revisions (from the file headers):

- Charon:   `e656e17bff6ca5efac8ab6919b9b74cb9a8dd8ad`
- Eurydice: `aaa9fa657fb6f09802edb890252040d94cd93982`
- Karamel:  `8c19d41458ce5cbfea029ebc03334ba96d149039`
- Libcrux:  `10066f256cec8d50d6111a4cf33ab920cfdb96cb`

Files are kept **byte-identical to upstream** (not run through NSS
`.clang-format`; the sibling `.clang-format` sets `DisableFormat` so the tree is
left alone). `automation/taskcluster/scripts/run_hacl.sh` clones libcrux at the
commit above and diffs `combined_extraction/c/` against this directory, so a
mismatch fails CI. To re-sync: bump the pin in `run_hacl.sh`, re-copy the
portable `combined_extraction/c/` files here verbatim, and update this file.

## Contents

- ML-KEM: `libcrux_mlkem{768,1024}{,_portable}.{c,h}`, `libcrux_mlkem_core.*`,
  `libcrux_mlkem_portable.*`
- ML-DSA: `libcrux_mldsa{44,65,87}_portable.{c,h}`, `libcrux_mldsa_core.*`,
  `libcrux_mldsa_portable.*`
- Shared: `libcrux_sha3_portable.*`, `combined_core.*`, `libcrux_ct_ops.*`,
  `eurydice_glue.h`, `internal/`, `karamel/`
