/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <d3d11_1.h>
#include <dxgi1_2.h>

#include "gtest/gtest.h"
#include "mozilla/gfx/FileHandleWrapper.h"
#include "mozilla/webrender/RenderD3D11TextureHost.h"

using namespace mozilla;
using namespace mozilla::gfx;

static RefPtr<ID3D11Device> CreateWARPDevice() {
  HMODULE module = LoadLibraryW(L"d3d11.dll");
  if (!module) {
    return nullptr;
  }
  auto createDevice =
      (decltype(D3D11CreateDevice)*)GetProcAddress(module, "D3D11CreateDevice");
  if (!createDevice) {
    return nullptr;
  }
  RefPtr<ID3D11Device> device;
  HRESULT hr =
      createDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, 0, nullptr, 0,
                   D3D11_SDK_VERSION, getter_AddRefs(device), nullptr, nullptr);
  return SUCCEEDED(hr) ? device : nullptr;
}

static RefPtr<FileHandleWrapper> CreateSharedTexture(
    ID3D11Device* aDevice, DXGI_FORMAT aFormat, const IntSize& aSize,
    RefPtr<ID3D11Texture2D>& aTexture) {
  CD3D11_TEXTURE2D_DESC desc(aFormat, aSize.width, aSize.height, 1, 1);
  desc.MiscFlags =
      D3D11_RESOURCE_MISC_SHARED_NTHANDLE | D3D11_RESOURCE_MISC_SHARED;
  if (FAILED(
          aDevice->CreateTexture2D(&desc, nullptr, getter_AddRefs(aTexture)))) {
    return nullptr;
  }
  RefPtr<IDXGIResource1> resource;
  aTexture->QueryInterface((IDXGIResource1**)getter_AddRefs(resource));
  if (!resource) {
    return nullptr;
  }
  HANDLE handle;
  if (FAILED(resource->CreateSharedHandle(
          nullptr, DXGI_SHARED_RESOURCE_READ | DXGI_SHARED_RESOURCE_WRITE,
          nullptr, &handle))) {
    return nullptr;
  }
  return MakeRefPtr<FileHandleWrapper>(UniqueFileHandle(handle));
}

// Deliberately leaks aHost. RenderTextureHost asserts that it is destroyed on
// the render thread, and gtest has no render thread.
template <typename T>
static void LeakRenderTextureHost(RefPtr<T>&& aHost) {
  (void)aHost.forget().take();
}

// Hardware decoders allocate surfaces aligned past the picture size, e.g.
// 1088 rows for 1080p.
TEST(RenderD3D11TextureHost, AcceptsNV12TextureLargerThanDescriptor)
{
  RefPtr<ID3D11Device> device = CreateWARPDevice();
  ASSERT_TRUE(device);

  RefPtr<ID3D11Texture2D> texture;
  RefPtr<FileHandleWrapper> handle = CreateSharedTexture(
      device, DXGI_FORMAT_NV12, IntSize(1920, 1088), texture);
  ASSERT_TRUE(handle);

  RefPtr<wr::RenderDXGITextureHost> host = new wr::RenderDXGITextureHost(
      handle, Nothing(), 0, SurfaceFormat::NV12, ColorSpace2::BT709,
      ColorRange::LIMITED, TransferFunction::BT709, Nothing(),
      IntSize(1920, 1080), false, Nothing());
  EXPECT_TRUE(host->EnsureD3D11Texture2D(device));
  LeakRenderTextureHost(std::move(host));
}

TEST(RenderD3D11TextureHost, AcceptsYCbCrTexturesLargerThanDescriptor)
{
  RefPtr<ID3D11Device> device = CreateWARPDevice();
  ASSERT_TRUE(device);

  const IntSize textureSizes[3] = {IntSize(1920, 1088), IntSize(960, 544),
                                   IntSize(960, 544)};
  RefPtr<ID3D11Texture2D> textures[3];
  RefPtr<FileHandleWrapper> handles[3];
  for (int i = 0; i < 3; ++i) {
    handles[i] = CreateSharedTexture(device, DXGI_FORMAT_R8_UNORM,
                                     textureSizes[i], textures[i]);
    ASSERT_TRUE(handles[i]);
  }

  RefPtr<wr::RenderDXGIYCbCrTextureHost> host =
      new wr::RenderDXGIYCbCrTextureHost(
          handles, YUVColorSpace::BT709, ColorDepth::COLOR_8,
          ColorRange::LIMITED, TransferFunction::BT709, IntSize(1920, 1080),
          IntSize(960, 540), layers::CompositeProcessFencesHolderId{});
  EXPECT_TRUE(host->EnsureD3D11Texture2D(device));
  LeakRenderTextureHost(std::move(host));
}
