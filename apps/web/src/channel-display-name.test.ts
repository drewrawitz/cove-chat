import { expect, it } from "vite-plus/test";
import { channelDisplayName } from "./channel-display-name.ts";

it("turns lowercase channel slugs into readable names", () => {
  expect(channelDisplayName("product-lab")).toBe("Product Lab");
  expect(channelDisplayName("general")).toBe("General");
});

it("preserves intentional casing", () => {
  expect(channelDisplayName("R&D Updates")).toBe("R&D Updates");
});
