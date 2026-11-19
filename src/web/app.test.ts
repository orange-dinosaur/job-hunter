import { expect, test } from "bun:test";
import { pageTitle } from "./app.tsx";

test("pageTitle maps paths to pages", () => {
  expect(pageTitle("/")).toBe("Offers");
  expect(pageTitle("/offers/0ca3d75b")).toBe("Offer detail");
  expect(pageTitle("/cv")).toBe("CV");
  expect(pageTitle("/offers/a/b")).toBe("Page not found");
  expect(pageTitle("/nope")).toBe("Page not found");
});
