/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WindowsUIOverlayImage.h"

#include <cstring>
#include <objbase.h>
#include <propvarutil.h>
#include <uiautomation.h>
#include <utility>
#include <wincodec.h>
#include <windows.h>

#include "mozilla/Maybe.h"
#include "mozilla/RefPtr.h"
#include "mozilla/SyncRunnable.h"
#include "mozilla/TimeStamp.h"
#include "nsCOMPtr.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsIFile.h"
#include "nsString.h"
#include "nsThreadUtils.h"

namespace mozilla {

static void PaintOverlayFrame(HWND aOverlayWindow, HDC aMemDC, SIZE aSize,
                              void* aDibBits,
                              const std::vector<uint8_t>& aFrame) {
  memcpy(aDibBits, aFrame.data(), aFrame.size());
  POINT point{};
  BLENDFUNCTION blend{AC_SRC_OVER, 0, 255, AC_SRC_ALPHA};
  HDC screenDC{GetDC(nullptr)};
  UpdateLayeredWindow(aOverlayWindow, screenDC, nullptr, &aSize, aMemDC, &point,
                      0, &blend, ULW_ALPHA);
  ReleaseDC(nullptr, screenDC);
}

static HWND CreateOverlayWindow(const RECT& aRect) {
  return CreateWindowExW(WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_NOACTIVATE |
                             WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW,
                         L"WindowsUIOverlayImage", nullptr, WS_POPUP,
                         aRect.left, aRect.top, aRect.right - aRect.left,
                         aRect.bottom - aRect.top, nullptr, nullptr,
                         GetModuleHandleW(nullptr), nullptr);
}

static mozilla::Maybe<RECT> ComputeOverlayRect(IUIAutomationElement* aElement,
                                               SIZE aSize) {
  RECT rect{};
  HRESULT hr{aElement->get_CurrentBoundingRectangle(&rect)};
  if (FAILED(hr)) {
    return mozilla::Nothing();
  }
  const LONG overlayX{(rect.left + rect.right) / 2 - aSize.cx / 2};
  const LONG overlayY{rect.top - aSize.cy};
  return mozilla::Some(RECT{overlayX, overlayY, overlayX + aSize.cx, rect.top});
}

static HBITMAP CreateTopDown32bppDIB(int aWidth, int aHeight, void** aOutBits) {
  BITMAPINFO bmi{};
  bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  bmi.bmiHeader.biWidth = aWidth;
  bmi.bmiHeader.biHeight = -aHeight;
  bmi.bmiHeader.biPlanes = 1;
  bmi.bmiHeader.biBitCount = 32;
  bmi.bmiHeader.biCompression = BI_RGB;
  HDC screenDC{GetDC(nullptr)};
  HBITMAP dib{
      CreateDIBSection(screenDC, &bmi, DIB_RGB_COLORS, aOutBits, nullptr, 0)};
  ReleaseDC(nullptr, screenDC);
  return dib;
}

static HDC CreateOverlayMemoryDC() {
  HDC screenDC{GetDC(nullptr)};
  HDC memDC{CreateCompatibleDC(screenDC)};
  ReleaseDC(nullptr, screenDC);
  return memDC;
}

static void RegisterWindowClass() {
  WNDCLASSEXW wc{sizeof(wc)};
  wc.lpfnWndProc = DefWindowProcW;
  wc.hInstance = GetModuleHandleW(nullptr);
  wc.lpszClassName = L"WindowsUIOverlayImage";
  RegisterClassExW(&wc);
}

TimeDuration GetFrameDuration(IWICBitmapFrameDecode* aFrame,
                              TimeDuration aDefaultFrameDuration) {
  TimeDuration frameDuration{aDefaultFrameDuration};

  RefPtr<IWICMetadataQueryReader> metadata;
  HRESULT hr{aFrame->GetMetadataQueryReader(getter_AddRefs(metadata))};
  if (FAILED(hr)) {
    return frameDuration;
  }

  // GIF frames store their delay in the Graphic Control Extension
  PROPVARIANT delay;
  PropVariantInit(&delay);
  hr = metadata->GetMetadataByName(L"/grctlext/Delay", &delay);
  if (SUCCEEDED(hr) && delay.vt == VT_UI2 && delay.uiVal > 0) {
    // The delay is stored in hundredths of a second
    frameDuration = TimeDuration::FromMilliseconds(delay.uiVal * 10);
  }
  PropVariantClear(&delay);
  return frameDuration;
}

static mozilla::Maybe<std::vector<uint8_t>> GetFramePixels(
    IWICImagingFactory* aFactory, IWICBitmapFrameDecode* aFrame, int aWidth,
    int aHeight) {
  RefPtr<IWICBitmapSource> converted;
  HRESULT hr{WICConvertBitmapSource(GUID_WICPixelFormat32bppPBGRA, aFrame,
                                    getter_AddRefs(converted))};
  if (FAILED(hr)) {
    return mozilla::Nothing();
  }

  RefPtr<IWICBitmapScaler> scaler;
  hr = aFactory->CreateBitmapScaler(getter_AddRefs(scaler));
  if (FAILED(hr)) {
    return mozilla::Nothing();
  }

  hr = scaler->Initialize(converted, static_cast<UINT>(aWidth),
                          static_cast<UINT>(aHeight),
                          WICBitmapInterpolationModeFant);
  if (FAILED(hr)) {
    return mozilla::Nothing();
  }

  constexpr size_t kBytesPerPixel{4};
  std::vector<uint8_t> pixels(static_cast<size_t>(aWidth) * aHeight *
                              kBytesPerPixel);
  const UINT stride{static_cast<UINT>(aWidth * kBytesPerPixel)};
  hr = scaler->CopyPixels(nullptr, stride, static_cast<UINT>(pixels.size()),
                          pixels.data());
  if (FAILED(hr)) {
    return mozilla::Nothing();
  }

  return mozilla::Some(std::move(pixels));
}

static bool LoadFrame(IWICImagingFactory* aFactory, IWICBitmapDecoder* aDecoder,
                      UINT aIndex, int aWidth, int aHeight,
                      std::vector<WindowsUIOverlayImage::Frame>& aFrames) {
  RefPtr<IWICBitmapFrameDecode> frame;
  HRESULT hr{aDecoder->GetFrame(aIndex, getter_AddRefs(frame))};
  if (FAILED(hr)) {
    return false;
  }

  mozilla::Maybe<std::vector<uint8_t>> framePixels{
      GetFramePixels(aFactory, frame, aWidth, aHeight)};
  if (!framePixels) {
    return false;
  }
  // Kit image (kit.gif) frame duration is 40 ms
  const TimeDuration kDefaultFrameDuration{TimeDuration::FromMilliseconds(40)};
  aFrames.push_back(WindowsUIOverlayImage::Frame{
      std::move(*framePixels), GetFrameDuration(frame, kDefaultFrameDuration)});

  return true;
}

static bool LoadFrames(WindowsUIOverlayImage::DisplayMode aDisplayMode,
                       IWICImagingFactory* aFactory,
                       IWICBitmapDecoder* aDecoder, UINT aFrameCount,
                       SIZE aSize,
                       std::vector<WindowsUIOverlayImage::Frame>& aFrames) {
  if (aDisplayMode == WindowsUIOverlayImage::DisplayMode::Static) {
    // Load just the last frame
    aFrames.reserve(1);
    return LoadFrame(aFactory, aDecoder, aFrameCount - 1, aSize.cx, aSize.cy,
                     aFrames);
  }
  aFrames.reserve(aFrameCount);
  for (UINT i{0}; i < aFrameCount; ++i) {
    if (!LoadFrame(aFactory, aDecoder, i, aSize.cx, aSize.cy, aFrames)) {
      return false;
    }
  }
  return true;
}

static mozilla::Maybe<SIZE> GetImageSize(RefPtr<IUIAutomationElement> aElement,
                                         RefPtr<IWICBitmapDecoder> aDecoder) {
  RefPtr<IWICBitmapFrameDecode> firstFrame;
  HRESULT hr{aDecoder->GetFrame(0, getter_AddRefs(firstFrame))};
  if (FAILED(hr)) {
    return mozilla::Nothing();
  }

  SIZE frameSize{};
  hr = firstFrame->GetSize(reinterpret_cast<UINT*>(&frameSize.cx),
                           reinterpret_cast<UINT*>(&frameSize.cy));
  if (FAILED(hr) || frameSize.cx == 0 || frameSize.cy == 0) {
    return mozilla::Nothing();
  }

  RECT rect{};
  hr = aElement->get_CurrentBoundingRectangle(&rect);
  if (FAILED(hr)) {
    return mozilla::Nothing();
  }

  // Match the element's width and scale the height to preserve the aspect ratio
  LONG width{rect.right - rect.left};
  float imageScale{static_cast<float>(width) / frameSize.cx};
  LONG height{static_cast<LONG>(imageScale * frameSize.cy)};

  return mozilla::Some(SIZE{width, height});
}

static mozilla::Maybe<UINT> LoadFrameCount(IWICBitmapDecoder* aDecoder) {
  UINT frameCount{0};
  HRESULT hr{aDecoder->GetFrameCount(&frameCount)};
  if (FAILED(hr) || frameCount == 0) {
    return mozilla::Nothing();
  }
  return mozilla::Some(frameCount);
}

RefPtr<IWICBitmapDecoder> CreateWICBitmapDecoder(
    RefPtr<IWICImagingFactory> aFactory, nsIFile* aImageFile) {
  nsAutoString imagePath;
  aImageFile->GetPath(imagePath);
  RefPtr<IWICBitmapDecoder> decoder;
  HRESULT hr{aFactory->CreateDecoderFromFilename(
      imagePath.get(), nullptr, GENERIC_READ, WICDecodeMetadataCacheOnDemand,
      getter_AddRefs(decoder))};
  return SUCCEEDED(hr) ? decoder : nullptr;
}

static already_AddRefed<nsIFile> GetImageFile() {
  nsresult rv{NS_ERROR_FAILURE};
  nsCOMPtr<nsIFile> file;
  // The directory service must be used on the main thread
  const nsresult dispatchToThreadRv{mozilla::SyncRunnable::DispatchToThread(
      mozilla::GetMainThreadSerialEventTarget(),
      NS_NewRunnableFunction(
          "WindowsUIOverlayImage::GetImageFile", [&rv, &file] {
            rv = NS_GetSpecialDirectory(NS_GRE_BIN_DIR, getter_AddRefs(file));
          }))};

  if (NS_FAILED(dispatchToThreadRv) || NS_FAILED(rv)) {
    return nullptr;
  }

  constexpr auto kImageRelativePath{
      R"(browser\components\shell\assets\kit.gif)"_ns};
  rv = file->AppendRelativeNativePath(kImageRelativePath);
  if (NS_FAILED(rv)) {
    return nullptr;
  }

  return file.forget();
}

RefPtr<IWICImagingFactory> CreateWICImagingFactory() {
  RefPtr<IWICImagingFactory> factory;
  HRESULT hr{CoCreateInstance(CLSID_WICImagingFactory, nullptr,
                              CLSCTX_INPROC_SERVER, IID_IWICImagingFactory,
                              getter_AddRefs(factory))};
  return SUCCEEDED(hr) ? factory : nullptr;
}

already_AddRefed<WindowsUIOverlayImage> WindowsUIOverlayImage::Create(
    HWND aWindow, RefPtr<IUIAutomationElement> aElement,
    DisplayMode aDisplayMode) {
  RefPtr<WindowsUIOverlayImage> overlayImage{
      new WindowsUIOverlayImage(aWindow, aElement, aDisplayMode)};
  if (!overlayImage->Initialize()) {
    return nullptr;
  }
  return overlayImage.forget();
}

WindowsUIOverlayImage::WindowsUIOverlayImage(
    HWND aWindow, RefPtr<IUIAutomationElement> aElement,
    DisplayMode aDisplayMode)
    : mWindow{aWindow},
      mElement{aElement},
      mDisplayMode{aDisplayMode},
      mSize{},
      mAccumulatedTime{},
      mDibBits{nullptr},
      mOldBmp{nullptr},
      mRect{},
      mOverlayWindow{nullptr},
      mCurrentFrame{} {}

WindowsUIOverlayImage::~WindowsUIOverlayImage() {
  if (mOverlayWindow) {
    // Destroy the overlay window on the main thread where it was created
    NS_DispatchToMainThread(NS_NewRunnableFunction(
        "WindowsUIOverlayImage::DestroyWindow",
        [window = mOverlayWindow] { DestroyWindow(window); }));
    mOverlayWindow = nullptr;
  }
  if (mMemDC && mOldBmp) {
    SelectObject(mMemDC, mOldBmp);
  }
}

static bool IsWindowPointVisible(HWND aWindow, POINT aPoint) {
  HWND topWindow{WindowFromPoint(aPoint)};
  if (aWindow != topWindow && !IsChild(aWindow, topWindow)) {
    return false;
  }
  return true;
}

bool WindowsUIOverlayImage::IsVisible() {
  POINT pointTopLeft{mRect.left, mRect.top};
  if (!IsWindowPointVisible(mWindow, pointTopLeft)) {
    return false;
  }

  POINT pointBottomLeft{mRect.left, mRect.bottom};
  if (!IsWindowPointVisible(mWindow, pointBottomLeft)) {
    return false;
  }

  POINT pointTopRight{mRect.right, mRect.top};
  if (!IsWindowPointVisible(mWindow, pointTopRight)) {
    return false;
  }

  POINT pointBottomRight{mRect.right, mRect.bottom};
  if (!IsWindowPointVisible(mWindow, pointBottomRight)) {
    return false;
  }

  return true;
}

size_t ComputeAdvancedFrame(
    const std::vector<WindowsUIOverlayImage::Frame>& aFrames,
    size_t aCurrentFrame, TimeDuration& aAccumulatedTime) {
  // Advance as many frames as the accumulated time covers, so the animation
  // speed stays independent of the tick rate, even when a tick lasts longer
  // than a frame's duration
  while (aCurrentFrame + 1 < aFrames.size() &&
         aAccumulatedTime >= aFrames[aCurrentFrame].duration) {
    aAccumulatedTime -= aFrames[aCurrentFrame].duration;
    ++aCurrentFrame;
  }
  return aCurrentFrame;
}

void WindowsUIOverlayImage::AdvanceAnimation(TimeDuration aElapsed) {
  if (!mOverlayWindow || mDisplayMode != DisplayMode::Animated ||
      mFrames.empty() || mCurrentFrame + 1 >= mFrames.size()) {
    return;
  }

  mAccumulatedTime += aElapsed;

  size_t newFrame{
      ComputeAdvancedFrame(mFrames, mCurrentFrame, mAccumulatedTime)};
  if (newFrame != mCurrentFrame) {
    mCurrentFrame = newFrame;
    PaintOverlayFrame(mOverlayWindow, mMemDC, mSize, mDibBits,
                      mFrames[mCurrentFrame].pixels);
  }
}

bool WindowsUIOverlayImage::Initialize() {
  RefPtr<IWICImagingFactory> factory{CreateWICImagingFactory()};
  if (!factory) {
    return false;
  }

  nsCOMPtr<nsIFile> imageFile{GetImageFile()};
  if (!imageFile) {
    return false;
  }

  RefPtr<IWICBitmapDecoder> decoder{CreateWICBitmapDecoder(factory, imageFile)};
  if (!decoder) {
    return false;
  }

  mozilla::Maybe<UINT> frameCount{LoadFrameCount(decoder)};
  if (!frameCount) {
    return false;
  }

  mozilla::Maybe<SIZE> size{GetImageSize(mElement, decoder)};
  if (!size) {
    return false;
  }
  mSize = *size;

  if (!LoadFrames(mDisplayMode, factory, decoder, *frameCount, mSize,
                  mFrames)) {
    return false;
  }

  RegisterWindowClass();

  mMemDC.own(CreateOverlayMemoryDC());
  mDib.own(CreateTopDown32bppDIB(mSize.cx, mSize.cy, &mDibBits));
  if (!mMemDC || !mDib) {
    return false;
  }
  mOldBmp = SelectObject(mMemDC, mDib);

  auto rect{ComputeOverlayRect(mElement, mSize)};
  if (!rect) {
    return false;
  }
  mRect = *rect;

  // Create the overlay window on the main thread
  HWND overlayWindow{nullptr};
  mozilla::SyncRunnable::DispatchToThread(
      mozilla::GetMainThreadSerialEventTarget(),
      NS_NewRunnableFunction("WindowsUIOverlayImage::CreateWindow",
                             [&overlayWindow, rect = mRect] {
                               overlayWindow = CreateOverlayWindow(rect);
                             }));
  mOverlayWindow = overlayWindow;
  if (!mOverlayWindow) {
    return false;
  }

  mCurrentFrame =
      mDisplayMode == DisplayMode::Animated ? 0 : mFrames.size() - 1;
  PaintOverlayFrame(mOverlayWindow, mMemDC, mSize, mDibBits,
                    mFrames[mCurrentFrame].pixels);

  ShowWindow(mOverlayWindow, SW_SHOWNOACTIVATE);
  return true;
}

}  // namespace mozilla
