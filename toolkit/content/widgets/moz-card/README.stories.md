# MozCard

`moz-card` is a reusable component that can show a set of predetermined content in a container that looks like a "card".

```html story
<moz-card style={{width: "500px"}}>
    Here is my content inside of a card.
</moz-card>
```

## Code

The source for `moz-card` can be found under [toolkit/content/widgets/moz-card/](https://searchfox.org/firefox-main/source/toolkit/content/widgets/moz-card)

## How to use `moz-card`

### Importing the element

Like other custom elements, you should usually be able to rely on `moz-card` getting lazy-loaded at the time of first use.
See [this documentation](https://firefox-source-docs.mozilla.org/browser/components/storybook/docs/README.reusable-widgets.stories.html#using-new-design-system-components) for more information on using design system custom elements.

### Setting the `heading`

Provide a heading for the moz-card component for emphasis on what the card is about.

```html
<moz-card heading="The heading">The content under the heading</moz-card>
```

```html story
<moz-card
    style={{width: '500px'}}
    heading="The heading"
>The content under the heading</moz-card>
```

You can also set an icon along with the heading by providing an image path for the `iconSrc` attribute.

```html
<moz-card heading="The heading" iconSrc="chrome://browser/skin/preferences/category-general.svg">The content under the heading</moz-card>
```

```html story
<moz-card
    style={{width: '500px'}}
    heading="The heading"
    iconSrc="chrome://browser/skin/preferences/category-general.svg"
>The content under the heading</moz-card>
```

### Setting the `type`

A type of `accordion` can be provided to moz-card component to generate an accordion-version of the component.

```html
<moz-card
    type="accordion"
    heading="This is an accordion"
>The expanded content in the accordion</moz-card>
```

```html story
<moz-card
    style={{width: '500px'}}
    type="accordion"
    heading="This is an accordion"
>The expanded content in the accordion</moz-card>
```


### Fluent usage

Generally the `heading` property of `moz-card` will be provided via [Fluent attributes](https://mozilla-l10n.github.io/localizer-documentation/tools/fluent/basic_syntax.html#attributes). To get this working you will need to format your Fluent message like this:

```
with-heading =
  .heading = Heading text goes here
```
The `data-l10n-attrs` will be set up automatically, so you can just specify `data-l10n-id` on your moz-card as you would with any other markup:

 ```html
 <moz-card data-l10n-id="with-heading"></moz-card>
 ```

### Setting the cover image

To include an image that appears above the heading/content, use the named slot "cover-image".

```html
<moz-card heading="The heading">
    <img src="/path/to/image.jpg" alt slot="cover-image">
    <div>The content under the heading</div>
</moz-card>
```

This will render an image with some default styling applied, which can be partially overridden with CSS custom properties.

- `--card-cover-image-height`: `160px` by default
- `--card-cover-image-object-fit`: `cover` by default
- `--card-cover-image-object-position`: `center` by default

More complex HTML can be used for the "cover-image" slot, but it needs to be styled separately.

```html
<style>
    .custom-cover-image {
      width: 100%;
      height: 215px;
      border-radius: var(--border-radius-small);
    }
</style>
<moz-card heading="The heading">
    <picture slot="cover-image">
        <img src="/path/to/image.jpg" alt class="custom-cover-image">
    </picture>
    <div>The content under the heading</div>
</moz-card>
```
