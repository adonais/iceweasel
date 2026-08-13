/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "txList.h"

//----------------------------/
//- Implementation of txList -/
//----------------------------/

/**
 * Default constructor for a txList;
 **/

txList::txList() {
  firstItem = nullptr;
  lastItem = nullptr;
  itemCount = 0;
}  //-- txList;

/**
 * txList destructor, cleans up ListItems, but will not delete the Object
 * references
 */
txList::~txList() { clear(); }  //-- ~txList

void txList::add(void* objPtr) { insertBefore(objPtr, nullptr); }  //-- add

/**
 * Returns the number of items in this txList
 **/
int32_t List::getLength() { return itemCount; }  //-- getLength

/**
 * Inserts the given Object pointer as the item just after refItem.
 * If refItem is a null pointer the Object will be inserted at the
 * beginning of the txList (ie, insert after nothing).
 * This method assumes refItem is a member of this list, and since this
 * is a private method, I feel that's a valid assumption
 **/
void txList::insertAfter(void* objPtr, ListItem* refItem) {
  insertBefore(objPtr, refItem ? refItem->nextItem : firstItem);
}  //-- insertAfter

/**
 * Inserts the given Object pointer as the item just before refItem.
 * If refItem is a null pointer the Object will be inserted at the
 * end of the txList (ie, insert before nothing).
 * This method assumes refItem is a member of this list, and since this
 * is a private method, I feel that's a valid assumption
 **/
void txList::insertBefore(void* objPtr, ListItem* refItem) {
  ListItem* item = new ListItem;
  item->objPtr = objPtr;
  item->nextItem = nullptr;
  item->prevItem = nullptr;

  //-- if refItem == null insert at end
  if (!refItem) {
    //-- add to back of list
    if (lastItem) {
      lastItem->nextItem = item;
      item->prevItem = lastItem;
    }
    lastItem = item;
    if (!firstItem) firstItem = item;
  } else {
    //-- insert before given item
    item->nextItem = refItem;
    item->prevItem = refItem->prevItem;
    refItem->prevItem = item;

    if (item->prevItem)
      item->prevItem->nextItem = item;
    else
      firstItem = item;
  }

  // increase the item count
  ++itemCount;
}  //-- insertBefore

txList::ListItem* txList::remove(ListItem* item) {
  if (!item) return item;

  //-- adjust the previous item's next pointer
  if (item->prevItem) {
    item->prevItem->nextItem = item->nextItem;
  }
  //-- adjust the next item's previous pointer
  if (item->nextItem) {
    item->nextItem->prevItem = item->prevItem;
  }

  //-- adjust first and last items
  if (item == firstItem) firstItem = item->nextItem;
  if (item == lastItem) lastItem = item->prevItem;

  //-- decrease Item count
  --itemCount;
  return item;
}  //-- remove

void txList::clear() {
  ListItem* item = firstItem;
  while (item) {
    ListItem* tItem = item;
    item = item->nextItem;
    delete tItem;
  }
  firstItem = nullptr;
  lastItem = nullptr;
  itemCount = 0;
}

//------------------------------------/
//- Implementation of txListIterator -/
//------------------------------------/

/**
 * Creates a new txListIterator for the given txList
 * @param list, the txList to create an Iterator for
 **/
txListIterator::txListIterator(txList* list) {
  this->list = list;
  currentItem = nullptr;
  atEndOfList = false;
}  //-- txListIterator

/**
 * Adds the Object pointer to the txList pointed to by this txListIterator.
 * The Object pointer is inserted as the next item in the txList
 * based on the current position within the txList
 * @param objPtr the Object pointer to add to the list
 **/
void txListIterator::addAfter(void* objPtr) {
  if (currentItem || !atEndOfList) {
    list->insertAfter(objPtr, currentItem);
  } else {
    list->insertBefore(objPtr, nullptr);
  }
}  //-- addAfter

/**
 * Adds the Object pointer to the txList pointed to by this txListIterator.
 * The Object pointer is inserted as the previous item in the txList
 * based on the current position within the txList
 * @param objPtr the Object pointer to add to the list
 **/
void txListIterator::addBefore(void* objPtr) {
  if (currentItem || atEndOfList) {
    list->insertBefore(objPtr, currentItem);
  } else {
    list->insertAfter(objPtr, nullptr);
  }
}  //-- addBefore

/**
 * Returns true if a successful call to the next() method can be made
 * @return true if a successful call to the next() method can be made,
 * otherwise false
 **/
bool txListIterator::hasNext() {
  bool hasNext = false;
  if (currentItem)
    hasNext = (currentItem->nextItem != nullptr);
  else if (!atEndOfList)
    hasNext = (list->firstItem != nullptr);

  return hasNext;
}  //-- hasNext

/**
 * Returns the next Object pointer in the list
 **/
void* txListIterator::next() {
  void* obj = nullptr;
  if (currentItem)
    currentItem = currentItem->nextItem;
  else if (!atEndOfList)
    currentItem = list->firstItem;

  if (currentItem)
    obj = currentItem->objPtr;
  else
    atEndOfList = true;

  return obj;
}  //-- next

/**
 * Returns the previous Object in the list
 **/
void* txListIterator::previous() {
  void* obj = nullptr;

  if (currentItem)
    currentItem = currentItem->prevItem;
  else if (atEndOfList)
    currentItem = list->lastItem;

  if (currentItem) obj = currentItem->objPtr;

  atEndOfList = false;

  return obj;
}  //-- previous

/**
 * Returns the current Object
 **/
void* txListIterator::current() {
  if (currentItem) return currentItem->objPtr;

  return nullptr;
}  //-- current

/**
 * Removes the Object last returned by the next() or previous() methods;
 * @return the removed Object pointer
 **/
void* txListIterator::remove() {
  void* obj = nullptr;
  if (currentItem) {
    obj = currentItem->objPtr;
    txList::ListItem* item = currentItem;
    previous();  //-- make previous item the current item
    list->remove(item);
    delete item;
  }
  return obj;
}  //-- remove

/**
 * Resets the current location within the txList to the beginning of the txList
 **/
void txListIterator::reset() {
  atEndOfList = false;
  currentItem = nullptr;
}  //-- reset

/**
 * Move the iterator to right after the last element
 **/
void txListIterator::resetToEnd() {
  atEndOfList = true;
  currentItem = nullptr;
}  //-- moveToEnd
