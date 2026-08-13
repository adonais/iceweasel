# balanced-observers

Checks that for every occurrence of `addObserver` there is an
occurrence of `removeObserver` with the same topic.

## Examples of incorrect code for this rule

```js
Services.obs.addObserver(observer, 'observable');
```

## Examples of correct code for this rule

```js
Services.obs.addObserver(observer, 'observable');
Services.obs.removeObserver(observer, 'observable');
```
