/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Helpers.h"
#include "gtest/gtest.h"
#include "mozilla/gtest/MozAssertions.h"
#include "nsCOMPtr.h"
#include "nsICloneableInputStream.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsIStorageStream.h"
#include "nsTArray.h"

namespace {

void WriteData(nsIOutputStream* aOut, nsTArray<char>& aData, uint32_t aNumBytes,
               nsACString& aDataWritten) {
  uint32_t n;
  nsresult rv = aOut->Write(aData.Elements(), aNumBytes, &n);
  EXPECT_NS_SUCCEEDED(rv);
  aDataWritten.Append(aData.Elements(), aNumBytes);
}

}  // namespace

TEST(StorageStreams, Main)
{
  // generate some test data we will write in 4k chunks to the stream
  nsTArray<char> kData;
  testing::CreateData(4096, kData);

  // track how much data was written so we can compare at the end
  nsAutoCString dataWritten;

  nsresult rv;
  nsCOMPtr<nsIStorageStream> stor;

  rv = NS_NewStorageStream(kData.Length(), UINT32_MAX, getter_AddRefs(stor));
  EXPECT_NS_SUCCEEDED(rv);

  nsCOMPtr<nsIOutputStream> out;
  rv = stor->GetOutputStream(0, getter_AddRefs(out));
  EXPECT_NS_SUCCEEDED(rv);

  WriteData(out, kData, kData.Length(), dataWritten);
  WriteData(out, kData, kData.Length(), dataWritten);

  rv = out->Close();
  EXPECT_NS_SUCCEEDED(rv);
  out = nullptr;

  nsCOMPtr<nsIInputStream> in;
  rv = stor->NewInputStream(0, getter_AddRefs(in));
  EXPECT_NS_SUCCEEDED(rv);

  nsCOMPtr<nsICloneableInputStream> cloneable = do_QueryInterface(in);
  ASSERT_TRUE(cloneable != nullptr);
  ASSERT_TRUE(cloneable->GetCloneable());

  nsCOMPtr<nsIInputStream> clone;
  rv = cloneable->Clone(getter_AddRefs(clone));

  testing::ConsumeAndValidateStream(in, dataWritten);
  testing::ConsumeAndValidateStream(clone, dataWritten);
  in = nullptr;
  clone = nullptr;

  // now, write 3 more full 4k segments + 11 bytes, starting at 8192
  // total written equals 20491 bytes

  rv = stor->GetOutputStream(dataWritten.Length(), getter_AddRefs(out));
  EXPECT_NS_SUCCEEDED(rv);

  WriteData(out, kData, kData.Length(), dataWritten);
  WriteData(out, kData, kData.Length(), dataWritten);
  WriteData(out, kData, kData.Length(), dataWritten);
  WriteData(out, kData, 11, dataWritten);

  rv = out->Close();
  EXPECT_NS_SUCCEEDED(rv);
  out = nullptr;

  // now, read all
  rv = stor->NewInputStream(0, getter_AddRefs(in));
  EXPECT_NS_SUCCEEDED(rv);

  testing::ConsumeAndValidateStream(in, dataWritten);
  in = nullptr;
}

TEST(StorageStreams, EarlyInputStream)
{
  // generate some test data we will write in 4k chunks to the stream
  nsTArray<char> kData;
  testing::CreateData(4096, kData);

  // track how much data was written so we can compare at the end
  nsAutoCString dataWritten;

  nsresult rv;
  nsCOMPtr<nsIStorageStream> stor;

  rv = NS_NewStorageStream(kData.Length(), UINT32_MAX, getter_AddRefs(stor));
  EXPECT_NS_SUCCEEDED(rv);

  // Get input stream before writing data into the output stream
  nsCOMPtr<nsIInputStream> in;
  rv = stor->NewInputStream(0, getter_AddRefs(in));
  EXPECT_NS_SUCCEEDED(rv);

  // Write data to output stream
  nsCOMPtr<nsIOutputStream> out;
  rv = stor->GetOutputStream(0, getter_AddRefs(out));
  EXPECT_NS_SUCCEEDED(rv);

  WriteData(out, kData, kData.Length(), dataWritten);
  WriteData(out, kData, kData.Length(), dataWritten);

  rv = out->Close();
  EXPECT_NS_SUCCEEDED(rv);
  out = nullptr;

  // Should be able to consume input stream
  testing::ConsumeAndValidateStream(in, dataWritten);
  in = nullptr;
}

TEST(StorageStreams, InterleavedReadAndWrite)
{
  nsTArray<char> kData;
  testing::CreateData(16, kData);

  nsresult rv;
  nsCOMPtr<nsIStorageStream> stor;
  rv = NS_NewStorageStream(8, UINT32_MAX, getter_AddRefs(stor));
  EXPECT_NS_SUCCEEDED(rv);

  nsCOMPtr<nsIInputStream> in;
  rv = stor->NewInputStream(0, getter_AddRefs(in));
  EXPECT_NS_SUCCEEDED(rv);

  nsCOMPtr<nsIOutputStream> out;
  rv = stor->GetOutputStream(0, getter_AddRefs(out));
  EXPECT_NS_SUCCEEDED(rv);

  uint32_t n;
  char buffer[16];

  EXPECT_NS_SUCCEEDED(out->Write(kData.Elements(), 1, &n));
  EXPECT_EQ(n, 1u);
  EXPECT_NS_SUCCEEDED(in->Read(buffer, 16, &n));
  EXPECT_EQ(n, 1u);
  EXPECT_EQ(buffer[0], kData[0]);

  EXPECT_NS_SUCCEEDED(out->Write(kData.Elements() + 1, 1, &n));
  EXPECT_EQ(n, 1u);
  EXPECT_NS_SUCCEEDED(in->Read(buffer, 16, &n));
  EXPECT_EQ(n, 1u);
  EXPECT_EQ(buffer[0], kData[1]);

  // Make sure it also works going past a segment boundary.
  EXPECT_NS_SUCCEEDED(out->Write(kData.Elements() + 2, 11, &n));
  EXPECT_EQ(n, 11u);
  EXPECT_NS_SUCCEEDED(in->Read(buffer, 16, &n));
  EXPECT_EQ(n, 11u);
  EXPECT_EQ(memcmp(buffer, kData.Elements() + 2, 11), 0);

  out->Close();
  in->Close();
}
