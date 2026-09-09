# Helper

helper.exe contains the uninstaller, plus a routine that's run by the application updater after it applies an update, as well as a few utilities used for default browser handling and shortcut maintenance. It mainly consists of two files, {searchfox}`uninstaller.nsi <browser/installer/windows/nsis/uninstaller.nsi>`, which is the main script and contains the entry point and the uninstall logic, and {searchfox}`shared.nsh <browser/installer/windows/nsis/shared.nsh>`, which contains most of the logic for the other functions.

## Uninstaller

The uninstaller may be the most straightforward of the installer components. The only complexity comes from a need to avoid accidentally removing any user files that may have found their way into the installation directory; the general philosophy of the uninstaller is to remove everything that the installer creates, and nothing that it doesn't.

- Any registry entries the installer would have created are removed, even ones only used by very old installer versions.
- All the files that the uninstaller knows were created by the installer or are owned by the application are deleted, or flagged for deletion on reboot if any are in use. There are a few hard-coded directories that are known to be safe to delete (for example, the distribution directory, and any temporary directories created by the updater). For a list of application files that are safe to uninstall, we read a file from the application directory called `precomplete`. This file is mainly used to tell the updater what it should do to clean out the directory when applying a complete update (one that replaces all application files), but that means it contains a handy auto-generated list of all application files, so it can be reused for uninstallation.
- If the application directory is empty after that, then it is removed, but it's left alone if any files are still present.
- If the copy of Firefox that was just uninstalled is the only one that was using the maintenance service, the maintenance service uninstaller is also run.
- Any BITS jobs from this installation of Firefox are cancelled.
- The first {ref}`"uninstall" ping` found is uploaded, and all uninstall pings are deleted (for this installation).

Note that profiles and any other user-generated files (e.g., crash reports) are specifically not uninstalled.

## PostUpdate

At the end of an application update cycle, after the new files are in place, the updater invokes the helper with the `/PostUpdate` command-line switch. The PostUpdate function fills a grab bag of responsibilities which are all focused around maintaining system integration objects created by the installer. For example, a number of registry entries contain the version number, so that has to be changed on updates. If the branding name of the application changes and shortcuts have to be renamed, that's done here as well. For one counterexample, changing icons does not require any code in PostUpdate, or anywhere else; new icons are automatically picked up by the shell. The PostUpdate function also keeps the maintenance service up to date.

It's important to remember that PostUpdate is, indeed, post-update. It doesn't run until after its own code has already been updated. This makes it really the only phase of the update process where changes can go into affect immediately in the first build that contains a patch, instead of having to wait for the next update after that. This makes it a good place to put anything that needs to be done before the new version of the application can run; this includes things like registering DLL's, which the installer also handles, but that PostUpdate has to take care of for existing installations.

PostUpdate actually runs two times after each update: once in an elevated context, and once as a regular user who performed the update. Both runs do similar work - the main difference being that we update HKLM registry entries are updated by the elevated instance, while HKCU ones are updated by the non-elevated instance.

It's also important to remember that PostUpdate, being part of the installer code, only exists on Windows, so it can't be used to fix things up on other platforms the same way.

To add a new task to run during PostUpdate, you need to determine when it should run, then add it to the corresponding function in `uninstaller_helpers.nsh`.

If the task needs the permissions of the installation (regardless whether the user was elevated or not), put it in `PostUpdateInstallation`. **Put it here unless you have a compelling reason otherwise,** as the other functions might not run in some installations. Use the `SHCTX` registry 'hive' to automatically pick the correct locations in the registry, and keep the ShellVarContext untouched to avoid accidentally using the incorrect locations.

If you're certain that you need more control than that, there's a few other places you can put the code. Avoid using any of these without a strong reason: they don't run consistently, and it's easier to make mistakes (e.g. if only one user gets a fix when everyone should get a fix).

* If the task needs to run with Administrator privileges, put it in `PostUpdateElevated`. Your code will not run if Firefox wasn't installed by an administrator. (But check: does your code actually need admin? Usually HKCU works as well as HKLM.)
* If the task needs to run _without_ Administrator privileges, as a plain user, put it in `PostUpdateNonElevated`. **Your code will only run for the user who happens to run the update,** so it won't affect everyone on a multi-user machine. In enterprise scenarioes this may not run at all. (But check: are you sure there isn't a way to do your setup for all users?)
* You can also use `PostUpdateCurrentUser` to run as the user who happened to run the update if there was elevation. This is a weaker version of `PostUpdateNonElevated`, as it only runs if the installation was done as administrator; avoid using unless you know what you're doing.

## Default Browser and Shortcut Handling

Windows versions older than 10 contain a control panel called Set Program Access and Defaults, or SPAD. As the name suggests, this was the UI for setting default programs for classes of activities ("web browser" or "e-mail client" for example), as the Windows 10 default program settings page is, but it also controls program "access," which is typically defined as whether or not shortcuts for the program exist. To support this interface, an application has to register a set of commands that the interface can invoke to hide or show the shortcuts, and to have the application make itself the default. We implement these actions in helper.exe; they're triggered by invoking it with the command-line switches `/ShowShortcuts`, `/HideShortcuts`, or `/SetAsDefaultAppGlobal`.

The helper also implements the `/SetAsDefaultAppUser` switch, which is invoked by the "Make Default" button in the Firefox preferences UI.

On Windows 10 neither SetAsDefaultAppUser nor SetAsDefaultAppGlobal is effective because the default programs settings can only be modified by the Windows settings app. However they do still write the registry entries that are needed to get us an entry in the system default browser menu, should those entries not already exist (the installer always creates them, but running Firefox without having run the installer is supported). ShowShortcuts and HideShortcuts are never called on Windows 10 because the SPAD control panel no longer exists.
