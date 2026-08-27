/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsDragSessionSource_h_
#define nsDragSessionSource_h_

#include "nsDragService.h"

class nsICookieJarSettings;

namespace mozilla::gfx {
class SourceSurface;
}

/**
 * Intermediate class between nsDragSession and platform-specific
 * nsDragSessionGtk/nsDragSessionWayland, containing all drag source logic.
 */
class nsDragSessionSource : public nsDragSession {
 public:
  nsDragSessionSource();

  // nsBaseDragSession
  MOZ_CAN_RUN_SCRIPT nsresult
  InvokeDragSessionImpl(nsIWidget* aWidget, nsIArray* anArrayTransferables,
                        const mozilla::Maybe<mozilla::CSSIntRegion>& aRegion,
                        uint32_t aActionType) override;

  // nsIDragSession
  MOZ_CAN_RUN_SCRIPT NS_IMETHOD InvokeDragSession(
      nsIWidget* aWidget, nsINode* aDOMNode, nsIPrincipal* aPrincipal,
      nsIPolicyContainer* aPolicyContainer,
      nsICookieJarSettings* aCookieJarSettings, nsIArray* anArrayTransferables,
      uint32_t aActionType, nsContentPolicyType aContentPolicyType) override;

  MOZ_CAN_RUN_SCRIPT nsresult
  EndDragSessionImpl(bool aDoneDrag, uint32_t aKeyModifiers) override;
  MOZ_CAN_RUN_SCRIPT void EndDragSessionMainThread();

  // Called from functions with C calling conventions for drags started with
  // the invisible widget.
  void SourceEndDragSession(GdkDragContext* aContext, gint aResult);
  void SourceDataGet(GtkWidget* widget, GdkDragContext* context,
                     GtkSelectionData* selection_data, guint32 aTime);
  bool SourceDataGetText(nsITransferable* aItem, const nsACString& aMIMEType,
                         bool aNeedToDoConversionToPlainText,
                         GtkSelectionData* aSelectionData);
  bool SourceDataGetImage(nsITransferable* aItem,
                          GtkSelectionData* aSelectionData);
  bool SourceDataGetXDND(nsITransferable* aItem, GdkDragContext* aContext,
                         GtkSelectionData* aSelectionData);
  void SourceDataGetUriList(GdkDragContext* aContext,
                            GtkSelectionData* aSelectionData,
                            uint32_t aDragItems);
  bool SourceDataAppendURLFileItem(nsACString& aURI, nsITransferable* aItem);
  bool SourceDataAppendURLItem(nsITransferable* aItem, bool aExternalDrop,
                               nsACString& aURI);
  void SourceBeginDrag(GdkDragContext* aContext);

  void SetDragIcon(GdkDragContext* aContext);

  void MarkAsActive() { mActive = true; }
  bool IsActive() const { return mActive; }

 protected:
  virtual ~nsDragSessionSource();

  bool SetAlphaPixmap(mozilla::gfx::SourceSurface* aPixbuf,
                      GdkDragContext* aContext, int32_t aXOffset,
                      int32_t aYOffset,
                      const mozilla::LayoutDeviceIntRect& dragRect);

  GtkTargetList* GetSourceList(void);

  nsresult CreateTempFile(nsITransferable* aItem, nsACString& aURI);

  static gboolean TaskRemoveTempFiles(gpointer data);
  bool RemoveTempFiles();

  // The source of our drags
  GtkWidget* mHiddenWidget;
  // Workaround for Bug 1979719. We consider D&D session running only after
  // first "move" event on Wayland.
  bool mActive = false;

  nsCOMArray<nsIFile> mTemporaryFiles;
  guint mTempFileTimerID;
  nsTArray<nsCString> mTempFileUrls;
};

#endif  // nsDragSessionSource_h_
