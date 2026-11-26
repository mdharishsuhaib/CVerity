import { describe, expect, it } from "vitest";
import { badgeFront, badgeName, emailFirstName } from "./auth-art";

describe("emailFirstName", () => {
  it("uses the part before @, capitalized", () => {
    expect(emailFirstName("haris@gmail.com")).toBe("Haris");
    expect(emailFirstName("mohammed@gmail.com")).toBe("Mohammed");
    expect(emailFirstName("MOHAMMED@x.com")).toBe("Mohammed");
  });
  it("works while the address is still being typed", () => {
    expect(emailFirstName("har")).toBe("Har");
    expect(emailFirstName("haris@")).toBe("Haris");
  });
  it("takes the first word of dotted or numbered names", () => {
    expect(emailFirstName("mohammed.ali99@x.com")).toBe("Mohammed");
    expect(emailFirstName("j_doe@x.com")).toBe("J");
  });
  it("falls back to the demo name when empty or unusable", () => {
    expect(emailFirstName("")).toBe("Ananya");
    expect(emailFirstName("  ")).toBe("Ananya");
    expect(emailFirstName("1234@x.com")).toBe("Ananya");
  });
  it("keeps names up to 30 characters", () => {
    expect(emailFirstName("a".repeat(28) + "@x.com")).toHaveLength(28);
    expect(emailFirstName("a".repeat(40) + "@x.com")).toHaveLength(30);
  });
});

describe("badge", () => {
  it("shows the typed name, tidied", () => {
    expect(badgeName("  Mohammed   Haris ")).toBe("Mohammed Haris");
    expect(badgeName("")).toBe("Ananya Rao");
  });
  it("puts the name and initials on the badge and escapes markup", () => {
    const svg = decodeURIComponent(badgeFront("Mohammed Haris"));
    expect(svg).toContain(">Mohammed Haris<");
    expect(svg).toContain(">MH<");
    expect(decodeURIComponent(badgeFront("<b>&"))).toContain("&lt;b&gt;&amp;");
  });
  it("shows a full 30-character name and fits it to the card", () => {
    const name = "Mohammed Abdul Rahman Siddiqui"; // 30 characters
    expect(badgeName(name)).toBe(name);
    const svg = decodeURIComponent(badgeFront(name));
    expect(svg).toContain(`>${name}<`);
    expect(svg).toContain('textLength="528"');
    expect(Array.from(badgeName("x".repeat(80)))).toHaveLength(30);
  });
});
