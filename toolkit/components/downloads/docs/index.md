# Downloads

## Origin metadata

When a download completes, Firefox records where the file came from in
platform-specific file metadata, so that file managers and the operating system
can show the source of a file and apply the right security policy to it.

This happens in
{searchfox}`DownloadIntegration.downloadDone() <toolkit/components/downloads/DownloadIntegration.sys.mjs>`,
which calls into
{searchfox}`DownloadPlatform.cpp <toolkit/components/downloads/DownloadPlatform.cpp>`.
It also covers *Save Page As* and *Save Link As*, since both create a
`Download` object.

Nothing is written for downloads started from a private window.

| Platform | What is written | Where it shows up |
| --- | --- | --- |
| Windows | `Zone.Identifier` alternate data stream with `ZoneId=3`, `HostUrl` and `ReferrerUrl`, via {searchfox}`WinUtils::MaybeWriteFileZoneId() <widget/windows/WinUtils.cpp>` | Mark of the Web: the "unblock" checkbox in the file properties, and SmartScreen / Office protected view |
| macOS | `kMDItemWhereFroms` extended attribute (source and referrer) plus quarantine metadata, via {searchfox}`CocoaFileUtils::AddOriginMetadataToFile() <xpcom/io/CocoaFileUtils.mm>` | Finder's "Where from" field in *Get Info* |
| Linux (GTK) | GIO metadata attribute `metadata::download-uri` with the source URL, set {searchfox}`inline in DownloadPlatform.cpp <toolkit/components/downloads/DownloadPlatform.cpp>` | Readable with `gio info <file>` |

The Windows zone identifier is written directly rather than through
`IAttachmentExecute::Save()`, because the latter triggers operations that can
hang the application. Writing the stream directly is forward-compatible with
all current and future versions of Windows.

Tests live in
{searchfox}`common_test_Download.js <toolkit/components/downloads/test/unit/common_test_Download.js>`.
