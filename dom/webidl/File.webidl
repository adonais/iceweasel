/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://w3c.github.io/FileAPI/#file
 * https://wicg.github.io/entries-api
 */

interface nsIFile;
interface nsIInputStream;

[Exposed=(Window,Worker)]
interface File : Blob {
  [Throws]
  constructor(sequence<BlobPart> fileBits,
              USVString fileName, optional FilePropertyBag options = {});

  readonly attribute DOMString name;

  [GetterThrows]
  readonly attribute long long lastModified;
};

dictionary FilePropertyBag : BlobPropertyBag {
  long long lastModified;
};

dictionary ChromeFilePropertyBag : FilePropertyBag {
  DOMString name = "";
  boolean existenceCheck = true;
};

// https://wicg.github.io/entries-api
partial interface File {
  [BinaryName="relativePath", Pref="dom.webkitBlink.dirPicker.enabled"]
  readonly attribute USVString webkitRelativePath;
};

// Mozilla extensions
partial interface File {
  [GetterThrows, ChromeOnly, NeedsCallerType]
  readonly attribute DOMString mozFullPath;

  [ChromeOnly]
  undefined setMozRelativePath(DOMString name);
};

// Mozilla extensions
// These 2 methods can be used only in these conditions:
// - the main-thread
// - parent process OR file process OR, only for testing, with pref
//   `dom.file.createInChild' set to true.
[Exposed=(Window)]
partial interface File {
  [ChromeOnly, NewObject, NeedsCallerType]
  static Promise<File> createFromNsIFile(nsIFile file,
                                         optional ChromeFilePropertyBag options = {});

  [ChromeOnly, NewObject, NeedsCallerType]
  static Promise<File> createFromFileName(USVString fileName,
                                          optional ChromeFilePropertyBag options = {});

  /**
   * Create a File object from a nsIInputStream.
   *
   * @param inputStream a nsIInputStream that contains the file data.
   * @param size The size of the file in bytes. -1 if unknown size.
   * @param options An optional ChromeFilePropertyBag object that can be used
   *                to specify additional properties for the File object.
   * @return A File object.
   */
  [ChromeOnly, NewObject, NeedsCallerType, Throws]
  static File createFromNsIInputStream(nsIInputStream inputStream,
                                       unsigned long long size,
                                       optional ChromeFilePropertyBag options = {});
};
