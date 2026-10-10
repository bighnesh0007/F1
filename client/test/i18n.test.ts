import { describe, expect, test } from "vitest";
import { DICTIONARIES, translate } from "../lib/i18n";

describe("translations", () => {
  test("every language translates the same set of texts", () => {
    const [hi, es] = [Object.keys(DICTIONARIES.hi).sort(), Object.keys(DICTIONARIES.es).sort()];
    expect(hi).toEqual(es);
  });
  test("falls back to English for anything untranslated", () => {
    expect(translate("es", "Schedule")).toBe("Calendario");
    expect(translate("hi", "Not in the dictionary")).toBe("Not in the dictionary");
    expect(translate("en", "Schedule")).toBe("Schedule");
  });
});
