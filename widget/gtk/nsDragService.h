/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsDragService_h_
#define nsDragService_h_

#include <gtk/gtk.h>

#include "GUniquePtr.h"
#include "mozilla/RefPtr.h"
#include "mozilla/UniquePtr.h"
#include "nsBaseDragService.h"
#include "nsClipboard.h"
#include "nsITimer.h"

class nsWindow;

class DragData final {
 public:
  NS_INLINE_DECL_REFCOUNTING(DragData)

  explicit DragData(GdkAtom aDataFlavor, const void* aData, uint32_t aDataLen)
      : mDataFlavor(aDataFlavor),
        mDragDataLen(aDataLen),
        mDragData(moz_xmemdup(aData, aDataLen)) {
    // kURLMime (text/x-moz-url) is received as UTF16 raw data as
    // Gtk doesn't recognize it as URI format. We need to flip it to URI
    // format.
    if (IsURIFlavor()) {
      ConvertToMozURIList();
    }
  }
  explicit DragData(GdkAtom aDataFlavor, mozilla::GUniquePtr<char*> aDragUris);

  GdkAtom GetFlavor() const { return mDataFlavor; }

  // Try to convert text/uri-list or _NETSCAPE_URL MIME to x-moz-url MIME type
  // which is used internally.
  RefPtr<DragData> ConvertToMozURL() const;

  // Try to convert text/uri-list MIME to application/x-moz-file MIME type.
  RefPtr<DragData> ConvertToFile() const;

  bool Export(nsITransferable* aTransferable, uint32_t aItemIndex);

  bool IsImageFlavor() const;
  bool IsFileFlavor() const;
  bool IsTextFlavor() const;
  bool IsURIFlavor() const;

  int GetURIsNum() const;

  bool IsDataValid() const;

#ifdef MOZ_LOGGING
  void Print() const;
#endif

 private:
  explicit DragData(GdkAtom aDataFlavor) : mDataFlavor(aDataFlavor) {}
  ~DragData() = default;

  void ConvertToMozURIList();

  GdkAtom mDataFlavor = nullptr;

  bool mAsURIData = false;

  // In a rare case we export
  bool mDragDataDOMEndings = false;

  // Data obtained from Gtk
  uint32_t mDragDataLen = 0;
  mozilla::UniqueFreePtr<void> mDragData;
  mozilla::GUniquePtr<gchar*> mDragUris;

  // Data which can be passed to transferable. In some cases we can use Gtk data
  // directly but in most cases we need to do UTF8/UTF16 conversion
  // and perform line break;
  nsString mData;
  nsTArray<nsString> mUris;
};

/**
 * GTK native nsIDragSession implementation
 */
class nsDragSession : public nsBaseDragSession {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  // nsIDragSession
  NS_IMETHOD SetCanDrop(bool aCanDrop) override;
  NS_IMETHOD GetCanDrop(bool* aCanDrop) override;

  // Spins event loop, called from JS.
  // Can lead to another round of drag_motion events.
  NS_IMETHOD GetNumDropItems(uint32_t* aNumItems) override;
  NS_IMETHOD GetData(nsITransferable* aTransferable,
                     uint32_t aItemIndex) override;
  NS_IMETHOD IsDataFlavorSupported(const char* aDataFlavor,
                                   bool* _retval) override;

  nsAutoCString GetDebugTag() const;

  MOZ_CAN_RUN_SCRIPT nsresult
  EndDragSessionImpl(bool aDoneDrag, uint32_t aKeyModifiers) override;

  class AutoEventLoop {
    RefPtr<nsDragSession> mSession;

   public:
    explicit AutoEventLoop(RefPtr<nsDragSession> aSession)
        : mSession(std::move(aSession)) {
      nsDragSession::sEventLoopDepth++;
    }
    ~AutoEventLoop() { nsDragSession::sEventLoopDepth--; }
  };

  static int GetLoopDepth() { return sEventLoopDepth; };

  static bool IsTextFlavor(GdkAtom aFlavor);

  virtual void ScheduleLeaveEvent() = 0;

 protected:
  // mScheduledTask indicates what signal has been received from GTK and
  // so what needs to be dispatched when the scheduled task is run.  It is
  // eDragTaskNone when there is no task scheduled (but the
  // previous task may still not have finished running).
  enum DragTaskType {
    eDragTaskNone,
    eDragTaskMotion,
    eDragTaskLeave,
    eDragTaskDrop
  };

  struct DragTask {
    DragTask(DragTaskType aType = eDragTaskNone, nsWindow* aWindow = nullptr,
             const mozilla::LayoutDeviceIntPoint& aWindowPoint =
                 mozilla::LayoutDeviceIntPoint(),
             guint aTime = 0);
    virtual ~DragTask() = default;

    virtual void Reset() = 0;
    virtual uintptr_t GetContextID() = 0;

    DragTaskType mType;
    RefPtr<nsWindow> mWindow;
    mozilla::LayoutDeviceIntPoint mWindowPoint;
    guint mTime;
  };
  // Next drag task in queue
  mozilla::UniquePtr<DragTask> mNextScheduledTask;
  bool mScheduledTaskIsRunning = false;

  // Recent drag task, always present.
  // If empty it's mType = eDragTaskNone.
  mozilla::UniquePtr<DragTask> mRecentTask;

  gboolean Schedule(mozilla::UniquePtr<DragTask> aTask);

  void GetDragFlavors(nsTArray<nsCString>& aFlavors);
  // this will get the native data from the last target given a
  // specific flavor
  void GetTargetDragData(GdkAtom aFlavor, nsTArray<nsCString>& aDropFlavors,
                         bool aResetTargetData = true);
  // this will reset all of the target vars
  void TargetResetData(void);

