/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

#include "gfxPlatform.h"
#include "gtest/gtest.h"
#include "mozilla/Preferences.h"
#include "mozilla/RefPtr.h"
#include "mozilla/ScopeExit.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "mozilla/dom/BrowsingContext.h"
#include "nsCocoaWindow.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsFilePicker.h"
#include "nsIFile.h"
#include "nsITimer.h"
#include "nsThreadUtils.h"

using namespace mozilla;
using namespace mozilla::dom;
using namespace mozilla::widget;

namespace {

NSMutableArray* sPresentedPanels;

class PickerCallback final : public nsIFilePickerShownCallback {
 public:
  NS_DECL_ISUPPORTS

  NS_IMETHOD Done(nsIFilePicker::ResultCode aResult) override {
    ++mCalls;
    mResult = aResult;
    if (mOnDone) {
      nsCOMPtr<nsIRunnable> onDone = mOnDone.forget();
      onDone->Run();
    }
    return NS_OK;
  }

  nsCOMPtr<nsIRunnable> mOnDone;
  uint32_t mCalls = 0;
  nsIFilePicker::ResultCode mResult = nsIFilePicker::returnCancel;

 private:
  ~PickerCallback() = default;
};

NS_IMPL_ISUPPORTS(PickerCallback, nsIFilePickerShownCallback)

}  // namespace

@interface MOZTestFilePickerPanel : NSSavePanel
@end

@implementation MOZTestFilePickerPanel
- (void)beginSheetModalForWindow:(NSWindow*)aWindow
               completionHandler:(void (^)(NSModalResponse))aHandler {
  [self beginWithCompletionHandler:aHandler];
}

- (void)beginWithCompletionHandler:(void (^)(NSModalResponse))aHandler {
  [sPresentedPanels addObject:@{
    @"panel" : self,
    @"handler" : [[aHandler copy] autorelease],
  }];
}

- (NSURL*)URL {
  return [NSURL
      fileURLWithPath:[@"/tmp/"
                          stringByAppendingString:self.nameFieldStringValue]];
}
@end

namespace {

id CreatePanel(id, SEL) {
  return [[[MOZTestFilePickerPanel alloc] init] autorelease];
}

}  // namespace

class FilePickerTest : public testing::Test {
 protected:
  void SetUp() override {
    mAutoreleasePool = [[NSAutoreleasePool alloc] init];
    sPresentedPanels = [[NSMutableArray alloc] init];
    mFactoryMethod =
        class_getClassMethod([NSSavePanel class], @selector(savePanel));
    ASSERT_NE(mFactoryMethod, nullptr);
    mFactoryIMP = method_setImplementation(mFactoryMethod, (IMP)CreatePanel);
  }

  void TearDown() override {
    while (sPresentedPanels.count) {
      Complete(0, NSModalResponseCancel);
    }
    RestorePanelFactory();
    [sPresentedPanels release];
    sPresentedPanels = nil;
    [mAutoreleasePool drain];
  }

  void RestorePanelFactory() {
    if (mFactoryIMP) {
      method_setImplementation(mFactoryMethod, mFactoryIMP);
      mFactoryIMP = nullptr;
    }
  }

  static NSSavePanel* NativePanel() {
    for (NSWindow* window in NSApp.windows) {
      if ([window isKindOfClass:[NSSavePanel class]] && window.visible) {
        NSSavePanel* panel = (NSSavePanel*)window;
        if ([panel.nameFieldStringValue
                hasPrefix:@"native-file-picker-queue-"]) {
          return panel;
        }
      }
    }
    return nil;
  }

  static RefPtr<nsCocoaWindow> CreateWindow() {
    RefPtr<nsCocoaWindow> window = MakeRefPtr<nsCocoaWindow>();
    InitData initData;
    if (NS_FAILED(window->Create(nullptr, DesktopIntRect(0, 0, 300, 300),
                                 initData))) {
      return nullptr;
    }
    return window;
  }

