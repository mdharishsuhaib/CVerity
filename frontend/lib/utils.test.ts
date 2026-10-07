import { describe, expect, it } from "vitest";
import { band, fmtScore, scoreColor } from "./utils";

describe("utils", () => {
  it("bands scores", () => {
    expect(band(82)).toBe("strong");
    expect(band(55)).toBe("fair");
    expect(band(20)).toBe("weak");
    expect(band(null)).toBe("none");
  });
  it("maps bands to semantic tokens", () => {
    expect(scoreColor(90)).toBe("text-accent");
    expect(scoreColor(40)).toBe("text-bad");
  });
  it("formats scores", () => {
    expect(fmtScore(72.6)).toBe("73");
    expect(fmtScore(undefined)).toBe("-");
  });
});
