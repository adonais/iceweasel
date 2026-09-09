// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at http://mozilla.org/MPL/2.0/.

// ML-DSA keygen known-answer tests.
//
// Vectors from the libcrux ML-DSA combined-extraction test data
// (celabshq/libcrux PR #1467, tests/nistkats-{44,65,87}.json). Each vector
// derives a key pair from a 32-byte seed; the SHA3-256 digests of the FIPS-204
// verification key and (expanded) signing key are the known answers.

#ifndef mldsa_keygen_h__
#define mldsa_keygen_h__

struct MlDsaKeygenKat {
  CK_ML_DSA_PARAMETER_SET_TYPE paramSet;
  const char* seed;         // 32 bytes, hex
  const char* vk_sha3_256;  // 32 bytes, hex
  const char* sk_sha3_256;  // 32 bytes, hex
};

static const MlDsaKeygenKat kMlDsaKeygenKats[] = {
    {CKP_ML_DSA_44,
     "7c9935a0b07694aa0c6d10e4db6b1add2fd81a25ccb148032dcd739936737f2d",
     "42e51c8ab5de8df35bd209e57656e1e83f41a6c90fa10bc71b95c4f4f2c70a2c",
     "af98fdf9fd9bcf1f44c424a15c54a0dd26073f26bfdb32c19c8cbbcdc3c548ba"},
    {CKP_ML_DSA_44,
     "4b622de1350119c45a9f2e2ef3dc5df50a759d138cdfbd64c81cc7cc2f513345",
     "3f8259e55ddf984d721052c391a81ba3cba1e3d9637fb5f07152fd2d1c25f21f",
     "7984ce89b5045ad4b37360bb73183c695f3a559147a28da5a76034c27fedf652"},
    {CKP_ML_DSA_44,
     "1d836e889e46259bcd1ccd2b369583c5b47cfbb919ec2b72c280247cb15a5569",
     "e7d48befd495681a943bee8f4e5f6b49e1be9b5f13b578df60dee00e84e25361",
     "364b20d3f76bd412f7ec6af4f0d360cba1662d249e91574d457c9d1111749727"},
    {CKP_ML_DSA_65,
     "7c9935a0b07694aa0c6d10e4db6b1add2fd81a25ccb148032dcd739936737f2d",
     "67099a6aed1ca9dd645a73261cead798ba29e4a15ede3a469ad4cb620b0296be",
     "bf3a87a7854f5734d73f9130d76ab6d25f9677c30e2398a1268507997d0bd1dc"},
    {CKP_ML_DSA_65,
     "4b622de1350119c45a9f2e2ef3dc5df50a759d138cdfbd64c81cc7cc2f513345",
     "114dbfea406d98227a7e962050ed302be8b3be65e246416cc15465e07bcc39cf",
     "d64d4b4d0e55508a5520ad2ad9453da553dd2c31652574fd1981790df01e9547"},
    {CKP_ML_DSA_65,
     "1d836e889e46259bcd1ccd2b369583c5b47cfbb919ec2b72c280247cb15a5569",
     "dcad3c37aa5fa8c3b7d2ff78d98c7bcdbd9c7a44091f28a5e85bda9831279856",
     "dc0800502b0fb99a53414637e7c64b5b87413a7e2abaaf4dfaf8998cee95a68b"},
    {CKP_ML_DSA_87,
     "7c9935a0b07694aa0c6d10e4db6b1add2fd81a25ccb148032dcd739936737f2d",
     "f93ea70e0db314aa759b9c211ee6c7c5f06391d9e133e032a2217754c75e0f15",
     "61c57a16d98841317c37aa5029ca6ae970a058b2bccda2778c437409dad98cdc"},
    {CKP_ML_DSA_87,
     "4b622de1350119c45a9f2e2ef3dc5df50a759d138cdfbd64c81cc7cc2f513345",
     "5abc7f71667e1df25a06dd481f69fb6e040893437196cd1e6ca96856e83a98ea",
     "f22a3da4a52d0143fe8b2e7e734ce93d6a0ce32ef884ce00f3014a1f9ca747b4"},
    {CKP_ML_DSA_87,
     "1d836e889e46259bcd1ccd2b369583c5b47cfbb919ec2b72c280247cb15a5569",
     "3d63b6587eddc1823f1e58edd7f914234ae2f373da0e32324cac8a5d7d8d3f10",
     "e263290373e77d23b6130053f1f9c783d94b14907df4a1b852792170cc34093b"},
};

#endif  // mldsa_keygen_h__
