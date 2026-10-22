// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// You can obtain one at http://mozilla.org/MPL/2.0/.

#include "gtest/gtest.h"

#include <stdint.h>
#include <string.h>
#include <algorithm>
#include <vector>

#include "blapi.h"
#include "blapit.h"
#include "freebl_scoped_ptrs.h"
#include "pkcs11t.h"
#include "secerr.h"
#include "secport.h"

// AES-CTR counter arithmetic. CKM_AES_CTR gives the counter a width of
// ulCounterBits and puts it in the low bits of the counter block; the bits
// above it are part of the nonce and must never change, and the counter must
// not silently return to its initial value.
//
// These tests pin the counter sequence to a reference computed here and run
// it through AES-ECB, so they are independent of the counter mode code under
// test.

namespace nss_test {

static const uint8_t kKey128[] = {0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
                                  0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
                                  0x0d, 0x0e, 0x0f, 0x10};

// Increment the counter block as CKM_AES_CTR defines it: a big endian
// increment of the low counter_bits bits, wrapping inside those bits.
static void ReferenceIncrement(uint8_t* block, unsigned int counter_bits) {
  unsigned int i = AES_BLOCK_SIZE;

  while (counter_bits >= 8) {
    if (++block[--i] != 0) {
      return;
    }
    counter_bits -= 8;
  }
  if (counter_bits == 0) {
    return;
  }
  uint8_t mask = static_cast<uint8_t>((1 << counter_bits) - 1);
  block[i - 1] = static_cast<uint8_t>((block[i - 1] & ~mask) |
                                      ((block[i - 1] + 1) & mask));
}

static std::vector<uint8_t> ReferenceKeystream(const uint8_t* cb,
                                               unsigned int counter_bits,
                                               size_t blocks) {
  std::vector<uint8_t> counters;
  uint8_t block[AES_BLOCK_SIZE];

  counters.reserve(blocks * AES_BLOCK_SIZE);
  memcpy(block, cb, AES_BLOCK_SIZE);
  for (size_t i = 0; i < blocks; i++) {
    counters.insert(counters.end(), block, block + AES_BLOCK_SIZE);
    ReferenceIncrement(block, counter_bits);
  }
  if (counters.empty()) {
    return counters;
  }

  ScopedAESContext ecb(AES_CreateContext(kKey128, nullptr, NSS_AES, 1,
                                         sizeof(kKey128), AES_BLOCK_SIZE));
  EXPECT_TRUE(ecb);
  std::vector<uint8_t> keystream(counters.size());
  unsigned int outlen = 0;
  EXPECT_EQ(SECSuccess,
            AES_Encrypt(ecb.get(), keystream.data(), &outlen, keystream.size(),
                        counters.data(), counters.size()));
  EXPECT_EQ(counters.size(), static_cast<size_t>(outlen));
  return keystream;
}

struct CtrResult {
  SECStatus rv;
  int error;
  std::vector<uint8_t> keystream;
};

// Encrypt zeros through a single CKM_AES_CTR context, one call per entry in
// chunks.
static CtrResult RunCtr(const uint8_t* cb, unsigned int counter_bits,
                        const std::vector<size_t>& chunks) {
  CK_AES_CTR_PARAMS param;
  CtrResult result = {SECSuccess, 0, {}};

  param.ulCounterBits = counter_bits;
  memcpy(param.cb, cb, AES_BLOCK_SIZE);

  ScopedAESContext ctx(
      AES_CreateContext(kKey128, reinterpret_cast<const unsigned char*>(&param),
                        NSS_AES_CTR, 1, sizeof(kKey128), AES_BLOCK_SIZE));
  if (!ctx) {
    result.rv = SECFailure;
    result.error = PORT_GetError();
    return result;
  }

  for (size_t chunk : chunks) {
    std::vector<uint8_t> in(chunk, 0);
    std::vector<uint8_t> out(chunk, 0);
    unsigned int outlen = 0;

    PORT_SetError(0);
    result.rv = AES_Encrypt(ctx.get(), out.data(), &outlen, out.size(),
                            in.data(), in.size());
    if (result.rv != SECSuccess) {
      result.error = PORT_GetError();
      break;
    }
    EXPECT_EQ(chunk, static_cast<size_t>(outlen));
    result.keystream.insert(result.keystream.end(), out.begin(),
                            out.begin() + outlen);
  }
  return result;
}

// Split a total number of bytes into chunks of at most max_chunk bytes.
static std::vector<size_t> SplitEvenly(size_t total, size_t max_chunk) {
  std::vector<size_t> chunks;
  while (total > 0) {
    size_t chunk = std::min(total, max_chunk);
    chunks.push_back(chunk);
    total -= chunk;
  }
  return chunks;
}

class AesCtrCounterTest : public ::testing::Test {
 protected:
  // Check that a run over the given chunk sizes succeeds and follows the
  // reference counter sequence.
  void ExpectKeystream(const uint8_t* cb, unsigned int counter_bits,
                       const std::vector<size_t>& chunks) {
    size_t total = 0;
    for (size_t chunk : chunks) {
      total += chunk;
    }
    size_t blocks = (total + AES_BLOCK_SIZE - 1) / AES_BLOCK_SIZE;
    std::vector<uint8_t> expected =
        ReferenceKeystream(cb, counter_bits, blocks);
    expected.resize(total);

    CtrResult result = RunCtr(cb, counter_bits, chunks);
    ASSERT_EQ(SECSuccess, result.rv)
        << "counterBits=" << counter_bits << " error=" << result.error;
    EXPECT_EQ(expected, result.keystream) << "counterBits=" << counter_bits;
  }
};

// A counter that has to carry from the last byte of the block up into the
// bytes above it, including into a byte the counter only partly covers
// (counterBits == 33 puts one counter bit in byte 11 and seven nonce bits).
// The counter state has to survive that across calls, whether or not the
// calls are block aligned.
TEST_F(AesCtrCounterTest, CarryBetweenBytes) {
  static const unsigned int kCounterBits[] = {33, 128};
  // Three blocks below the carry, with a distinctive nonce above it.
  uint8_t cb[AES_BLOCK_SIZE] = {0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
                                0xa8, 0xa9, 0xaa, 0xab, 0xff, 0xff, 0xff, 0xfd};

  for (unsigned int counter_bits : kCounterBits) {
    ExpectKeystream(cb, counter_bits, {10 * AES_BLOCK_SIZE});
    // One block per call, so the counter carries between calls.
    ExpectKeystream(cb, counter_bits,
                    SplitEvenly(10 * AES_BLOCK_SIZE, AES_BLOCK_SIZE));
    // Unaligned calls, so a partial keystream block is held in the context
    // across the carry.
    ExpectKeystream(
        cb, counter_bits,
        {7, 17, 3, 5 * AES_BLOCK_SIZE, 1, 2 * AES_BLOCK_SIZE + 9, 15});
  }
}

// Run a narrow counter through its whole cycle, for counter widths that end
// mid-byte as well as on a byte boundary. The counter wraps inside its own
// bits, leaving the nonce above it alone, and the last value the context
// hands out is the one before counterFirst comes back around; asking for one
// more block is an error rather than a repeat of the first block's keystream.
TEST_F(AesCtrCounterTest, FullCycleThenWrapIsRejected) {
  static const unsigned int kCounterBits[] = {2, 3, 4, 7, 8, 9, 12, 16};
  // Nonce bits are set both above and inside the bytes the counter occupies.
  static const uint8_t kNonce[] = {0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5,
                                   0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xab,
                                   0x5a, 0xc3, 0x3c, 0x5a};

  for (unsigned int counter_bits : kCounterBits) {
    uint8_t cb[AES_BLOCK_SIZE];
    size_t cycle = static_cast<size_t>(1) << counter_bits;
    size_t max_blocks_per_call = cycle - 2;

    memcpy(cb, kNonce, sizeof(cb));
    // Start two blocks below the end of the counter's range, so the cycle
    // crosses the wrap early on.
    cb[AES_BLOCK_SIZE - 1] |= 0xff;
    if (counter_bits > 8) {
      cb[AES_BLOCK_SIZE - 2] |= 0xff;
    }
    cb[AES_BLOCK_SIZE - 1] -= 2;

    // cycle - 1 blocks are available before the counter returns to its
    // initial value.
    std::vector<size_t> chunks =
        SplitEvenly((cycle - 1) * AES_BLOCK_SIZE,
                    std::min(max_blocks_per_call, static_cast<size_t>(1000)) *
                        AES_BLOCK_SIZE);
    ExpectKeystream(cb, counter_bits, chunks);

    // One more block returns the counter to counterFirst, which has to fail.
    chunks.push_back(AES_BLOCK_SIZE);
    CtrResult result = RunCtr(cb, counter_bits, chunks);
    EXPECT_EQ(SECFailure, result.rv) << "counterBits=" << counter_bits;
    EXPECT_EQ(SEC_ERROR_INVALID_ARGS, result.error)
        << "counterBits=" << counter_bits;
    // Nothing beyond the full cycle was emitted, so no keystream was reused.
    EXPECT_EQ((cycle - 1) * AES_BLOCK_SIZE, result.keystream.size())
        << "counterBits=" << counter_bits;
  }
}

// A single call may not ask for more than 2^counterBits - 2 blocks. At
// counterBits == 1 that is no blocks at all, so nothing can be encrypted.
TEST_F(AesCtrCounterTest, OversizedCallIsRejected) {
  static const unsigned int kCounterBits[] = {1, 8};
  uint8_t cb[AES_BLOCK_SIZE] = {0};

  for (unsigned int counter_bits : kCounterBits) {
    size_t limit =
        ((static_cast<size_t>(1) << counter_bits) - 2) * AES_BLOCK_SIZE;
    CtrResult result = RunCtr(cb, counter_bits, {limit + 1});
    EXPECT_EQ(SECFailure, result.rv) << "counterBits=" << counter_bits;
    EXPECT_EQ(SEC_ERROR_INPUT_LEN, result.error)
        << "counterBits=" << counter_bits;
  }
}

}  // namespace nss_test
