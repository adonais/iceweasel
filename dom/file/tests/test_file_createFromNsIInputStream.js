add_task(async function () {
  do_get_profile();

  let existingFile = Services.dirsvc
    .QueryInterface(Ci.nsIProperties)
    .get("ProfD", Ci.nsIFile);
  existingFile.append("exists.txt");
  existingFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

  let outStream = Cc[
    "@mozilla.org/network/file-output-stream;1"
  ].createInstance(Ci.nsIFileOutputStream);
  outStream.init(
    existingFile,
    0x02 | 0x08 | 0x20, // write, create, truncate
    0o666,
    0
  );

  let fileData = "Hello World!";
  outStream.write(fileData, fileData.length);
  outStream.close();

  let inputStream = Cc[
    "@mozilla.org/network/file-input-stream;1"
  ].createInstance(Ci.nsIFileInputStream);
  inputStream.init(existingFile, -1, 0, 0);

  let file = File.createFromNsIInputStream(inputStream, fileData.length, {
    name: "exists.txt",
    type: "text/plain",
    lastModified: existingFile.lastModifiedTime,
  });

  Assert.equal(file.name, "exists.txt", "File name should match");
  Assert.equal(file.type, "text/plain", "File type should match");
  Assert.equal(file.size, existingFile.fileSize, "File size should match");
  Assert.equal(
    file.lastModified,
    existingFile.lastModifiedTime,
    "File last modified time should match"
  );
  Assert.equal(await file.text(), fileData, "File content should match");

  // Clean up
  inputStream = null;
  file = null;
  Cu.forceGC();
  Cu.forceCC();
  existingFile.remove(false);
  ok(!existingFile.exists(), "File should be removed");
});
