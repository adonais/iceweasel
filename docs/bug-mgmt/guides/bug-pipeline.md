# Bug pipeline

For Firefox quality, Mozilla has different processes to report defects. In parallel, over the years, Mozilla developed many tools around bug management.

```{mermaid}
graph TD
    classDef tool fill:#f96;

    Community --> B(bugzilla.mozilla.org)
    QA --> B
    Foxfooding --> B
    Fuzzing --> B
    SA[Static/Dynamic analysis] --> B
    P[Performance monitoring] --> B
    Y[Test automation] --> B
    Z[Crash detection] --> B
    B --> C{Bug update}
    C --> D[Metadata improvements]
    C --> E[Component triage]
    C --> F[Test case verification]
    F --> BM{{Bugmon}}:::tool
    F --> MR{{Mozregression}}:::tool

    D --> AN{{Autonag}}:::tool
    E --> BB{{bugbug}}:::tool
    D --> BB
```

## More details

- {ref}`fuzzing`
- [Autonag](https://wiki.mozilla.org/Release_Management/autonag#Introduction) - [Source](https://github.com/mozilla/relman-auto-nag/)
- [Bugbug](https://github.com/mozilla/bugbug) - [Blog post about triage](https://hacks.mozilla.org/2019/04/teaching-machines-to-triage-firefox-bugs/) / [Blog post about CI](https://hacks.mozilla.org/2020/07/testing-firefox-more-efficiently-with-machine-learning/)
- [Bugmon](https://hacks.mozilla.org/2021/01/analyzing-bugzilla-testcases-with-bugmon/) - [Source](https://github.com/MozillaSecurity/bugmon)
- [Mozregression](https://mozilla.github.io/mozregression/) - [Source](https://github.com/mozilla/mozregression)