  static RefPtr<nsFilePicker> CreatePicker(nsIWidget* aParent,
                                           const nsAString& aFilename) {
    RefPtr<nsFilePicker> picker = MakeRefPtr<nsFilePicker>();
    picker->mParentWidget = aParent;
    picker->mMode = nsIFilePicker::modeSave;
    picker->mDefaultFilename = aFilename;
    picker->mBrowsingContext = BrowsingContext::CreateDetached(
        nullptr, nullptr, nullptr, EmptyString(), BrowsingContext::Type::Chrome,
        {});
    return picker;
  }

  MOZ_CAN_RUN_SCRIPT_BOUNDARY static nsresult Open(
      nsFilePicker* aPicker, nsIFilePickerShownCallback* aCallback) {
    RefPtr<nsFilePicker> picker = aPicker;
    nsCOMPtr<nsIFilePickerShownCallback> callback = aCallback;
    return picker->Open(callback);
  }

  static void ProcessEvents() { NS_ProcessPendingEvents(nullptr); }

  static void Complete(NSUInteger aIndex, NSModalResponse aResult) {
    NSDictionary* info = [sPresentedPanels objectAtIndex:aIndex];
    [info retain];
    [sPresentedPanels removeObjectAtIndex:aIndex];
    void (^handler)(NSModalResponse) = [info objectForKey:@"handler"];
    handler(aResult);
    [info release];
    ProcessEvents();
  }

  static NSString* PresentedName(NSUInteger aIndex = 0) {
    NSSavePanel* panel =
        [[sPresentedPanels objectAtIndex:aIndex] objectForKey:@"panel"];
    return panel.nameFieldStringValue;
  }

 private:
  NSAutoreleasePool* mAutoreleasePool = nil;
  Method mFactoryMethod = nullptr;
  IMP mFactoryIMP = nullptr;
};

TEST_F(FilePickerTest, QueuesConcurrentSaveRequests) {
  RefPtr<nsCocoaWindow> window = CreateWindow();
  ASSERT_NE(window, nullptr);
  RefPtr<nsFilePicker> first =
      CreatePicker(window, u"file-picker-queue-first.txt"_ns);
  RefPtr<nsFilePicker> second =
      CreatePicker(window, u"file-picker-queue-second.txt"_ns);
  RefPtr<nsFilePicker> third =
      CreatePicker(window, u"file-picker-queue-third.txt"_ns);
  RefPtr<PickerCallback> firstCallback = MakeRefPtr<PickerCallback>();
  RefPtr<PickerCallback> secondCallback = MakeRefPtr<PickerCallback>();
  RefPtr<PickerCallback> thirdCallback = MakeRefPtr<PickerCallback>();

  ASSERT_EQ(NS_OK, Open(first, firstCallback));
  ASSERT_EQ(NS_OK, Open(second, secondCallback));
  ASSERT_EQ(NS_OK, Open(third, thirdCallback));
  ProcessEvents();

  ASSERT_EQ(1u, sPresentedPanels.count);
  EXPECT_TRUE([PresentedName() isEqualToString:@"file-picker-queue-first.txt"]);
  EXPECT_EQ(0u, firstCallback->mCalls);
  EXPECT_EQ(0u, secondCallback->mCalls);
  EXPECT_EQ(0u, thirdCallback->mCalls);

  Complete(0, NSModalResponseOK);
  ASSERT_EQ(1u, sPresentedPanels.count);
  EXPECT_EQ(1u, firstCallback->mCalls);
  EXPECT_EQ(nsIFilePicker::returnOK, firstCallback->mResult);
  EXPECT_TRUE(
      [PresentedName() isEqualToString:@"file-picker-queue-second.txt"]);
  nsCOMPtr<nsIFile> file;
  ASSERT_EQ(NS_OK, first->GetFile(getter_AddRefs(file)));
  ASSERT_NE(file, nullptr);
  nsAutoString leafName;
  ASSERT_EQ(NS_OK, file->GetLeafName(leafName));
  EXPECT_EQ(u"file-picker-queue-first.txt"_ns, leafName);

  Complete(0, NSModalResponseCancel);
  ASSERT_EQ(1u, sPresentedPanels.count);
  EXPECT_EQ(1u, secondCallback->mCalls);
  EXPECT_EQ(nsIFilePicker::returnCancel, secondCallback->mResult);
  EXPECT_TRUE([PresentedName() isEqualToString:@"file-picker-queue-third.txt"]);

  Complete(0, NSModalResponseOK);
  EXPECT_EQ(0u, sPresentedPanels.count);
  EXPECT_EQ(1u, firstCallback->mCalls);
  EXPECT_EQ(1u, secondCallback->mCalls);
  EXPECT_EQ(1u, thirdCallback->mCalls);
  EXPECT_EQ(nsIFilePicker::returnOK, thirdCallback->mResult);
  window->Destroy();
}