  virtual void SetRemoteContext() = 0;

  virtual void DropFinish(bool aSucceed) = 0;

  // X11/Wayland specific EndDragSessionImpl handler.
  virtual void EndDragSessionImplBackend() = 0;

  // is the current target drag context contain a list?
  virtual bool IsTargetContextList(void) = 0;

  // We can't overload SetDragAction()/GetDragAction() with
  // the same type of param (int) so use Gtk() suffix.
  void SetDragActionGtk(GdkDragAction aGdkAction);
  GdkDragAction GetDragActionGtk();

#ifdef MOZ_LOGGING
  const char* GetDragServiceTaskName(DragTaskType aTask);
#endif

  MOZ_CAN_RUN_SCRIPT gboolean RunScheduledTask();
  static MOZ_CAN_RUN_SCRIPT int RunScheduledTaskCallback(void* aData);
  MOZ_CAN_RUN_SCRIPT void RunScheduledTask(mozilla::UniquePtr<DragTask> aTask);
  MOZ_CAN_RUN_SCRIPT void DispatchMotionEvents();
  void DispatchDropEvent();
  static uint32_t GetCurrentModifiers();

  void SetCachedDragContext(uintptr_t aDragContextID);

  virtual void ReplyToDragMotion() = 0;
  virtual void UpdateDragAction() = 0;

  bool mDragTaskSourceFinished = false;

  // Where the drag begins. We need to keep it open on Wayland.
  RefPtr<nsWindow> mSourceWindow;

  // our source data items
  nsCOMPtr<nsIArray> mSourceDataItems;

  // last data received and its length
  void* mTargetDragData = nullptr;
  uint32_t mTargetDragDataLen = 0;

  // have we received our drag data?
  bool mTargetDragDataReceived = false;

  mozilla::GUniquePtr<gchar*> mTargetDragUris = nullptr;

  nsTHashMap<nsCStringHashKey, mozilla::GUniquePtr<gchar*>> mCachedUris;

  // We cache all data for the current drag context,
  // because waiting for the data in GetTargetDragData can be very slow.
  nsTHashMap<nsCStringHashKey, nsTArray<uint8_t>> mCachedData;

  // mTaskSource is the GSource id for the task that is either scheduled
  // or currently running.  It is 0 if no task is scheduled or running.
  guint mTaskSource = 0;

  // How deep we're nested in event loops
  static int sEventLoopDepth;

  // is it OK to drop on us?
  bool mCanDrop = false;

 public:
  static const char gMozUrlType[];
  static const char gMimeListType[];
  static const char gTextUriListType[];
  static const char gTextPlainUTF8Type[];
  static const char gXdndDirectSaveType[];
  static const char gTabDropType[];
  static const char gPortalFile[];
  static const char gPortalFileTransfer[];
  static const char gUTF8STRINGType[];
  static const char gSTRINGType[];

  static GdkAtom sJPEGImageMimeAtom;
  static GdkAtom sJPGImageMimeAtom;
  static GdkAtom sPNGImageMimeAtom;
  static GdkAtom sGIFImageMimeAtom;
  static GdkAtom sCustomTypesMimeAtom;
  static GdkAtom sURLMimeAtom;
  static GdkAtom sRTFMimeAtom;
  static GdkAtom sTextMimeAtom;
  static GdkAtom sMozUrlTypeAtom;
  static GdkAtom sMimeListTypeAtom;
  static GdkAtom sTextUriListTypeAtom;
  static GdkAtom sTextPlainUTF8TypeAtom;
  static GdkAtom sXdndDirectSaveTypeAtom;
  static GdkAtom sTabDropTypeAtom;
  static GdkAtom sFileMimeAtom;
  static GdkAtom sPortalFileAtom;
  static GdkAtom sPortalFileTransferAtom;
  static GdkAtom sFilePromiseURLMimeAtom;
  static GdkAtom sFilePromiseMimeAtom;
  static GdkAtom sNativeImageMimeAtom;
  static GdkAtom sUTF8STRINGMimeAtom;
  static GdkAtom sSTRINGMimeAtom;

  nsDragSession();

  // Methods called from nsWindow to handle responding to GTK drag
  // destination signals
  virtual nsWindow* GetMostRecentDestWindow() = 0;

 protected:
  virtual ~nsDragSession();

  // target/destination side vars
  // These variables keep track of the state of the current drag.

  // mCachedDragData/mCachedDragFlavors are tied to mCachedDragContextID.
  // mCachedDragContextID is not ref counted and may be already deleted
  // on Gtk side.
  // We used it for mCachedDragData/mCachedDragFlavors invalidation
  // only and can't be used for any D&D operation.
  uintptr_t mCachedDragContextID = 0;
  nsTHashMap<void*, RefPtr<DragData>> mCachedDragData;
  mozilla::ClipboardTargets mCachedDragFlavors;

  virtual bool IsDragFlavorAvailable(GdkAtom aRequestedFlavor) = 0;

  // this will get the native data from the last target given a
  // specific flavor
  RefPtr<DragData> GetDragData(GdkAtom aRequestedFlavor);
  virtual bool GetDragDataImpl(GdkAtom aRequestedFlavor) = 0;
};

/**
 * Native GTK nsIDragService implementation
 */
class nsDragService : public nsBaseDragService {
 public:
  nsDragService();

  static already_AddRefed<nsDragService> GetInstance();
  nsIDragSession* StartDragSession(nsISupports* aWidgetProvider) override;

 protected:
  already_AddRefed<nsIDragSession> CreateDragSession() override;
#ifdef MOZ_WAYLAND
  RefPtr<mozilla::RetrievalContext> mContext;
#endif
};

#endif  // nsDragService_h_
