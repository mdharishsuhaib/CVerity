import { describe, expect, it } from "vitest";
import {
  MSG, confirmError, emailError, emailSuggestion, loginPasswordError, nameError, newPasswordError, passwordHint,
} from "./validation";

// Same cases as backend/tests/test_auth_checklist.py, so both sides agree.
describe("full name", () => {
  it.each(["", "   ", "\t"])("requires a name (%j)", (n) => expect(nameError(n)).toBe(MSG.nameRequired));
  it.each(["Mohammed Haris Suhaib", "Mary-Jane O'Neil", "Renée Zoë Müller", "J. R. R. Tolkien", "D\u2019Souza", "X",
    "सायरा बानो", "முகமது ஹாரிஸ்", "ಸುಹೈಬ್", "محمد حارث", "李小龙", "Ольга", "Γιώργος"])("accepts %s", (n) => {
    expect(nameError(`  ${n}  `)).toBeNull();
  });
  it("limits to 100 characters", () => {
    expect(nameError("a".repeat(100))).toBeNull();
    expect(nameError("a".repeat(101))).toBe(MSG.nameTooLong);
  });
  it.each(["Haris\nSuhaib", "Haris\u0000", "Ha\u202eris", "Haris\u001b[31m", "12345", "...", "John3", "<script>", "a@b"])(
    "rejects %j", (n) => expect(nameError(n)).toBe(MSG.nameInvalid));
});

describe("email", () => {
  it("requires an email", () => expect(emailError("  ")).toBe(MSG.emailRequired));
  it.each(["plain", "a@@b.com", "a@b@c.com", "a b@c.com", "a@b", "@x.com", "a@-x.com", "a..b@x.com", "x".repeat(65) + "@x.com"])(
    "rejects %j", (e) => expect(emailError(e)).toBe(MSG.emailInvalid));
  it.each(["haris@example.com", "  Haris.S+jobs@Sub.Example.co.in  "])("accepts %j", (e) => expect(emailError(e)).toBeNull());
  it("suggests fixes for common typos", () => {
    expect(emailSuggestion("Haris@gmial.com")).toBe("haris@gmail.com");
    expect(emailSuggestion("haris@gmail.com")).toBeNull();
  });
});

describe("new password", () => {
  it("requires 8 to 128 characters", () => {
    expect(newPasswordError("")).toBe(MSG.passwordRequired);
    expect(newPasswordError("tide7ro")).toBe(MSG.passwordShort); // 7
    expect(newPasswordError("tide7rop")).toBeNull(); // 8
    expect(newPasswordError("x7".repeat(64) + "z")).toBe(MSG.passwordLong);
  });
  it.each(["correct horse battery", "  leading and trailing  ", "émoji 🔐 pass phrase", "पासवर्ड सुरक्षित है अब",
    "only lowercase words here"])("allows any characters, no composition rules: %j", (pw) => {
    expect(newPasswordError(pw)).toBeNull();
  });
  it.each(["passwordpassword", "123456789012345", "qwertyuiopasdfgh", "12345678", "Password1", "iloveyou"])("rejects common %s", (pw) => {
    expect(newPasswordError(pw)).toBe(MSG.passwordCommon);
  });
  it.each(["aaaaaaaaaaaaaaaa", "abcdefghijklmnoq".slice(0, 15), "ababababababababab"])("rejects predictable %s", (pw) => {
    expect(newPasswordError(pw)).not.toBeNull();
  });
  it("rejects name, email and site name", () => {
    for (const pw of ["my cverity password 1", "haris.suhaib@ex rocks", "suhaib forever and ever"]) {
      expect(newPasswordError(pw, "haris.suhaib@example.com", "Mohammed Haris Suhaib")).toBe(MSG.passwordContext);
    }
  });
  it("counts emoji as one character", () => {
    const pw = "🔐🌊🍁🚲🎈🌙🧭"; // 7 emoji = 7 characters, not 14
    expect(newPasswordError(pw)).toBe(MSG.passwordShort);
    expect(newPasswordError(pw + "x")).toBeNull();
  });
  it("gives guidance, not a strength score", () => {
    expect(passwordHint("abc")).toContain("3 of 8");
  });
});

describe("login and confirmation", () => {
  it("login only needs a password to be present (old accounts keep working)", () => {
    expect(loginPasswordError("")).toBe(MSG.passwordRequired);
    expect(loginPasswordError("short")).toBeNull();
  });
  it("confirmation must match exactly", () => {
    expect(confirmError("sunlit harbor maple 42", "")).toBe(MSG.confirmRequired);
    for (const c of ["Sunlit harbor maple 42", "sunlit harbor maple 42 ", "sunlit harbor maple 43"]) {
      expect(confirmError("sunlit harbor maple 42", c)).toBe(MSG.passwordsDiffer);
    }
    expect(confirmError("sunlit harbor maple 42", "sunlit harbor maple 42")).toBeNull();
  });
});
