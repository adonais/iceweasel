import { render } from "@testing-library/react";
import { ModalOverlayWrapper } from "content-src/components/ModalOverlay/ModalOverlay";

describe("ModalOverlayWrapper", () => {
  beforeEach(() => {
    // jsdom does not implement the <dialog> modal API, so stub the methods the
    // component calls during its effect.
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
  });

  it("should render a dialog element", () => {
    const { container } = render(<ModalOverlayWrapper />);
    expect(container.querySelectorAll("dialog")).toHaveLength(1);
  });

  it("should call props.onClose on an Escape key via cancel event", () => {
    const onClose = jest.fn();
    const { container } = render(<ModalOverlayWrapper onClose={onClose} />);

    // Simulate cancel event (fired when Escape is pressed on dialog)
    const dialog = container.querySelector("dialog");
    const cancelEvent = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancelEvent);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
