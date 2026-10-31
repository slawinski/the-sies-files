import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ConnectionStatus from "./ConnectionStatus";

it("labels pending reconciliation without claiming LIVE", () => {
  const html = renderToStaticMarkup(createElement(ConnectionStatus, { health: "SYNCHRONIZING" }));
  expect(html).toContain("AKTUALIZACJA…");
  expect(html).not.toContain("LIVE");
  expect(html).toContain('role="status"');
});
