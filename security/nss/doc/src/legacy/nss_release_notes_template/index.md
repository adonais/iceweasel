(mozilla-projects-nss-nss-release-notes-template)=

# NSS release notes template

(draft-remove-line-when-document-is-finished)=

## [DRAFT (remove line when document is finished)](<#draft_(remove_line_when_document_is_finished)>)

## [Introduction](#introduction)

:::{container}
The NSS team has released Network Security Services (NSS) 3.XX, which is a minor release.

or

Network Security Services (NSS) 3.XX.y is a patch release for NSS 3.XX. The bug fixes in NSS
3.XX.y are described in the "Bugs Fixed" section below.
:::

## [Distribution Information](#distribution_information)

:::{container}
The HG tag is NSS_3_XX_RTM. NSS 3.XX requires NSPR 4.XX or newer.

NSS 3.XX source distributions are available on ftp.mozilla.org for secure HTTPS download:

- Source tarballs:
  <https://ftp.mozilla.org/pub/mozilla.org/security/nss/releases/NSS_3_XX_RTM/src/> (make a link)
:::

## [New in NSS 3.XX](#new_in_nss_3.xx)

### [New Functionality](#new_functionality)

:::{container}
either:

No new functionality is introduced in this release. This is a patch release to fix ...

or:

- ...

```{rubric} New Functions
```

- *in \_\_\_.h*

  - **function** - description

```{rubric} New Types
```

- *in \_\_\_.h*

  - **type** - description.

```{rubric} New Macros
```

- *in \_\_\_.h*

  - **macro** - description
:::

(notable-changes-in-nss-3-xx)=

## [Notable Changes in NSS 3.XX](#notable_changes_in_nss_3.xx)

:::{container}

- ...
:::

(bugs-fixed-in-nss-3-xx)=

## [Bugs fixed in NSS 3.XX](#bugs_fixed_in_nss_3.xx)

:::{container}
This Bugzilla query returns all the bugs fixed in NSS 3.XX:

<https://bugzilla.mozilla.org/buglist.cgi?resolution=FIXED&classification=Components&query_format=advanced&product=NSS&target_milestone=3.XX>
(make a link)
:::

## [Acknowledgements](#acknowledgements)

:::{container}
The NSS development team would like to thank ... for responsibly disclosing the issue by
providing advance copies of their research.
:::

## [Compatibility](#compatibility)

:::{container}
NSS 3.XX.y shared libraries are backward compatible with all older NSS 3.x shared libraries. A
program linked with older NSS 3.x shared libraries will work with NSS 3.XX.y shared libraries
without recompiling or relinking. Furthermore, applications that restrict their use of NSS APIs
to the functions listed in NSS Public Functions will remain compatible with future versions of
the NSS shared libraries.
:::

## [Feedback](#feedback)

:::{container}
Bugs discovered should be reported by filing a bug report with
[bugzilla.mozilla.org](https://bugzilla.mozilla.org/enter_bug.cgi?product=NSS) (product NSS).
:::