TEST_F(FilePickerTest, SeparateWindowsRemainIndependent) {
  RefPtr<nsCocoaWindow> firstWindow = CreateWindow();
  RefPtr<nsCocoaWindow> secondWindow = CreateWindow();
  ASSERT_NE(firstWindow, nullptr);
  ASSERT_NE(secondWindow, nullptr);
  RefPtr<nsFilePicker> first = CreatePicker(firstWindow, u"first.txt"_ns);
  RefPtr<nsFilePicker> second = CreatePicker(firstWindow, u"second.txt"_ns);
  RefPtr<nsFilePicker> other = CreatePicker(secondWindow, u"other.txt"_ns);
  RefPtr<PickerCallback> firstCallback = MakeRefPtr<PickerCallback>();
  RefPtr<PickerCallback> secondCallback = MakeRefPtr<PickerCallback>();
  RefPtr<PickerCallback> otherCallback = MakeRefPtr<PickerCallback>();

  ASSERT_EQ(NS_OK, Open(first, firstCallback));
  ASSERT_EQ(NS_OK, Open(second, secondCallback));
  ASSERT_EQ(NS_OK, Open(other, otherCallback));
  ProcessEvents();
  ASSERT_EQ(2u, sPresentedPanels.count);
  EXPECT_TRUE([PresentedName(0) isEqualToString:@"first.txt"]);
  EXPECT_TRUE([PresentedName(1) isEqualToString:@"other.txt"]);

  Complete(1, NSModalResponseCancel);
  EXPECT_EQ(1u, otherCallback->mCalls);
  EXPECT_EQ(0u, firstCallback->mCalls);
  EXPECT_EQ(0u, secondCallback->mCalls);
  Complete(0, NSModalResponseCancel);
  ASSERT_EQ(1u, sPresentedPanels.count);
  EXPECT_TRUE([PresentedName() isEqualToString:@"second.txt"]);
  Complete(0, NSModalResponseCancel);
  EXPECT_EQ(1u, firstCallback->mCalls);
  EXPECT_EQ(1u, secondCallback->mCalls);
  firstWindow->Destroy();
  secondWindow->Destroy();
}

