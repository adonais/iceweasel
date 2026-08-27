/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

enum FileSystemHandleKind {
  "file",
  "directory",
};

[Exposed=(Window,Worker), SecureContext, Serializable, Pref="dom.fs.enabled"]
interface FileSystemHandle {
  readonly attribute FileSystemHandleKind kind;
  readonly attribute USVString name;

  /* https://whatpr.org/fs/10.html#api-filesystemhandle */
  [NewObject, UseCounter=PerOverload]
  Promise<undefined> move(USVString name);
  [NewObject, UseCounter=PerOverload]
  Promise<undefined> move(FileSystemDirectoryHandle parent);
  [NewObject, UseCounter=PerOverload]
  Promise<undefined> move(FileSystemDirectoryHandle parent, USVString name);

  [NewObject]
  Promise<boolean> isSameEntry(FileSystemHandle other);
};
