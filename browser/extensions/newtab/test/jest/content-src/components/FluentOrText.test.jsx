import { render } from "@testing-library/react";
import { FluentOrText } from "content-src/components/FluentOrText/FluentOrText";

describe("<FluentOrText>", () => {
  it("should create span with no children", () => {
    const { container } = render(<FluentOrText />);

    expect(container.querySelector("span")).toBeInTheDocument();
  });

  it("should set plain text", () => {
    const { container } = render(<FluentOrText message={"hello"} />);

    expect(container.textContent).toEqual("hello");
  });

  it("should use fluent id on automatic span", () => {
    const { container } = render(<FluentOrText message={{ id: "fluent" }} />);

    expect(
      container.querySelector("span[data-l10n-id='fluent']")
    ).toBeInTheDocument();
  });

  it("should also allow string_id", () => {
    const { container } = render(
      <FluentOrText message={{ string_id: "fluent" }} />
    );

    expect(
      container.querySelector("span[data-l10n-id='fluent']")
    ).toBeInTheDocument();
  });

  it("should use fluent id on child", () => {
    const { container } = render(
      <FluentOrText message={{ id: "fluent" }}>
        <p />
      </FluentOrText>
    );

    expect(
      container.querySelector("p[data-l10n-id='fluent']")
    ).toBeInTheDocument();
  });

  it("should set args for fluent", () => {
    const { container } = render(
      <FluentOrText message={{ args: { num: 5 } }} />
    );
    const renderedArgs = container
      .querySelector("span")
      .getAttribute("data-l10n-args");

    expect(JSON.parse(renderedArgs).num).toEqual(5);
  });

  it("should also allow values", () => {
    const { container } = render(
      <FluentOrText message={{ values: { num: 5 } }} />
    );
    const renderedArgs = container
      .querySelector("span")
      .getAttribute("data-l10n-args");

    expect(JSON.parse(renderedArgs).num).toEqual(5);
  });

  it("should preserve original children with fluent", () => {
    const { container } = render(
      <FluentOrText message={{ id: "fluent" }}>
        <p>
          <b data-l10n-name="bold" />
        </p>
      </FluentOrText>
    );

    expect(
      container.querySelector("b[data-l10n-name='bold']")
    ).toBeInTheDocument();
  });

  it("should only allow a single child", () => {
    // React.Children.only throws when more than one child is passed, which
    // React surfaces via console.error during render.
    const consoleErrorStub = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() =>
      render(
        <FluentOrText>
          <p />
          <p />
        </FluentOrText>
      )
    ).toThrow();

    consoleErrorStub.mockRestore();
  });
});