TEST_F(FilePickerTest, KeepsQueueWhenNativeWindowIsRecreated) {
  RefPtr<nsCocoaWindow> window = CreateWindow();
  ASSERT_NE(window, nullptr);
  RefPtr<nsFilePicker> first = CreatePicker(window, u"first.txt"_ns);
  RefPtr<nsFilePicker> second = CreatePicker(window, u"second.txt"_ns);
  RefPtr<nsFilePicker> third = CreatePicker(window, u"third.txt"_ns);
  RefPtr<PickerCallback> firstCallback = MakeRefPtr<PickerCallback>();
  RefPtr<PickerCallback> secondCallback = MakeRefPtr<PickerCallback>();
  RefPtr<PickerCallback> thirdCallback = MakeRefPtr<PickerCallback>();

  ASSERT_EQ(NS_OK, Open(first, firstCallback));
  ASSERT_EQ(NS_OK, Open(second, secondCallback));
  ProcessEvents();
  ASSERT_EQ(1u, sPresentedPanels.count);

  NSWindow* originalWindow =
      static_cast<NSWindow*>(window->GetNativeData(NS_NATIVE_WINDOW));
  [originalWindow retain];
  auto releaseWindow =
      MakeScopeExit([originalWindow]() { [originalWindow release]; });
  window->HideWindowChrome(true);
  ASSERT_NE(originalWindow, window->GetNativeData(NS_NATIVE_WINDOW));
  ASSERT_FALSE(window->Destroyed());

  ASSERT_EQ(NS_OK, Open(third, thirdCallback));
  Complete(0, NSModalResponseCancel);
  ASSERT_EQ(1u, sPresentedPanels.count);
  EXPECT_TRUE([PresentedName() isEqualToString:@"second.txt"]);
  EXPECT_EQ(1u, firstCallback->mCalls);
  EXPECT_EQ(0u, secondCallback->mCalls);
  EXPECT_EQ(0u, thirdCallback->mCalls);

  Complete(0, NSModalResponseCancel);
  ASSERT_EQ(1u, sPresentedPanels.count);
  EXPECT_TRUE([PresentedName() isEqualToString:@"third.txt"]);
  Complete(0, NSModalResponseCancel);
  EXPECT_EQ(0u, sPresentedPanels.count);
  EXPECT_EQ(1u, firstCallback->mCalls);
  EXPECT_EQ(1u, secondCallback->mCalls);
  EXPECT_EQ(1u, thirdCallback->mCalls);
  window->Destroy();
}

TEST_F(FilePickerTest, CancelsQueuedRequestsAfterParentIsDestroyed) {
  RefPtr<nsCocoaWindow> window = CreateWindow();
  ASSERT_NE(window, nullptr);
  RefPtr<nsFilePicker> first = CreatePicker(window, u"first.txt"_ns);
  RefPtr<nsFilePicker> second = CreatePicker(window, u"second.txt"_ns);
  RefPtr<PickerCallback> firstCallback = MakeRefPtr<PickerCallback>();
  RefPtr<PickerCallback> secondCallback = MakeRefPtr<PickerCallback>();

  ASSERT_EQ(NS_OK, Open(first, firstCallback));
  ASSERT_EQ(NS_OK, Open(second, secondCallback));
  ProcessEvents();
  ASSERT_EQ(1u, sPresentedPanels.count);
  window->Destroy();
  Complete(0, NSModalResponseCancel);
  EXPECT_EQ(0u, sPresentedPanels.count);
  EXPECT_EQ(1u, firstCallback->mCalls);
  EXPECT_EQ(1u, secondCallback->mCalls);
  EXPECT_EQ(nsIFilePicker::returnCancel, secondCallback->mResult);
}

TEST_F(FilePickerTest, CancelsQueuedRequestsWhenPickersAreDisabled) {
  RefPtr<nsCocoaWindow> window = CreateWindow();
  ASSERT_NE(window, nullptr);
  RefPtr<nsFilePicker> first = CreatePicker(window, u"first.txt"_ns);
  RefPtr<nsFilePicker> second = CreatePicker(window, u"second.txt"_ns);
  RefPtr<PickerCallback> firstCallback = MakeRefPtr<PickerCallback>();
  RefPtr<PickerCallback> secondCallback = MakeRefPtr<PickerCallback>();

  ASSERT_EQ(NS_OK, Open(first, firstCallback));
  ASSERT_EQ(NS_OK, Open(second, secondCallback));
  ProcessEvents();
  ASSERT_EQ(1u, sPresentedPanels.count);

  const char* prefName = "widget.disable_file_pickers";
  const bool hasUserValue = Preferences::HasUserValue(prefName);
  const bool isDisabled = Preferences::GetBool(prefName);
  auto restorePref = MakeScopeExit([prefName, hasUserValue, isDisabled]() {
    if (hasUserValue) {
      Preferences::SetBool(prefName, isDisabled);
    } else {
      Preferences::ClearUser(prefName);
    }
  });
  ASSERT_EQ(NS_OK, Preferences::SetBool(prefName, true));

  Complete(0, NSModalResponseCancel);
  EXPECT_EQ(0u, sPresentedPanels.count);
  EXPECT_EQ(1u, firstCallback->mCalls);
  EXPECT_EQ(1u, secondCallback->mCalls);
  EXPECT_EQ(nsIFilePicker::returnCancel, secondCallback->mResult);
  window->Destroy();
}

