(mozilla-projects-nss-tools-nss-tools-certutil-tasks)=

# NSS Tools certutil-tasks

:::{container}

```{rubric} NSS Security Tools: certutil Tasks
:name: NSS_Security_Tools_certutil_Tasks
```

Newsgroup:

[mozilla.dev.tech.crypto](news://news.mozilla.org/mozilla.dev.tech.crypto)

```{rubric} Task List
:name: Task_List
```

01. Better error reporting. Most certutil errors provide no detail. Mistakes with command-line
    options just print a usage message.
02. Improve certificate listings. Allow for sorting by name and trust. Sorting by trust will
    return CA certs first.
03. Allow listing and lookup of keys by index and nickname.
04. Improve coherence of key and certificate nicknames.
05. Remove keys "stranded" without a certificate (except for the imminent (????) encryption key
    for password files).
06. Support importing keys from a file.
07. Improve hardware token support.
08. (bugfix) Some certificate extensions cause certutil to crash.
09. (bugfix) Certificate entries require a serial number; one should be generated automatically if
    not provided.
10. (bugfix) Null password is given to new `key3.db`; should prompt user for an initial
    password.
11. (bugfix) Listing provate keys does not work: requires password authentication.
12. (bugfix) Listing certificate extensions has typos and does not provide much information.
:::
