# Reposition elements in the page

You can move absolutely positioned elements by dragging them around the page.

If an element has its [position](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/Position) property set to `absolute`, `relative` or `fixed` and one or more of the [top](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/top), [bottom](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/bottom) , [left](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/left) or [right](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/right) properties, {ref}`Box Model view  <page-inspector-ui-tour-computed-view>` displays a button:

```{image} box-model-reposition.png
:class: center
```

If you click that button, two handles appear next to the element:

```{image} in-content-box-model-editing.png
:alt: Example for changing the position of an element within the content
:class: center
```

You can use these handles to drag the element around the page.

If the element is absolutely positioned, dashed lines are shown representing the offset parent. For relatively positioned elements the dashed lines indicate the original position of the node. The offsets are indicated by a line and a tooltip for each side.