TEST_F(FilePickerTest, SerializesPickersWithoutParentWindows) {
  RefPtr<nsFilePicker> first = CreatePicker(nullptr, u"first.txt"_ns);
  RefPtr<nsFilePicker> second = CreatePicker(nullptr, u"second.txt"_ns);
  RefPtr<PickerCallback> firstCallback = MakeRefPtr<PickerCallback>();
  RefPtr<PickerCallback> secondCallback = MakeRefPtr<PickerCallback>();

  ASSERT_EQ(NS_OK, Open(first, firstCallback));
  ASSERT_EQ(NS_OK, Open(second, secondCallback));
  ProcessEvents();
  ASSERT_EQ(1u, sPresentedPanels.count);
  Complete(0, NSModalResponseCancel);
  ASSERT_EQ(1u, sPresentedPanels.count);
  Complete(0, NSModalResponseCancel);
  EXPECT_EQ(1u, firstCallback->mCalls);
  EXPECT_EQ(1u, secondCallback->mCalls);
  EXPECT_EQ(0u, sPresentedPanels.count);
}

TEST_F(FilePickerTest, CallbackRequestsStayBehindQueuedRequests) {
  RefPtr<nsCocoaWindow> window = CreateWindow();
  ASSERT_NE(window, nullptr);
  RefPtr<nsFilePicker> first = CreatePicker(window, u"first.txt"_ns);
  RefPtr<nsFilePicker> second = CreatePicker(window, u"second.txt"_ns);
  RefPtr<nsFilePicker> third = CreatePicker(window, u"third.txt"_ns);
  RefPtr<PickerCallback> firstCallback = MakeRefPtr<PickerCallback>();
  RefPtr<PickerCallback> secondCallback = MakeRefPtr<PickerCallback>();
  RefPtr<PickerCallback> thirdCallback = MakeRefPtr<PickerCallback>();
  firstCallback->mOnDone = NS_NewRunnableFunction(
      "OpenPickerFromCallback", [third, thirdCallback]() {
        EXPECT_EQ(NS_OK, Open(third, thirdCallback));
      });

  ASSERT_EQ(NS_OK, Open(first, firstCallback));
  ASSERT_EQ(NS_OK, Open(second, secondCallback));
  ProcessEvents();
  ASSERT_EQ(1u, sPresentedPanels.count);
  Complete(0, NSModalResponseCancel);
  ASSERT_EQ(1u, sPresentedPanels.count);
  EXPECT_TRUE([PresentedName() isEqualToString:@"second.txt"]);
  Complete(0, NSModalResponseCancel);
  ASSERT_EQ(1u, sPresentedPanels.count);
  EXPECT_TRUE([PresentedName() isEqualToString:@"third.txt"]);
  Complete(0, NSModalResponseCancel);
  EXPECT_EQ(1u, firstCallback->mCalls);
  EXPECT_EQ(1u, secondCallback->mCalls);
  EXPECT_EQ(1u, thirdCallback->mCalls);
  EXPECT_EQ(0u, sPresentedPanels.count);
  window->Destroy();
}

TEST_F(FilePickerTest, AdvancesWithoutCallerCallback) {
  RefPtr<nsCocoaWindow> window = CreateWindow();
  ASSERT_NE(window, nullptr);
  RefPtr<nsFilePicker> first = CreatePicker(window, u"first.txt"_ns);
  RefPtr<nsFilePicker> second = CreatePicker(window, u"second.txt"_ns);
  RefPtr<PickerCallback> callback = MakeRefPtr<PickerCallback>();

  ASSERT_EQ(NS_OK, Open(first, nullptr));
  ASSERT_EQ(NS_OK, Open(second, callback));
  ProcessEvents();
  ASSERT_EQ(1u, sPresentedPanels.count);
  Complete(0, NSModalResponseCancel);
  ASSERT_EQ(1u, sPresentedPanels.count);
  EXPECT_TRUE([PresentedName() isEqualToString:@"second.txt"]);
  Complete(0, NSModalResponseCancel);
  EXPECT_EQ(1u, callback->mCalls);
  EXPECT_EQ(0u, sPresentedPanels.count);
  window->Destroy();
}

