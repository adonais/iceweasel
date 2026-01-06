/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  const isTab = element => gBrowser.isTab(element);
  const isTabGroupLabel = element => gBrowser.isTabGroupLabel(element);
  const isSplitViewWrapper = element => gBrowser.isSplitViewWrapper(element);
  /**
   * The elements in the tab strip from `this.dragAndDropElements` that contain
   * logical information are:
   *
   * - <tab> (.tabbrowser-tab)
   * - <tab-group> label element (.tab-group-label)
   * - <tab-split-view-wrapper>
   *
   * The elements in the tab strip that contain the space inside of the <tabs>
   * element are:
   *
   * - <tab> (.tabbrowser-tab)
   * - <tab-group> label element wrapper (.tab-group-label-container)
   * - <tab-split-view-wrapper>
   *
   * When working with tab strip items, if you need logical information, you
   * can get it directly, e.g. `element.elementIndex` or `element._tPos`. If
   * you need spatial information like position or dimensions, then you should
   * call this function. For example, `elementToMove(element).getBoundingClientRect()`
   * or `elementToMove(element).style.top`.
   *
   * @param {MozTabbrowserTab|typeof MozTabbrowserTabGroup.labelElement} element
   * @returns {MozTabbrowserTab|vbox}
   */
  const elementToMove = element => {
    if (isTab(element) || isSplitViewWrapper(element)) {
      return element;
    }
    if (isTabGroupLabel(element)) {
      return element.closest(".tab-group-label-container");
    }
    throw new Error(`Element "${element.tagName}" is not expected to move`);
  };

  window.TabStacking = class extends window.TabDragAndDrop {
    constructor(tabbrowserTabs) {
      super(tabbrowserTabs);
    }

    // eslint-disable-next-line complexity
    handle_drop(event) {
      var dt = event.dataTransfer;
      var dropEffect = dt.dropEffect;
      var draggedTab;
      let movingTabs;
      /** @type {TabMetricsContext} */
      const dropMetricsContext = gBrowser.TabMetrics.userTriggeredContext(
        gBrowser.TabMetrics.METRIC_SOURCE.DRAG_AND_DROP
      );
      if (dt.mozTypesAt(0)[0] == TAB_DROP_TYPE) {
        // tab copy or move
        draggedTab = dt.mozGetDataAt(TAB_DROP_TYPE, 0);
        // not our drop then
        if (!draggedTab) {
          return;
        }
        movingTabs = draggedTab._dragData.movingTabs;
        draggedTab.container.tabDragAndDrop.finishMoveTogetherSelectedTabs(
          draggedTab
        );
      }

      if (this._rtlMode) {
        // In `startTabDrag` we reverse the moving tabs order to handle
        // positioning and animation. For drop, we require the original
        // order, so reverse back.
        movingTabs?.reverse();
      }

      let overPinnedDropIndicator =
        this._pinnedDropIndicator.hasAttribute("visible") &&
        this._pinnedDropIndicator.hasAttribute("interactive");
      this._resetTabsAfterDrop(draggedTab?.ownerDocument);

      this._tabDropIndicator.hidden = true;
      event.stopPropagation();
      if (draggedTab && dropEffect == "copy") {
        let duplicatedDraggedTab;
        let duplicatedTabs = [];
        let dropTarget =
          this._tabbrowserTabs.dragAndDropElements[this._getDropIndex(event)];
        for (let tab of movingTabs) {
          let duplicatedTab = gBrowser.duplicateTab(tab);
          duplicatedTabs.push(duplicatedTab);
          if (tab == draggedTab) {
            duplicatedDraggedTab = duplicatedTab;
          }
        }
        gBrowser.moveTabsBefore(duplicatedTabs, dropTarget, dropMetricsContext);
        if (draggedTab.container != this._tabbrowserTabs || event.shiftKey) {
          this._tabbrowserTabs.selectedItem = duplicatedDraggedTab;
        }
      } else if (draggedTab && draggedTab.container == this._tabbrowserTabs) {
        let oldTranslateX = Math.round(draggedTab._dragData.translateX);
        let oldTranslateY = Math.round(draggedTab._dragData.translateY);
        let tabWidth = Math.round(draggedTab._dragData.tabWidth);
        let tabHeight = Math.round(draggedTab._dragData.tabHeight);
        let translateOffsetX = oldTranslateX % tabWidth;
        let translateOffsetY = oldTranslateY % tabHeight;
        let newTranslateX = oldTranslateX - translateOffsetX;
        let newTranslateY = oldTranslateY - translateOffsetY;
        let isPinned = draggedTab.pinned;
        let numPinned = gBrowser.pinnedTabCount;
        let tabs = this._tabbrowserTabs.dragAndDropElements.slice(
          isPinned ? 0 : numPinned,
          isPinned ? numPinned : undefined
        );

        if (this._isContainerVerticalPinnedGrid(draggedTab)) {
          // Update both translate axis for pinned vertical expanded tabs
          if (oldTranslateX > 0 && translateOffsetX > tabWidth / 2) {
            newTranslateX += tabWidth;
          } else if (oldTranslateX < 0 && -translateOffsetX > tabWidth / 2) {
            newTranslateX -= tabWidth;
          }
          if (oldTranslateY > 0 && translateOffsetY > tabHeight / 2) {
            newTranslateY += tabHeight;
          } else if (oldTranslateY < 0 && -translateOffsetY > tabHeight / 2) {
            newTranslateY -= tabHeight;
          }
        } else {
          let size = this._tabbrowserTabs.verticalMode ? "height" : "width";
          let screenAxis = this._tabbrowserTabs.verticalMode
            ? "screenY"
            : "screenX";
          let tabSize = this._tabbrowserTabs.verticalMode
            ? tabHeight
            : tabWidth;
          let firstTab = tabs[0];
          let lastTab = tabs.at(-1);
          let lastMovingTabScreen = movingTabs.at(-1)[screenAxis];
          let firstMovingTabScreen = movingTabs[0][screenAxis];
          let startBound = firstTab[screenAxis] - firstMovingTabScreen;
          let endBound =
            lastTab[screenAxis] +
            window.windowUtils.getBoundsWithoutFlushing(lastTab)[size] -
            (lastMovingTabScreen + tabSize);
          if (this._tabbrowserTabs.verticalMode) {
            newTranslateY = Math.min(
              Math.max(oldTranslateY, startBound),
              endBound
            );
          } else {
            newTranslateX = RTL_UI
              ? Math.min(Math.max(oldTranslateX, endBound), startBound)
              : Math.min(Math.max(oldTranslateX, startBound), endBound);
          }
        }

        let {
          dropElement,
          dropBefore,
          shouldCreateGroupOnDrop,
          shouldDropIntoCollapsedTabGroup,
          fromTabList,
        } = draggedTab._dragData;

        let dropIndex;
        let directionForward = false;
        if (fromTabList) {
          dropIndex = this._getDropIndex(event);
          if (dropIndex && dropIndex > movingTabs[0].elementIndex) {
            dropIndex--;
            directionForward = true;
          }
        } else if (
          draggedTab.currentIndex > tabs[tabs.length - 1].currentIndex
        ) {
          // There is a case where the currentIndex could be greater than the last item's in
          // the container. If this is the case, dropIndex needs to be set to the last item's
          // elementIndex to ensure the draggedTab/s are dropped in the last position.
          dropIndex = tabs[tabs.length - 1].elementIndex;
        }

        const dragToPinTargets = [
          this._tabbrowserTabs.pinnedTabsContainer,
          this._dragToPinPromoCard,
        ];
        let shouldPin =
          isTab(draggedTab) &&
          !draggedTab.pinned &&
          (overPinnedDropIndicator ||
            dragToPinTargets.some(el => el.contains(event.target)));
        let shouldUnpin =
          isTab(draggedTab) &&
          draggedTab.pinned &&
          this._tabbrowserTabs.arrowScrollbox.contains(event.target);

        let shouldTranslate =
          !gReduceMotion &&
          !shouldCreateGroupOnDrop &&
          !shouldDropIntoCollapsedTabGroup &&
          !isTabGroupLabel(draggedTab) &&
          !shouldPin &&
          !shouldUnpin;
        if (this._isContainerVerticalPinnedGrid(draggedTab)) {
          shouldTranslate &&=
            (oldTranslateX && oldTranslateX != newTranslateX) ||
            (oldTranslateY && oldTranslateY != newTranslateY);
        } else if (this._tabbrowserTabs.verticalMode) {
          shouldTranslate &&= oldTranslateY && oldTranslateY != newTranslateY;
        } else {
          shouldTranslate &&= oldTranslateX && oldTranslateX != newTranslateX;
        }

        let moveTabs = () => {
          if (dropIndex !== undefined) {
            for (let tab of movingTabs) {
              gBrowser.moveTabTo(
                tab,
                { elementIndex: dropIndex },
                dropMetricsContext
              );
              if (!directionForward) {
                dropIndex++;
              }
            }
          } else if (dropElement && dropBefore) {
            gBrowser.moveTabsBefore(
              movingTabs,
              dropElement,
              dropMetricsContext
            );
          } else if (dropElement && dropBefore != undefined) {
            gBrowser.moveTabsAfter(movingTabs, dropElement, dropMetricsContext);
          }

          if (isTabGroupLabel(draggedTab)) {
            this._setIsDraggingTabGroup(draggedTab.group, false);
            this._expandGroupOnDrop(draggedTab);
          }
        };

        if (shouldPin || shouldUnpin) {
          for (let item of movingTabs) {
            if (shouldPin) {
              gBrowser.pinTab(item, {
                telemetrySource:
                  gBrowser.TabMetrics.METRIC_SOURCE.DRAG_AND_DROP,
              });
            } else if (shouldUnpin) {
              gBrowser.unpinTab(item);
            }
          }
        }

        if (shouldTranslate) {
          let translationPromises = [];
          for (let item of movingTabs) {
            item = elementToMove(item);
            let translationPromise = new Promise(resolve => {
              item.toggleAttribute("tabdrop-samewindow", true);
              item.style.transform = `translate(${newTranslateX}px, ${newTranslateY}px)`;
              let postTransitionCleanup = () => {
                item.removeAttribute("tabdrop-samewindow");
                resolve();
              };
              if (gReduceMotion) {
                postTransitionCleanup();
              } else {
                let onTransitionEnd = transitionendEvent => {
                  if (
                    transitionendEvent.propertyName != "transform" ||
                    transitionendEvent.originalTarget != item
                  ) {
                    return;
                  }
                  item.removeEventListener("transitionend", onTransitionEnd);

                  postTransitionCleanup();
                };
                item.addEventListener("transitionend", onTransitionEnd);
              }
            });
            translationPromises.push(translationPromise);
          }
          Promise.all(translationPromises).then(() => {
            this.finishAnimateTabMove();
            moveTabs();
          });
        } else {
          this.finishAnimateTabMove();
          if (shouldCreateGroupOnDrop) {
            // This makes the tab group contents reflect the visual order of
            // the tabs right before dropping.
            let tabsInGroup = dropBefore
              ? [...movingTabs, dropElement]
              : [dropElement, ...movingTabs];
            gBrowser.addTabGroup(tabsInGroup, {
              insertBefore: dropElement,
              isUserTriggered: true,
              color: draggedTab._dragData.tabGroupCreationColor,
              telemetryUserCreateSource: "drag",
            });
          } else if (
            shouldDropIntoCollapsedTabGroup &&
            isTabGroupLabel(dropElement) &&
            isTab(draggedTab)
          ) {
            // If the dragged tab is the active tab in a collapsed tab group
            // and the user dropped it onto the label of its tab group, leave
            // the dragged tab where it was. Otherwise, drop it into the target
            // tab group.
            if (dropElement.group != draggedTab.group) {
              dropElement.group.addTabs(movingTabs, dropMetricsContext);
            }
          } else {
            moveTabs();
            this._tabbrowserTabs._notifyBackgroundTab(movingTabs.at(-1));
          }
        }
      } else if (isTabGroupLabel(draggedTab)) {
        gBrowser.adoptTabGroup(draggedTab.group, {
          elementIndex: this._getDropIndex(event),
        });
      } else if (draggedTab) {
        // Move the tabs into this window. To avoid multiple tab-switches in
        // the original window, the selected tab should be adopted last.
        const dropIndex = this._getDropIndex(event);
        let newIndex = dropIndex;
        let selectedTab;
        let indexForSelectedTab;
        for (let i = 0; i < movingTabs.length; ++i) {
          const tab = movingTabs[i];
          if (tab.selected) {
            selectedTab = tab;
            indexForSelectedTab = newIndex;
          } else {
            const newTab = gBrowser.adoptTab(tab, {
              elementIndex: newIndex,
              selectTab: tab == draggedTab,
            });
            if (newTab) {
              ++newIndex;
            }
          }
        }
        if (selectedTab) {
          const newTab = gBrowser.adoptTab(selectedTab, {
            elementIndex: indexForSelectedTab,
            selectTab: selectedTab == draggedTab,
          });
          if (newTab) {
            ++newIndex;
          }
        }

        // Restore tab selection
        gBrowser.addRangeToMultiSelectedTabs(
          this._tabbrowserTabs.dragAndDropElements[dropIndex],
          this._tabbrowserTabs.dragAndDropElements[newIndex - 1]
        );
      } else {
        // Pass true to disallow dropping javascript: or data: urls
        let links;
        try {
          links = Services.droppedLinkHandler.dropLinks(event, true);
        } catch (ex) {}

        if (!links || links.length === 0) {
          return;
        }

        let inBackground = Services.prefs.getBoolPref(
          "browser.tabs.loadInBackground"
        );
        if (event.shiftKey) {
          inBackground = !inBackground;
        }

        let targetTab = this._getDragTarget(event, { ignoreSides: true });
        let userContextId =
          this._tabbrowserTabs.selectedItem.getAttribute("usercontextid");
        let replace = isTab(targetTab);
        let newIndex = this._getDropIndex(event);
        let urls = links.map(link => link.url);
        let policyContainer =
          Services.droppedLinkHandler.getPolicyContainer(event);
        let triggeringPrincipal =
          Services.droppedLinkHandler.getTriggeringPrincipal(event);

        (async () => {
          if (
            urls.length >=
            Services.prefs.getIntPref("browser.tabs.maxOpenBeforeWarn")
          ) {
            // Sync dialog cannot be used inside drop event handler.
            let answer = await OpenInTabsUtils.promiseConfirmOpenInTabs(
              urls.length,
              window
            );
            if (!answer) {
              return;
            }
          }

          let nextItem = this._tabbrowserTabs.dragAndDropElements[newIndex];
          let tabGroup = isTab(nextItem) && nextItem.group;
          gBrowser.loadTabs(urls, {
            inBackground,
            replace,
            allowThirdPartyFixup: true,
            targetTab,
            elementIndex: newIndex,
            tabGroup,
            userContextId,
            triggeringPrincipal,
            policyContainer,
          });
        })();
      }

      for (let tab of this._tabbrowserTabs.dragAndDropElements) {
        delete tab.currentIndex;
      }

      if (draggedTab) {
        delete draggedTab._dragData;
      }
    }

    /**
     * Move together all selected tabs around the tab in param.
     */
    _moveTogetherSelectedTabs(tab) {
      let selectedTabs = gBrowser.selectedTabs;
      let tabIndex = selectedTabs.indexOf(tab);
      if (selectedTabs.some(t => t.pinned != tab.pinned)) {
        throw new Error(
          "Cannot move together a mix of pinned and unpinned tabs."
        );
      }
      let isGrid = this._isContainerVerticalPinnedGrid(tab);
      let animate = !gReduceMotion;

      tab._moveTogetherSelectedTabsData = {
        finished: !animate,
      };

      tab.toggleAttribute("multiselected-move-together", true);

      let addAnimationData = movingTab => {
        movingTab._moveTogetherSelectedTabsData = {
          translateX: 0,
          translateY: 0,
          animate: true,
        };
        movingTab.toggleAttribute("multiselected-move-together", true);

        let postTransitionCleanup = () => {
          movingTab._moveTogetherSelectedTabsData.animate = false;
        };
        if (gReduceMotion) {
          postTransitionCleanup();
        } else {
          let onTransitionEnd = transitionendEvent => {
            if (
              transitionendEvent.propertyName != "transform" ||
              transitionendEvent.originalTarget != movingTab
            ) {
              return;
            }
            movingTab.removeEventListener("transitionend", onTransitionEnd);
            postTransitionCleanup();
          };

          movingTab.addEventListener("transitionend", onTransitionEnd);
        }

        let tabRect = tab.getBoundingClientRect();
        let movingTabRect = movingTab.getBoundingClientRect();
        movingTab._moveTogetherSelectedTabsData.translateX =
          tabRect.x - movingTabRect.x;
        movingTab._moveTogetherSelectedTabsData.translateY =
          tabRect.y - movingTabRect.y;
      };

      let selectedIndices = selectedTabs.map(t => t.elementIndex);
      let currentIndex = 0;
      let draggedRect = tab.getBoundingClientRect();
      let translateX = 0;
      let translateY = 0;

      // The currentIndex represents the indexes for all visible tab strip items after the
      // selected tabs have moved together. These values make the math in _animateTabMove and
      // _animateExpandedPinnedTabMove possible and less prone to edge cases when dragging
      // multiple tabs.
      for (let unmovingTab of this._tabbrowserTabs.dragAndDropElements) {
        if (unmovingTab.multiselected) {
          unmovingTab.currentIndex = tab.elementIndex;
          // Skip because this multiselected tab should
          // be shifted towards the dragged Tab.
          continue;
        }
        if (unmovingTab.elementIndex > selectedIndices[currentIndex]) {
          while (
            selectedIndices[currentIndex + 1] &&
            unmovingTab.elementIndex > selectedIndices[currentIndex + 1]
          ) {
            let currentRect = selectedTabs
              .find(t => t.elementIndex == selectedIndices[currentIndex])
              .getBoundingClientRect();
            // For everything but the grid, we need to work out the shift required based
            // on the size of the tabs being dragged together.
            translateY -= currentRect.height;
            translateX -= currentRect.width;
            currentIndex++;
          }

          // Find the new index of the tab once selected tabs have moved together to use
          // for positioning and animation
          let isAfterDraggedTab =
            unmovingTab.elementIndex - currentIndex > tab.elementIndex;
          let newIndex = isAfterDraggedTab
            ? unmovingTab.elementIndex - currentIndex
            : unmovingTab.elementIndex - currentIndex - 1;
          let newTranslateX = isAfterDraggedTab
            ? translateX
            : translateX - draggedRect.width;
          let newTranslateY = isAfterDraggedTab
            ? translateY
            : translateY - draggedRect.height;
          unmovingTab.currentIndex = newIndex;
          unmovingTab._moveTogetherSelectedTabsData = {
            translateX: 0,
            translateY: 0,
          };
          if (isGrid) {
            // For the grid, use the position of the tab with the old index to dictate the
            // translation needed for the background tab with the new index to move there.
            let unmovingTabRect = unmovingTab.getBoundingClientRect();
            let oldTabRect =
              this._tabbrowserTabs.dragAndDropElements[
                newIndex
              ].getBoundingClientRect();
            unmovingTab._moveTogetherSelectedTabsData.translateX =
              oldTabRect.x - unmovingTabRect.x;
            unmovingTab._moveTogetherSelectedTabsData.translateY =
              oldTabRect.y - unmovingTabRect.y;
          } else if (this._tabbrowserTabs.verticalMode) {
            unmovingTab._moveTogetherSelectedTabsData.translateY =
              newTranslateY;
          } else {
            unmovingTab._moveTogetherSelectedTabsData.translateX =
              newTranslateX;
          }
        } else {
          unmovingTab.currentIndex = unmovingTab.elementIndex;
        }
      }

      // Animate left or top selected tabs
      for (let i = 0; i < tabIndex; i++) {
        let movingTab = selectedTabs[i];
        addAnimationData(movingTab);
      }
      // Animate right or bottom selected tabs
      for (let i = selectedTabs.length - 1; i > tabIndex; i--) {
        let movingTab = selectedTabs[i];
        addAnimationData(movingTab);
      }

      // Slide the relevant tabs to their new position.
      // non-moving tabs adjust for RTL
      for (let item of this._tabbrowserTabs.dragAndDropElements) {
        if (
          !tab._dragData.movingTabsSet.has(item) &&
          (item._moveTogetherSelectedTabsData?.translateX ||
            item._moveTogetherSelectedTabsData?.translateY) &&
          ((item.pinned && tab.pinned) || (!item.pinned && !tab.pinned))
        ) {
          let element = elementToMove(item);
          if (isGrid) {
            element.style.transform = `translate(${(this._rtlMode ? -1 : 1) * item._moveTogetherSelectedTabsData.translateX}px, ${item._moveTogetherSelectedTabsData.translateY}px)`;
          } else if (this._tabbrowserTabs.verticalMode) {
            element.style.transform = `translateY(${item._moveTogetherSelectedTabsData.translateY}px)`;
          } else {
            element.style.transform = `translateX(${(this._rtlMode ? -1 : 1) * item._moveTogetherSelectedTabsData.translateX}px)`;
          }
        }
      }
      // moving tabs don't adjust for RTL
      for (let item of selectedTabs) {
        if (
          item._moveTogetherSelectedTabsData?.translateX ||
          item._moveTogetherSelectedTabsData?.translateY
        ) {
          let element = elementToMove(item);
          element.style.transform = `translate(${item._moveTogetherSelectedTabsData.translateX}px, ${item._moveTogetherSelectedTabsData.translateY}px)`;
        }
      }
    }

    finishMoveTogetherSelectedTabs(tab) {
      if (
        !tab._moveTogetherSelectedTabsData ||
        (tab._moveTogetherSelectedTabsData.finished && !gReduceMotion)
      ) {
        return;
      }

      if (tab._moveTogetherSelectedTabsData) {
        tab._moveTogetherSelectedTabsData.finished = true;
      }

      let selectedTabs = gBrowser.selectedTabs;
      let tabIndex = selectedTabs.indexOf(tab);

      // Moving left or top tabs
      for (let i = 0; i < tabIndex; i++) {
        gBrowser.moveTabBefore(selectedTabs[i], tab);
      }

      // Moving right or bottom tabs
      for (let i = selectedTabs.length - 1; i > tabIndex; i--) {
        gBrowser.moveTabAfter(selectedTabs[i], tab);
      }

      for (let item of this._tabbrowserTabs.dragAndDropElements) {
        delete item._moveTogetherSelectedTabsData;
        item = elementToMove(item);
        item.style.transform = "";
        item.removeAttribute("multiselected-move-together");
      }
    }

    /* In order to to drag tabs between both the pinned arrowscrollbox (pinned tab container)
      and unpinned arrowscrollbox (tabbrowser-arrowscrollbox), the dragged tabs need to be
      positioned absolutely. This results in a shift in the layout, filling the empty space.
      This function updates the position and widths of elements affected by this layout shift
      when the tab is first selected to be dragged.
    */
    _updateTabStylesOnDrag(tab, dropEffect) {
      let tabStripItemElement = elementToMove(tab);
      tabStripItemElement.style.pointerEvents =
        dropEffect == "copy" ? "auto" : "";
      if (tabStripItemElement.hasAttribute("dragtarget")) {
        return;
      }
      let isPinned = tab.pinned;
      let dragAndDropElements = this._tabbrowserTabs.dragAndDropElements;
      let isGrid = this._isContainerVerticalPinnedGrid(tab);
      let periphery = document.getElementById(
        "tabbrowser-arrowscrollbox-periphery"
      );

      if (isPinned && this._tabbrowserTabs.verticalMode) {
        this._tabbrowserTabs.pinnedTabsContainer.setAttribute("dragActive", "");
      }

      // Ensure tab containers retain size while tabs are dragged out of the layout
      let pinnedRect = window.windowUtils.getBoundsWithoutFlushing(
        this._tabbrowserTabs.pinnedTabsContainer.scrollbox
      );
      let pinnedContainerRect = window.windowUtils.getBoundsWithoutFlushing(
        this._tabbrowserTabs.pinnedTabsContainer
      );
      let unpinnedRect = window.windowUtils.getBoundsWithoutFlushing(
        this._tabbrowserTabs.arrowScrollbox.scrollbox
      );
      let tabContainerRect = window.windowUtils.getBoundsWithoutFlushing(
        this._tabbrowserTabs
      );

      if (this._tabbrowserTabs.pinnedTabsContainer.firstChild) {
        this._tabbrowserTabs.pinnedTabsContainer.scrollbox.style.height =
          pinnedRect.height + "px";
        // Use "minHeight" so as not to interfere with user preferences for height.
        this._tabbrowserTabs.pinnedTabsContainer.style.minHeight =
          pinnedContainerRect.height + "px";
        this._tabbrowserTabs.pinnedTabsContainer.scrollbox.style.width =
          pinnedRect.width + "px";
      }
      this._tabbrowserTabs.arrowScrollbox.scrollbox.style.height =
        unpinnedRect.height + "px";
      this._tabbrowserTabs.arrowScrollbox.scrollbox.style.width =
        unpinnedRect.width + "px";

      let { movingTabs, movingTabsSet, expandGroupOnDrop } = tab._dragData;
      /** @type {(MozTabbrowserTab|typeof MozTabbrowserTabGroup.labelElement)[]} */
      let suppressTransitionsFor = [];
      /** @type {Map<MozTabbrowserTab, DOMRect>} */

      const tabsOrigBounds = new Map();

      for (let t of dragAndDropElements) {
        t = elementToMove(t);
        let tabRect = window.windowUtils.getBoundsWithoutFlushing(t);

        // record where all the tabs were before we position:absolute the moving tabs
        tabsOrigBounds.set(t, tabRect);

        // Prevent flex rules from resizing non dragged tabs while the dragged
        // tabs are positioned absolutely
        t.style.maxWidth = tabRect.width + "px";
        // Prevent non-moving tab strip items from performing any animations
        // at the very beginning of the drag operation; this prevents them
        // from appearing to move while the dragged tabs are positioned absolutely
        let isTabInCollapsingGroup = expandGroupOnDrop && t.group == tab.group;
        if (!movingTabsSet.has(t) && !isTabInCollapsingGroup) {
          t.style.transition = "none";
          suppressTransitionsFor.push(t);
        }
      }

      if (suppressTransitionsFor.length) {
        window
          .promiseDocumentFlushed(() => {})
          .then(() => {
            window.requestAnimationFrame(() => {
              for (let t of suppressTransitionsFor) {
                t.style.transition = "";
              }
            });
          });
      }

      // Use .tab-group-label-container or .tabbrowser-tab for size/position
      // calculations.
      let rect =
        window.windowUtils.getBoundsWithoutFlushing(tabStripItemElement);
      // Vertical tabs live under the #sidebar-main element which gets animated and has a
      // transform style property, making it the containing block for all its descendants.
      // Position:absolute elements need to account for this when updating position using
      // other measurements whose origin is the viewport or documentElement's 0,0
      let movingTabsOffsetX = window.windowUtils.getBoundsWithoutFlushing(
        tabStripItemElement.offsetParent
      ).x;

      for (let movingTab of movingTabs) {
        movingTab = elementToMove(movingTab);
        movingTab.style.width = rect.width + "px";
        // "dragtarget" contains the following rules which must only be set AFTER the above
        // elements have been adjusted. {z-index: 3 !important, position: absolute !important}
        movingTab.setAttribute("dragtarget", "");
        if (isTabGroupLabel(tab)) {
          if (this._tabbrowserTabs.verticalMode) {
            movingTab.style.top = rect.top - tabContainerRect.top + "px";
          } else {
            movingTab.style.left = rect.left - movingTabsOffsetX + "px";
            movingTab.style.height = rect.height + "px";
          }
        } else if (isGrid) {
          movingTab.style.top = rect.top - pinnedRect.top + "px";
          movingTab.style.left = rect.left - movingTabsOffsetX + "px";
        } else if (this._tabbrowserTabs.verticalMode) {
          movingTab.style.top = rect.top - tabContainerRect.top + "px";
        } else if (this._rtlMode) {
          movingTab.style.left = rect.left - movingTabsOffsetX + "px";
        } else {
          movingTab.style.left = rect.left - movingTabsOffsetX + "px";
        }
      }

      if (movingTabs.length == 2) {
        tab.setAttribute("small-stack", "");
      } else if (movingTabs.length > 2) {
        tab.setAttribute("big-stack", "");
      }

      if (
        !isPinned &&
        this._tabbrowserTabs.arrowScrollbox.hasAttribute("overflowing")
      ) {
        if (this._tabbrowserTabs.verticalMode) {
          periphery.style.marginBlockStart = rect.height + "px";
        } else {
          periphery.style.marginInlineStart = rect.width + "px";
        }
      } else if (
        isPinned &&
        this._tabbrowserTabs.pinnedTabsContainer.hasAttribute("overflowing")
      ) {
        let pinnedPeriphery = document.createXULElement("hbox");
        pinnedPeriphery.id = "pinned-tabs-container-periphery";
        pinnedPeriphery.style.width = "100%";
        pinnedPeriphery.style.marginBlockStart = rect.height + "px";
        this._tabbrowserTabs.pinnedTabsContainer.appendChild(pinnedPeriphery);
      }

      let setElPosition = el => {
        let origBounds = tabsOrigBounds.get(el);
        if (this._tabbrowserTabs.verticalMode && origBounds.top > rect.top) {
          el.style.top = rect.height + "px";
        } else if (!this._tabbrowserTabs.verticalMode) {
          if (!this._rtlMode && origBounds.left > rect.left) {
            el.style.left = rect.width + "px";
          } else if (this._rtlMode && origBounds.left < rect.left) {
            el.style.left = -rect.width + "px";
          }
        }
      };

      let setGridElPosition = el => {
        let origBounds = tabsOrigBounds.get(el);
        if (!origBounds) {
          // No bounds saved for this pinned tab
          return;
        }
        // We use getBoundingClientRect and force a reflow as we need to know their new positions
        // after making the moving tabs position:absolute
        let newBounds = el.getBoundingClientRect();
        let shiftX = origBounds.x - newBounds.x;
        let shiftY = origBounds.y - newBounds.y;

        el.style.left = shiftX + "px";
        el.style.top = shiftY + "px";
      };

      // Update tabs in the same container as the dragged tabs so as not
      // to fill the space when the dragged tabs become absolute
      for (let t of dragAndDropElements) {
        let tabIsPinned = t.pinned;
        t = elementToMove(t);
        if (!t.hasAttribute("dragtarget")) {
          if (
            (!isPinned && !tabIsPinned) ||
            (tabIsPinned && isPinned && !isGrid)
          ) {
            setElPosition(t);
          } else if (isGrid && tabIsPinned && isPinned) {
            setGridElPosition(t);
          }
        }
      }

      // Handle the new tab button filling the space when the dragged tab
      // position becomes absolute
      if (!this._tabbrowserTabs.overflowing && !isPinned) {
        if (this._tabbrowserTabs.verticalMode) {
          periphery.style.top = `${rect.height}px`;
        } else if (this._rtlMode) {
          periphery.style.left = `${-rect.width}px`;
        } else {
          periphery.style.left = `${rect.width}px`;
        }
      }
    }

    // eslint-disable-next-line complexity
    _animateTabMove(event) {
      let draggedTab = event.dataTransfer.mozGetDataAt(TAB_DROP_TYPE, 0);
      let dragData = draggedTab._dragData;
      let movingTabs = dragData.movingTabs;
      let movingTabsSet = dragData.movingTabsSet;

      dragData.animLastScreenPos ??= this._tabbrowserTabs.verticalMode
        ? dragData.screenY
        : dragData.screenX;
      let screen = this._tabbrowserTabs.verticalMode
        ? event.screenY
        : event.screenX;
      if (screen == dragData.animLastScreenPos) {
        return;
      }
      let screenForward = screen > dragData.animLastScreenPos;
      dragData.animLastScreenPos = screen;

      this._clearDragOverGroupingTimer();

      let isPinned = draggedTab.pinned;
      let numPinned = gBrowser.pinnedTabCount;
      let dragAndDropElements = this._tabbrowserTabs.dragAndDropElements;
      let tabs = dragAndDropElements.slice(
        isPinned ? 0 : numPinned,
        isPinned ? numPinned : undefined
      );

      if (this._rtlMode) {
        tabs.reverse();
      }

      let bounds = ele => window.windowUtils.getBoundsWithoutFlushing(ele);
      let logicalForward = screenForward != this._rtlMode;
      let screenAxis = this._tabbrowserTabs.verticalMode
        ? "screenY"
        : "screenX";
      let size = this._tabbrowserTabs.verticalMode ? "height" : "width";
      let translateAxis = this._tabbrowserTabs.verticalMode
        ? "translateY"
        : "translateX";
      let translateX = event.screenX - dragData.screenX;
      let translateY = event.screenY - dragData.screenY;

      // Move the dragged tab based on the mouse position.
      let periphery = document.getElementById(
        "tabbrowser-arrowscrollbox-periphery"
      );
      let endEdge = ele => ele[screenAxis] + bounds(ele)[size];
      let endScreen = endEdge(draggedTab);
      let startScreen = draggedTab[screenAxis];
      let { width: tabWidth, height: tabHeight } = bounds(
        elementToMove(draggedTab)
      );
      let tabSize = this._tabbrowserTabs.verticalMode ? tabHeight : tabWidth;
      let shiftSize = tabSize;
      dragData.tabWidth = tabWidth;
      dragData.tabHeight = tabHeight;
      dragData.translateX = translateX;
      dragData.translateY = translateY;
      let translate = screen - dragData[screenAxis];

      // Constrain the range over which the moving tabs can move between the edge of the tabstrip and periphery.
      // Add 1 to periphery so we don't overlap it.
      let startBound = this._rtlMode
        ? endEdge(periphery) + 1 - startScreen
        : this._tabbrowserTabs[screenAxis] - startScreen;
      let endBound = this._rtlMode
        ? endEdge(this._tabbrowserTabs) - endScreen
        : periphery[screenAxis] - 1 - endScreen;
      translate = Math.min(Math.max(translate, startBound), endBound);

      // Center the tab under the cursor if the tab is not under the cursor while dragging
      let draggedTabScreenAxis = draggedTab[screenAxis] + translate;
      if (
        (screen < draggedTabScreenAxis ||
          screen > draggedTabScreenAxis + tabSize) &&
        draggedTabScreenAxis + tabSize < endBound &&
        draggedTabScreenAxis > startBound
      ) {
        translate = screen - draggedTab[screenAxis] - tabSize / 2;
        // Ensure, after the above calculation, we are still within bounds
        translate = Math.min(Math.max(translate, startBound), endBound);
      }

      if (!gBrowser.pinnedTabCount && !this._dragToPinPromoCard.shouldRender) {
        let pinnedDropIndicatorMargin = parseFloat(
          window.getComputedStyle(this._pinnedDropIndicator).marginInline
        );
        this._checkWithinPinnedContainerBounds({
          firstMovingTabScreen: startScreen,
          lastMovingTabScreen: endScreen,
          pinnedTabsStartEdge: this._rtlMode
            ? endEdge(this._tabbrowserTabs.arrowScrollbox) +
              pinnedDropIndicatorMargin
            : this._tabbrowserTabs[screenAxis],
          pinnedTabsEndEdge: this._rtlMode
            ? endEdge(this._tabbrowserTabs)
            : this._tabbrowserTabs.arrowScrollbox[screenAxis] -
              pinnedDropIndicatorMargin,
          translate,
          draggedTab,
        });
      }

      for (let item of movingTabs) {
        item = elementToMove(item);
        item.style.transform = `${translateAxis}(${translate}px)`;
      }

      dragData.translatePos = translate;

      tabs = tabs.filter(t => !movingTabsSet.has(t) || t == draggedTab);

      /**
       * When the `draggedTab` is just starting to move, the `draggedTab` is in
       * its original location and the `dropElementIndex == draggedTab.elementIndex`.
       * Any tabs or tab group labels passed in as `item` will result in a 0 shift
       * because all of those items should also continue to appear in their original
       * locations.
       *
       * Once the `draggedTab` is more "backward" in the tab strip than its original
       * position, any tabs or tab group labels between the `draggedTab`'s original
       * `elementIndex` and the current `dropElementIndex` should shift "forward"
       * out of the way of the dragging tabs.
       *
       * When the `draggedTab` is more "forward" in the tab strip than its original
       * position, any tabs or tab group labels between the `draggedTab`'s original
       * `elementIndex` and the current `dropElementIndex` should shift "backward"
       * out of the way of the dragging tabs.
       *
       * @param {MozTabbrowserTab|MozTabbrowserTabGroup.label} item
       * @param {number} dropElementIndex
       * @returns {number}
       */
      let getTabShift = (item, dropElementIndex) => {
        if (item?.currentIndex == undefined) {
          item.currentIndex = item.elementIndex;
        }
        if (
          item.currentIndex < draggedTab.elementIndex &&
          item.currentIndex >= dropElementIndex
        ) {
          return this._rtlMode ? -shiftSize : shiftSize;
        }
        if (
          item.currentIndex > draggedTab.elementIndex &&
          item.currentIndex < dropElementIndex
        ) {
          return this._rtlMode ? shiftSize : -shiftSize;
        }
        return 0;
      };

      let oldDropElementIndex =
        dragData.animDropElementIndex ?? draggedTab.elementIndex;

      /**
       * Returns the higher % by which one element overlaps another
       * in the tab strip.
       *
       * When element 1 is further forward in the tab strip:
       *
       *   p1            p2      p1+s1    p2+s2
       *    |             |        |        |
       *    ---------------------------------
       *    ========================
       *               s1
       *                  ===================
       *                           s2
       *                  ==========
       *                   overlap
       *
       * When element 2 is further forward in the tab strip:
       *
       *   p2            p1      p2+s2    p1+s1
       *    |             |        |        |
       *    ---------------------------------
       *    ========================
       *               s2
       *                  ===================
       *                           s1
       *                  ==========
       *                   overlap
       *
       * @param {number} p1
       *   Position (x or y value in screen coordinates) of element 1.
       * @param {number} s1
       *   Size (width or height) of element 1.
       * @param {number} p2
       *   Position (x or y value in screen coordinates) of element 2.
       * @param {number} s2
       *   Size (width or height) of element 1.
       * @returns {number}
       *   Percent between 0.0 and 1.0 (inclusive) of element 1 or element 2
       *   that is overlapped by the other element. If the elements have
       *   different sizes, then this returns the larger overlap percentage.
       */
      function greatestOverlap(p1, s1, p2, s2) {
        let overlapSize;
        if (p1 < p2) {
          // element 1 starts first
          overlapSize = p1 + s1 - p2;
        } else {
          // element 2 starts first
          overlapSize = p2 + s2 - p1;
        }

        // No overlap if size is <= 0
        if (overlapSize <= 0) {
          return 0;
        }

        // Calculate the overlap fraction from each element's perspective.
        let overlapPercent = Math.max(overlapSize / s1, overlapSize / s2);

        return Math.min(overlapPercent, 1);
      }

      /**
       * Determine what tab/tab group label we're dragging over.
       *
       * When dragging right or downwards, the reference point for overlap is
       * the right or bottom edge of the most forward moving tab.
       *
       * When dragging left or upwards, the reference point for overlap is the
       * left or top edge of the most backward moving tab.
       *
       * @returns {Element|null}
       *   The tab or tab group label that should be used to visually shift tab
       *   strip elements out of the way of the dragged tab(s) during a drag
       *   operation. Note: this is not used to determine where the dragged
       *   tab(s) will be dropped, it is only used for visual animation at this
       *   time.
       */
      let getOverlappedElement = () => {
        let point = (screenForward ? endScreen : startScreen) + translate;
        let low = 0;
        let high = tabs.length - 1;
        while (low <= high) {
          let mid = Math.floor((low + high) / 2);
          if (tabs[mid] == draggedTab && ++mid > high) {
            break;
          }
          let element = tabs[mid];
          let elementForSize = elementToMove(element);
          screen =
            elementForSize[screenAxis] +
            getTabShift(element, oldDropElementIndex);

          if (screen > point) {
            high = mid - 1;
          } else if (screen + bounds(elementForSize)[size] < point) {
            low = mid + 1;
          } else {
            return element;
          }
        }
        return null;
      };

      let dropElement = getOverlappedElement();

      let newDropElementIndex;
      if (dropElement) {
        newDropElementIndex =
          dropElement?.currentIndex ?? dropElement.elementIndex;
      } else {
        // When the dragged element(s) moves past a tab strip item, the dragged
        // element's leading edge starts dragging over empty space, resulting in
        // no overlapping `dropElement`. In these cases, try to fall back to the
        // previous animation drop element index to avoid unstable animations
        // (tab strip items snapping back and forth to shift out of the way of
        // the dragged element(s)).
        newDropElementIndex = oldDropElementIndex;

        // We always want to have a `dropElement` so that we can determine where to
        // logically drop the dragged element(s).
        //
        // It's tempting to set `dropElement` to
        // `this.dragAndDropElements.at(oldDropElementIndex)`, and that is correct
        // for most cases, but there are edge cases:
        //
        // 1) the drop element index range needs to be one larger than the number of
        //    items that can move in the tab strip. The simplest example is when all
        //    tabs are ungrouped and unpinned: for 5 tabs, the drop element index needs
        //    to be able to go from 0 (become the first tab) to 5 (become the last tab).
        //    `this.dragAndDropElements.at(5)` would be `undefined` when dragging to the
        //    end of the tab strip. In this specific case, it works to fall back to
        //    setting the drop element to the last tab.
        //
        // 2) the `elementIndex` values of the tab strip items do not change during
        //    the drag operation. When dragging the last tab or multiple tabs at the end
        //    of the tab strip, having `dropElement` fall back to the last tab makes the
        //    drop element one of the moving tabs. This can have some unexpected behavior
        //    if not careful. Falling back to the last tab that's not moving (instead of
        //    just the last tab) helps ensure that `dropElement` is always a stable target
        //    to drop next to.
        //
        // 3) all of the elements in the tab strip are moving, in which case there can't
        //    be a drop element and it should stay `undefined`.
        //
        // 4) we just started dragging and the `oldDropElementIndex` has its default
        //    valuë of `movingTabs[0].elementIndex`. In this case, the drop element
        //    shouldn't be a moving tab, so keep it `undefined`.
        let lastPossibleDropElement = this._rtlMode
          ? tabs.find(t => t != draggedTab)
          : tabs.findLast(t => t != draggedTab);
        let maxElementIndexForDropElement =
          lastPossibleDropElement?.currentIndex ??
          lastPossibleDropElement?.elementIndex;
        if (Number.isInteger(maxElementIndexForDropElement)) {
          let index = Math.min(
            oldDropElementIndex,
            maxElementIndexForDropElement
          );
          let oldDropElementCandidate = this._tabbrowserTabs.dragAndDropElements
            .filter(t => !movingTabsSet.has(t) || t == draggedTab)
            .at(index);
          if (!movingTabsSet.has(oldDropElementCandidate)) {
            dropElement = oldDropElementCandidate;
          }
        }
      }

      let moveOverThreshold;
      let overlapPercent;
      let dropBefore;
      if (dropElement) {
        let dropElementForOverlap = elementToMove(dropElement);

        let dropElementScreen = dropElementForOverlap[screenAxis];
        let dropElementPos =
          dropElementScreen + getTabShift(dropElement, oldDropElementIndex);
        let dropElementSize = bounds(dropElementForOverlap)[size];
        let firstMovingTabPos = startScreen + translate;
        overlapPercent = greatestOverlap(
          firstMovingTabPos,
          shiftSize,
          dropElementPos,
          dropElementSize
        );

        moveOverThreshold = gBrowser._tabGroupsEnabled
          ? Services.prefs.getIntPref(
              "browser.tabs.dragDrop.moveOverThresholdPercent"
            ) / 100
          : 0.5;
        moveOverThreshold = Math.min(1, Math.max(0, moveOverThreshold));
        let shouldMoveOver = overlapPercent > moveOverThreshold;
        if (logicalForward && shouldMoveOver) {
          newDropElementIndex++;
        } else if (!logicalForward && !shouldMoveOver) {
          newDropElementIndex++;
          if (newDropElementIndex > oldDropElementIndex) {
            // FIXME: Not quite sure what's going on here, but this check
            // prevents jittery back-and-forth movement of background tabs
            // in certain cases.
            newDropElementIndex = oldDropElementIndex;
          }
        }

        // Recalculate the overlap with the updated drop index for when the
        // drop element moves over.
        dropElementPos =
          dropElementScreen + getTabShift(dropElement, newDropElementIndex);
        overlapPercent = greatestOverlap(
          firstMovingTabPos,
          shiftSize,
          dropElementPos,
          dropElementSize
        );
        dropBefore = firstMovingTabPos < dropElementPos;
        if (this._rtlMode) {
          dropBefore = !dropBefore;
        }

        // If dragging a group over another group, don't make it look like it is
        // possible to drop the dragged group inside the other group.
        if (
          isTabGroupLabel(draggedTab) &&
          dropElement?.group &&
          (!dropElement.group.collapsed ||
            (dropElement.group.collapsed && dropElement.group.hasActiveTab))
        ) {
          let overlappedGroup = dropElement.group;

          if (isTabGroupLabel(dropElement)) {
            dropBefore = true;
            newDropElementIndex =
              dropElement?.currentIndex ?? dropElement.elementIndex;
          } else {
            dropBefore = false;
            let lastVisibleTabInGroup = overlappedGroup.tabs.findLast(
              tab => tab.visible
            );
            newDropElementIndex =
              (lastVisibleTabInGroup?.currentIndex ??
                lastVisibleTabInGroup.elementIndex) + 1;
          }

          dropElement = overlappedGroup;
        }

        // Constrain drop direction at the boundary between pinned and
        // unpinned tabs so that they don't mix together.
        let isOutOfBounds = isPinned
          ? dropElement.elementIndex >= numPinned
          : dropElement.elementIndex < numPinned;
        if (isOutOfBounds) {
          // Drop after last pinned tab
          dropElement = this._tabbrowserTabs.dragAndDropElements[numPinned - 1];
          dropBefore = false;
        }
      }

      if (
        gBrowser._tabGroupsEnabled &&
        isTab(draggedTab) &&
        !isPinned &&
        (!numPinned || newDropElementIndex >= numPinned)
      ) {
        let dragOverGroupingThreshold = 1 - moveOverThreshold;
        let groupingDelay = Services.prefs.getIntPref(
          "browser.tabs.dragDrop.createGroup.delayMS"
        );

        // When dragging tab(s) over an ungrouped tab, signal to the user
        // that dropping the tab(s) will create a new tab group.
        let shouldCreateGroupOnDrop =
          !movingTabsSet.has(dropElement) &&
          isTab(dropElement) &&
          !dropElement?.group &&
          overlapPercent > dragOverGroupingThreshold;

        // When dragging tab(s) over a collapsed tab group label, signal to the
        // user that dropping the tab(s) will add them to the group.
        let shouldDropIntoCollapsedTabGroup =
          isTabGroupLabel(dropElement) &&
          dropElement.group.collapsed &&
          overlapPercent > dragOverGroupingThreshold;

        if (shouldCreateGroupOnDrop) {
          this._dragOverGroupingTimer = setTimeout(() => {
            this._triggerDragOverGrouping(dropElement);
            dragData.shouldCreateGroupOnDrop = true;
            this._setDragOverGroupColor(dragData.tabGroupCreationColor);
          }, groupingDelay);
        } else if (shouldDropIntoCollapsedTabGroup) {
          this._dragOverGroupingTimer = setTimeout(() => {
            this._triggerDragOverGrouping(dropElement);
            dragData.shouldDropIntoCollapsedTabGroup = true;
            this._setDragOverGroupColor(dropElement.group.color);
          }, groupingDelay);
        } else {
          this._tabbrowserTabs.removeAttribute("movingtab-group");
          this._resetGroupTarget(
            document.querySelector("[dragover-groupTarget]")
          );

          delete dragData.shouldCreateGroupOnDrop;
          delete dragData.shouldDropIntoCollapsedTabGroup;

          // Default to dropping into `dropElement`'s tab group, if it exists.
          let dropElementGroup = dropElement?.group;
          let colorCode = dropElementGroup?.color;

          let lastUnmovingTabInGroup = dropElementGroup?.tabs.findLast(
            t => !movingTabsSet.has(t)
          );
          if (
            isTab(dropElement) &&
            dropElementGroup &&
            dropElement == lastUnmovingTabInGroup &&
            !dropBefore &&
            overlapPercent < dragOverGroupingThreshold
          ) {
            // Dragging tab over the last tab of a tab group, but not enough
            // for it to drop into the tab group. Drop it after the tab group instead.
            dropElement = dropElementGroup;
            colorCode = undefined;
          } else if (isTabGroupLabel(dropElement)) {
            if (dropBefore) {
              // Dropping right before the tab group.
              dropElement = dropElementGroup;
              colorCode = undefined;
            } else if (dropElementGroup.collapsed) {
              // Dropping right after the collapsed tab group.
              dropElement = dropElementGroup;
              colorCode = undefined;
            } else {
              // Dropping right before the first tab in the tab group.
              dropElement = dropElementGroup.tabs[0];
              dropBefore = true;
            }
          }
          this._setDragOverGroupColor(colorCode);
          this._tabbrowserTabs.toggleAttribute(
            "movingtab-addToGroup",
            colorCode
          );
          this._tabbrowserTabs.toggleAttribute("movingtab-ungroup", !colorCode);
        }
      }

      if (
        newDropElementIndex == oldDropElementIndex &&
        dropBefore == dragData.dropBefore &&
        dropElement == dragData.dropElement
      ) {
        return;
      }

      dragData.dropElement = dropElement;
      dragData.dropBefore = dropBefore;
      dragData.animDropElementIndex = newDropElementIndex;

      // Shift background tabs to leave a gap where the dragged tab
      // would currently be dropped.
      for (let item of tabs) {
        if (item == draggedTab) {
          continue;
        }
        let shift = getTabShift(item, newDropElementIndex);
        let transform = shift ? `${translateAxis}(${shift}px)` : "";
        item = elementToMove(item);
        item.style.transform = transform;
      }
    }

    _animateExpandedPinnedTabMove(event) {
      let draggedTab = event.dataTransfer.mozGetDataAt(TAB_DROP_TYPE, 0);
      let dragData = draggedTab._dragData;
      let movingTabs = dragData.movingTabs;

      dragData.animLastScreenX ??= dragData.screenX;
      dragData.animLastScreenY ??= dragData.screenY;

      let screenX = event.screenX;
      let screenY = event.screenY;

      if (
        screenY == dragData.animLastScreenY &&
        screenX == dragData.animLastScreenX
      ) {
        return;
      }

      let tabs = this._tabbrowserTabs.visibleTabs.slice(
        0,
        gBrowser.pinnedTabCount
      );

      dragData.animLastScreenY = screenY;
      dragData.animLastScreenX = screenX;

      let { width: tabWidth, height: tabHeight } =
        draggedTab.getBoundingClientRect();
      let shiftSizeX = tabWidth;
      let shiftSizeY = tabHeight;
      dragData.tabWidth = tabWidth;
      dragData.tabHeight = tabHeight;

      // Move the dragged tab based on the mouse position.
      let periphery = document.getElementById(
        "tabbrowser-arrowscrollbox-periphery"
      );
      let endScreenX = draggedTab.screenX + tabWidth;
      let endScreenY = draggedTab.screenY + tabHeight;
      let startScreenX = draggedTab.screenX;
      let startScreenY = draggedTab.screenY;
      let translateX = screenX - dragData.screenX;
      let translateY = screenY - dragData.screenY;
      let startBoundX = this._tabbrowserTabs.screenX - startScreenX;
      let startBoundY = this._tabbrowserTabs.screenY - startScreenY;
      let endBoundX =
        this._tabbrowserTabs.screenX +
        window.windowUtils.getBoundsWithoutFlushing(this._tabbrowserTabs)
          .width -
        endScreenX;
      let endBoundY = periphery.screenY - endScreenY;
      translateX = Math.min(Math.max(translateX, startBoundX), endBoundX);
      translateY = Math.min(Math.max(translateY, startBoundY), endBoundY);

      // Center the tab under the cursor if the tab is not under the cursor while dragging
      if (
        screen < draggedTab.screenY + translateY ||
        screen > draggedTab.screenY + tabHeight + translateY
      ) {
        translateY = screen - draggedTab.screenY - tabHeight / 2;
      }

      for (let tab of movingTabs) {
        tab.style.transform = `translate(${translateX}px, ${translateY}px)`;
      }

      dragData.translateX = translateX;
      dragData.translateY = translateY;

      // Determine what tab we're dragging over.
      // * Single tab dragging: Point of reference is the center of the dragged tab. If that
      //   point touches a background tab, the dragged tab would take that
      //   tab's position when dropped.
      // * Multiple tabs dragging: Tabs are stacked, so we can still use the above
      //   point of reference, the center of the dragged tab.
      // * We're doing a binary search in order to reduce the amount of
      //   tabs we need to check.

      tabs = tabs.filter(t => !movingTabs.includes(t) || t == draggedTab);
      let tabCenterX = startScreenX + translateX + tabWidth / 2;
      let tabCenterY = startScreenY + translateY + tabHeight / 2;

      let shiftNumber = this._maxTabsPerRow - 1;

      let getTabShift = (tab, dropIndex) => {
        if (tab?.currentIndex == undefined) {
          tab.currentIndex = tab.elementIndex;
        }
        if (
          tab.currentIndex < draggedTab.elementIndex &&
          tab.currentIndex >= dropIndex
        ) {
          // If tab is at the end of a row, shift back and down
          let tabRow = Math.ceil((tab.currentIndex + 1) / this._maxTabsPerRow);
          let shiftedTabRow = Math.ceil(
            (tab.currentIndex + 2) / this._maxTabsPerRow
          );
          if (tab.currentIndex && tabRow != shiftedTabRow) {
            return [
              RTL_UI ? tabWidth * shiftNumber : -tabWidth * shiftNumber,
              shiftSizeY,
            ];
          }
          return [RTL_UI ? -shiftSizeX : shiftSizeX, 0];
        }
        if (
          tab.currentIndex > draggedTab.elementIndex &&
          tab.currentIndex < dropIndex
        ) {
          // If tab is not index 0 and at the start of a row, shift across and up
          let tabRow = Math.floor(tab.currentIndex / this._maxTabsPerRow);
          let shiftedTabRow = Math.floor(
            (tab.currentIndex - 1) / this._maxTabsPerRow
          );
          if (tab.currentIndex && tabRow != shiftedTabRow) {
            return [
              RTL_UI ? -tabWidth * shiftNumber : tabWidth * shiftNumber,
              -shiftSizeY,
            ];
          }
          return [RTL_UI ? shiftSizeX : -shiftSizeX, 0];
        }
        return [0, 0];
      };

      let low = 0;
      let high = tabs.length - 1;
      let newIndex = -1;
      let oldIndex = dragData.animDropElementIndex ?? draggedTab.elementIndex;

      while (low <= high) {
        let mid = Math.floor((low + high) / 2);
        if (tabs[mid] == draggedTab && ++mid > high) {
          break;
        }
        let [shiftX, shiftY] = getTabShift(tabs[mid], oldIndex);
        screenX = tabs[mid].screenX + shiftX;
        screenY = tabs[mid].screenY + shiftY;

        if (screenY + tabHeight < tabCenterY) {
          low = mid + 1;
        } else if (screenY > tabCenterY) {
          high = mid - 1;
        } else if (
          RTL_UI ? screenX + tabWidth < tabCenterX : screenX > tabCenterX
        ) {
          high = mid - 1;
        } else if (
          RTL_UI ? screenX > tabCenterX : screenX + tabWidth < tabCenterX
        ) {
          low = mid + 1;
        } else {
          newIndex = tabs[mid].currentIndex;
          break;
        }
      }

      if (newIndex >= oldIndex && newIndex < tabs.length) {
        newIndex++;
      }

      if (newIndex < 0) {
        newIndex = oldIndex;
      }

      if (newIndex == dragData.animDropElementIndex) {
        return;
      }

      dragData.animDropElementIndex = newIndex;
      dragData.dropElement = tabs[Math.min(newIndex, tabs.length - 1)];
      dragData.dropBefore = newIndex < tabs.length;

      // Shift background tabs to leave a gap where the dragged tab
      // would currently be dropped.
      for (let tab of tabs) {
        if (tab != draggedTab) {
          let [shiftX, shiftY] = getTabShift(tab, newIndex);
          tab.style.transform =
            shiftX || shiftY ? `translate(${shiftX}px, ${shiftY}px)` : "";
        }
      }
    }

    // If the tab is dropped in another window, we need to pass in the original window document
    _resetTabsAfterDrop(draggedTabDocument = document) {
      if (this._tabbrowserTabs.expandOnHover) {
        // Re-enable MousePosTracker after dropping
        MousePosTracker.addListener(document.defaultView.SidebarController);
      }

      let pinnedDropIndicator = draggedTabDocument.getElementById(
        "pinned-drop-indicator"
      );
      pinnedDropIndicator.removeAttribute("visible");
      pinnedDropIndicator.removeAttribute("interactive");
      draggedTabDocument.ownerGlobal.gBrowser.tabContainer.style.maxWidth = "";
      let allTabs = draggedTabDocument.getElementsByClassName("tabbrowser-tab");
      for (let tab of allTabs) {
        tab.style.width = "";
        tab.style.left = "";
        tab.style.top = "";
        tab.style.maxWidth = "";
        tab.style.pointerEvents = "";
        tab.removeAttribute("dragtarget");
        tab.removeAttribute("small-stack");
        tab.removeAttribute("big-stack");
      }
      for (let label of draggedTabDocument.getElementsByClassName(
        "tab-group-label-container"
      )) {
        label.style.width = "";
        label.style.maxWidth = "";
        label.style.height = "";
        label.style.left = "";
        label.style.top = "";
        label.style.pointerEvents = "";
        label.removeAttribute("dragtarget");
      }
      for (let label of draggedTabDocument.getElementsByClassName(
        "tab-group-label"
      )) {
        delete label.currentIndex;
      }
      let periphery = draggedTabDocument.getElementById(
        "tabbrowser-arrowscrollbox-periphery"
      );
      periphery.style.marginBlockStart = "";
      periphery.style.marginInlineStart = "";
      periphery.style.left = "";
      periphery.style.top = "";
      let pinnedTabsContainer = draggedTabDocument.getElementById(
        "pinned-tabs-container"
      );
      let pinnedPeriphery = draggedTabDocument.getElementById(
        "pinned-tabs-container-periphery"
      );
      pinnedPeriphery && pinnedTabsContainer.removeChild(pinnedPeriphery);
      pinnedTabsContainer.removeAttribute("dragActive");
      pinnedTabsContainer.style.minHeight = "";
      draggedTabDocument.defaultView.SidebarController.updatePinnedTabsHeightOnResize();
      pinnedTabsContainer.scrollbox.style.height = "";
      pinnedTabsContainer.scrollbox.style.width = "";
      let arrowScrollbox = draggedTabDocument.getElementById(
        "tabbrowser-arrowscrollbox"
      );
      arrowScrollbox.scrollbox.style.height = "";
      arrowScrollbox.scrollbox.style.width = "";
      for (let groupLabel of draggedTabDocument.getElementsByClassName(
        "tab-group-label-container"
      )) {
        groupLabel.style.left = "";
        groupLabel.style.top = "";
      }
    }
  };
}
