import { describe, expect, it } from "vitest";
import { ownsArrow } from "./spatial-nav";

describe("ownsArrow", () => {
  it("lets a remote leave a text field with up and down", () => {
    expect(ownsArrow("INPUT", "search", "down")).toBe(false);
    expect(ownsArrow("INPUT", "text", "up")).toBe(false);
  });

  it("keeps left and right for the caret", () => {
    expect(ownsArrow("INPUT", "search", "left")).toBe(true);
    expect(ownsArrow("INPUT", "text", "right")).toBe(true);
  });

  it("keeps the keys a slider, list and textarea use", () => {
    expect(ownsArrow("INPUT", "range", "left")).toBe(true);
    expect(ownsArrow("SELECT", "select-one", "down")).toBe(true);
    expect(ownsArrow("SELECT", "select-one", "right")).toBe(false);
    expect(ownsArrow("TEXTAREA", "textarea", "up")).toBe(true);
  });

  it("never captures buttons", () => {
    expect(ownsArrow("BUTTON", "submit", "down")).toBe(false);
  });
});
