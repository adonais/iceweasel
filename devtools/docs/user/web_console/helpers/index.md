# Web Console Helpers

The JavaScript command line provided by the Web Console offers a few built-in helper functions that make certain tasks easier.

\$(selector, element)

: Looks up a CSS selector string `selector` , returning the first node descended from `element` that matches. If unspecified, `element` defaults to `document`. Equivalent to [document.querySelector()](https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector) or calls the \$ function in the page, if it exists.

  See the [QuerySelector code snippet](https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector).

(web-console-helpers-1)=

\$\$(selector, element)

: Looks up a CSS selector string `selector`, returning an array of DOM nodes descended from `element` that match. If unspecified, `element` defaults to `document`. This is similar to [document.querySelectorAll()](https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll), but returns an array instead of a [NodeList](https://developer.mozilla.org/en-US/docs/Web/API/NodeList).

(web-console-helpers-2)=

\$\$\$(selector, element)

: Looks up a CSS selector string `selector`, returning an array of DOM nodes descended from `element` that match, including elements in the shadow DOM. If unspecified, `element` defaults to `document`.

(web-console-helpers-0)=

\$0

: The currently-inspected element in the page.

(web-console-helpers-3)=

\$\_

: Stores the result of the last expression executed in the console's command line. For example, if you type "2+2 \<enter>", then "\$\_ \<enter>", the console will print 4.

\$x(xpath, element, resultType)

: Evaluates the [XPath](https://developer.mozilla.org/en-US/docs/Web/XPath) `xpath` expression in the context of `element` and returns an array of matching nodes. If unspecified, `element` defaults to `document`. The resultType parameter specifies the type of result to return; it can be an [XPathResult constant](https://developer.mozilla.org/en-US/docs/Web/API/XPathResult#constants), or a corresponding string: `"number"`, `"string"`, `"bool"`, `"node"`, or `"nodes"`; if not provided, `ANY_TYPE` is used.

:block

: Followed by an unquoted string, blocks requests where the URL contains that string. In the {doc}`Network Monitor <../../network_monitor/index>`, the string now appears and is selected in the {ref}`Request Blocking sidebar  <network-monitor-blocking-specific-urls>`. Unblock with `:unblock`.

clear()

: Clears the console output area.

clearHistory()

: Just like a normal command line, the console command line {ref}`remembers the commands you've typed  <command-line-interpreter-execution-history>`. Use this function to clear the console's command history.

(web-console-helpers-copy)=

copy()

: Copies the argument to the clipboard. If the argument is a string, it's copied as-is. If the argument is a DOM node, its [outerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/outerHTML) is copied. Otherwise, [JSON.stringify](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) will be called on the argument, and the result will be copied to the clipboard.

**help()** (deprecated)

(web-console-helpers-help)=

:help

: Displays help text. Actually, in a delightful example of recursion, it brings you to this page.

inspect()

: Given an object, generates:doc:`rich output <../rich_output/index>` for that object. Once you select the object in the output area, you can use the arrow keys to navigate the object.

keys()

: Given an object, returns a list of the keys (or property names) on that object. This is a shortcut for [Object.keys](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys).

pprint() (deprecated)

: Formats the specified value in a readable way; this is useful for dumping the contents of objects and arrays.

:screenshot

: Creates a screenshot of the current page with the supplied filename. If you don't supply a filename, the image file will be named with the following format:

  `Screen Shot yyy-mm-dd at hh.mm.ss.png`

  The command has the following optional parameters:

```{eval-rst}
.. list-table::
  :widths: 20 20 60
  :header-rows: 1

  * - Command
    - Type
    - Description

  * - ``--clipboard``
    - boolean
    - When present, this parameter will cause the screenshot to be copied to the clipboard.

  * - ``--dpr``
    - number
    - The device pixel ratio to use when taking the screenshot.

  * - ``--file``
    - boolean
    - When present, the screenshot will be saved to a file, even if other options (e.g. ``--clipboard``) are included.

  * - ``--filename``
    - string
    - The name to use in saving the file. The file should have a ".png" extension.

  * - ``--fullpage``
    - boolean
    - If included, the full webpage will be saved. With this parameter, even the parts of the webpage which are outside the current bounds of the window will be included in the screenshot. When used, ``-fullpage`` will be appended to the file name.

  * - ``--selector``
    - string
    - The CSS query selector for a single element on the page. When supplied, only this element will be included in the screenshot.

```

:unblock

: Followed by an unquoted string, removes blocking for URLs containing that string. In the {doc}`Network Monitor <../../network_monitor/index>`, the string is removed from the {ref}`Request Blocking sidebar  <network-monitor-blocking-specific-urls>`. No error is given if the string was not previously blocked.

values()

: Given an object, returns a list of the values on that object; serves as a companion to `keys()`.

Please refer to the [Console API](https://developer.mozilla.org/en-US/docs/Web/API/console) for more information about logging from content.

## Variables

(web-console-helpers-tempn)=

temp\*N\*

: The {ref}`Use in Console  <page-inspector-how-to-examine-and-edit-html-use-in-console>` option in the Inspector generates a variable for a node named `temp0`, `temp1`, `temp2`, etc. referencing the node.

## Examples

### Looking at the contents of a DOMnode

Let's say you have a DOMnode with the class"title". In fact, this page you're reading right now has one, so you can open up the Web Console and try this right now.

Let's take a look at the contents of that node by using the `$()` and `inspect()` functions:

```javascript
inspect($(".title"))
```

This automatically generates rich output for the object, showing you the contents of the first DOMnode that matches the CSS selector `".title"`, which is of course the first element with class `"title"`. You can use the up- and down-arrow keys to navigate through the output, the right-arrow key to expand an item, and the left-arrow key to collapse it.

## See also

- [console](https://developer.mozilla.org/en-US/docs/Web/API/console)
