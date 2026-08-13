/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render } from "@testing-library/react";
import {
  SportsResultCard,
  SportsPodium,
  SportsResultMascot,
} from "content-src/components/Widgets/SportsWidget/SportsResultCelebration.jsx";

const team = (key, name) => ({
  key,
  name,
  icon_url: `https://example.com/${key}.png`,
});

describe("<SportsResultCard>", () => {
  it("renders the champion flag, code, and long label at large size", () => {
    const { container } = render(
      <SportsResultCard team={team("ARG", "Argentina")} type="champion" />
    );
    expect(container.querySelector(".sports-result-name").textContent).toBe(
      "Argentina"
    );
    const flag = container.querySelector(".sports-result-flag");
    expect(flag.getAttribute("alt")).toBe("Argentina");
    expect(
      container
        .querySelector(".sports-result-placement")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-world-cup-champions");
  });

  it("uses the short champions label at medium size", () => {
    const { container } = render(
      <SportsResultCard
        team={team("ARG", "Argentina")}
        type="champion"
        size="medium"
      />
    );
    expect(
      container
        .querySelector(".sports-result-placement")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-world-cup-champions-short");
  });
});

describe("<SportsPodium>", () => {
  const placements = {
    champion: { team: team("ARG", "Argentina") },
    runnerUp: { team: team("FRA", "France") },
    third: { team: team("CRO", "Croatia") },
  };

  it("renders all three placed teams with their labels", () => {
    const { container } = render(<SportsPodium placements={placements} />);
    const names = [...container.querySelectorAll(".sports-result-name")].map(
      el => el.textContent
    );
    expect(names).toEqual(["Argentina", "France", "Croatia"]);

    const labels = [
      ...container.querySelectorAll(".sports-result-placement"),
    ].map(el => el.getAttribute("data-l10n-id"));
    expect(labels).toEqual([
      "newtab-sports-widget-champions",
      "newtab-sports-widget-runner-up",
      "newtab-sports-widget-third-place",
    ]);
  });
});

describe("<SportsResultMascot>", () => {
  it("renders the champion video mascot with its poster", () => {
    const { container } = render(<SportsResultMascot view="champion" />);
    const video = container.querySelector("video.sports-result-mascot");
    expect(video).not.toBeNull();
    expect(video.classList.contains("sports-result-mascot-champion")).toBe(
      true
    );
    expect(video.getAttribute("src")).toContain("kit-champion.webm");
    expect(video.getAttribute("poster")).toContain("kit-champion.png");
  });

  it("autoplays, loops, and is decorative", () => {
    const { container } = render(<SportsResultMascot view="champion" />);
    const video = container.querySelector("video.sports-result-mascot");
    expect(video.loop).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses the default kit video for the podium and third views", () => {
    for (const view of ["podium", "third"]) {
      const { container } = render(<SportsResultMascot view={view} />);
      const video = container.querySelector("video.sports-result-mascot");
      expect(video.classList.contains(`sports-result-mascot-${view}`)).toBe(
        true
      );
      expect(video.getAttribute("src")).toContain("kit-default.webm");
      expect(video.getAttribute("poster")).toContain("kit-default.png");
    }
  });
});