TEST_F(FilePickerTest, QueuesRealSavePanels) {
  gfxPlatform::GetPlatform();
  RestorePanelFactory();
  RefPtr<nsCocoaWindow> window = CreateWindow();
  ASSERT_NE(window, nullptr);
  RefPtr<nsFilePicker> pickers[3];
  RefPtr<PickerCallback> callbacks[3];
  nsTArray<uint32_t> completed;
  auto destroyWindow = MakeScopeExit([&]() {
    for (const auto& callback : callbacks) {
      if (callback) {
        callback->mOnDone = nullptr;
      }
    }
    window->Destroy();
    if (NSSavePanel* panel = NativePanel()) {
      [panel cancel:panel];
      ProcessEvents();
    }
    ProcessEvents();
  });
  window->Show(/* aState = */ true);

  nsCOMPtr<nsIFile> directory;
  ASSERT_EQ(NS_OK,
            NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(directory)));
  const char* filenames[] = {"native-file-picker-queue-first.txt",
                             "native-file-picker-queue-second.txt",
                             "native-file-picker-queue-third.txt"};
  for (uint32_t i = 0; i < 3; ++i) {
    pickers[i] = CreatePicker(window, NS_ConvertASCIItoUTF16(filenames[i]));
    ASSERT_EQ(NS_OK, pickers[i]->SetDisplayDirectory(directory));
    callbacks[i] = MakeRefPtr<PickerCallback>();
    callbacks[i]->mOnDone =
        NS_NewRunnableFunction("RecordNativePickerCompletion",
                               [&, i]() { completed.AppendElement(i); });
    ASSERT_EQ(NS_OK, Open(pickers[i], callbacks[i]));
  }

  // Bound a missing panel or callback without delaying successful runs.
  bool hasTimedOut = false;
  nsCOMPtr<nsITimer> timer;
  ASSERT_EQ(NS_OK,
            NS_NewTimerWithCallback(
                getter_AddRefs(timer), [&](nsITimer*) { hasTimedOut = true; },
                60000, nsITimer::TYPE_ONE_SHOT, "NativeFilePickerTimeout"_ns));
  auto cancelTimer = MakeScopeExit([&]() { timer->Cancel(); });

  for (uint32_t i = 0; i < 3; ++i) {
    ASSERT_TRUE(SpinEventLoopUntil("WaitForNativeFilePicker"_ns, [&]() {
      NSSavePanel* panel = NativePanel();
      return hasTimedOut ||
             (panel &&
              [panel.nameFieldStringValue
                  isEqualToString:[NSString
                                      stringWithUTF8String:filenames[i]]]);
    }));
    ASSERT_FALSE(hasTimedOut)
    << "Missing native panel " << filenames[i];
    ASSERT_EQ(i, completed.Length());
    NSSavePanel* panel = NativePanel();
    ASSERT_NE(panel, nil);
    [panel cancel:panel];
    ASSERT_TRUE(SpinEventLoopUntil("WaitForNativeFilePickerCallback"_ns, [&]() {
      return hasTimedOut || callbacks[i]->mCalls;
    }));
    ASSERT_FALSE(hasTimedOut)
    << "Missing callback for " << filenames[i];
    ASSERT_EQ(i + 1, completed.Length());
    EXPECT_EQ(i, completed[i]);
    EXPECT_EQ(nsIFilePicker::returnCancel, callbacks[i]->mResult);
  }
  ProcessEvents();
  for (const auto& callback : callbacks) {
    EXPECT_EQ(1u, callback->mCalls);
  }
  ASSERT_TRUE(SpinEventLoopUntil("WaitForNativeFilePickerToClose"_ns, [&]() {
    return hasTimedOut || !NativePanel();
  }));
  EXPECT_FALSE(hasTimedOut);
}
