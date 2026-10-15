/**
 * Account field rules. Mirrors backend/app/core/validation.py, which repeats every check on the
 * server: these exist for instant feedback, never as the only line of defence.
 * Create Account checks new details against the rules; Log In only checks fields are present.
 */

export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const MSG = {
  nameRequired: "Please enter your full name.",
  nameTooLong: `Your name must not exceed ${NAME_MAX} characters.`,
  nameInvalid: "Please enter a valid name.",
  emailRequired: "Please enter your email address.",
  emailInvalid: "Please enter a valid email address.",
  passwordRequired: "Please enter a password.",
  passwordShort: `Your password must contain at least ${PASSWORD_MIN} characters.`,
  passwordLong: `Your password must not exceed ${PASSWORD_MAX} characters.`,
  passwordCommon: "This password is commonly used or has been exposed in a known data breach. Please choose another password.",
  passwordContext: "Your password must not contain your name, your email address or the site name.",
  passwordPredictable: "This password is too predictable (repeated or sequential characters). Please choose another password.",
  confirmRequired: "Please confirm your password.",
  passwordsDiffer: "Passwords do not match.",
};

// ---------- Full name ----------

const JOINERS = new Set(["\u200c", "\u200d"]);
const PUNCT = new Set([" ", "-", "'", ".", "\u2019"]);

export function cleanName(v: string) {
  return v.normalize("NFC").replace(/[ \t]+/g, " ").trim();
}

export function nameError(value: string): string | null {
  const raw = (value || "").normalize("NFC");
  if (!raw.trim()) return MSG.nameRequired;
  // Line breaks, null bytes and other control or invisible formatting characters.
  if ([...raw].some((c) => /[\p{Cc}\p{Cs}\p{Co}\p{Cn}]/u.test(c) || (/\p{Cf}/u.test(c) && !JOINERS.has(c)))) return MSG.nameInvalid;
  const name = cleanName(raw);
  if (name.length > NAME_MAX) return MSG.nameTooLong;
  if (![...name].every((c) => /[\p{L}\p{M}]/u.test(c) || PUNCT.has(c) || JOINERS.has(c))) return MSG.nameInvalid;
  if (!/\p{L}/u.test(name)) return MSG.nameInvalid;
  return null;
}

// ---------- Email ----------

export function normalizeEmail(v: string) {
  return (v || "").trim().toLowerCase();
}

const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function emailError(value: string): string | null {
  const email = (value || "").trim();
  if (!email) return MSG.emailRequired;
  if (email.length > EMAIL_MAX || /\s/.test(email) || email.split("@").length !== 2) return MSG.emailInvalid;
  const [local, domain] = email.split("@");
  const labels = domain.split(".");
  const ok = local.length > 0 && local.length <= 64 && domain.length <= 253 && LOCAL.test(local) &&
    labels.length >= 2 && labels.every((l) => LABEL.test(l)) && /^[A-Za-z]{2,}$/.test(labels[labels.length - 1]);
  return ok ? null : MSG.emailInvalid;
}

const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gamil.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gnail.com": "gmail.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.con": "yahoo.com", "yhoo.com": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.con": "hotmail.com", "hotmal.com": "hotmail.com",
  "outlok.com": "outlook.com", "outlook.con": "outlook.com", "outllok.com": "outlook.com",
  "icloud.con": "icloud.com", "iclod.com": "icloud.com", "rediffmial.com": "rediffmail.com",
};

/** "Did you mean ...?" for common provider misspellings. */
export function emailSuggestion(value: string): string | null {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf("@");
  const fix = at > 0 ? DOMAIN_TYPOS[email.slice(at + 1)] : undefined;
  return fix ? `${email.slice(0, at)}@${fix}` : null;
}

// ---------- Password ----------

// Common passwords. The server also checks the Have I Been Pwned breach database.
const COMMON = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "11223344",
  "qwertyui", "qwerty12", "qwerty123", "qwerty1234", "1q2w3e4r", "1qaz2wsx", "asdfghjk", "zxcvbnm1",
  "iloveyou", "iloveyou1", "sunshine", "princess", "football", "baseball", "superman", "trustno1",
  "welcome1", "welcome123", "letmein1", "abc12345", "abcd1234", "aa123456", "admin123", "administrator",
  "changeme", "computer", "internet", "whatever", "starwars", "michael1", "jennifer", "charlie1",
  "monkey12", "dragon12", "shadow12", "master12", "mustang1", "freedom1", "pokemon1", "india123",
  "123456789012345", "1234567890123456", "12345678901234567890", "111111111111111", "000000000000000",
  "passwordpassword", "password12345678", "password123456789", "passwordpassword1", "mypassword123456",
  "qwertyuiopasdfgh", "qwertyuiopasdfghjkl", "qwertyuiop123456", "1qaz2wsx3edc4rfv", "zaq12wsxcde34rfv",
  "iloveyouiloveyou", "iloveyou12345678", "letmeinletmein1", "welcome123456789", "administrator123",
  "changemechangeme", "abcdefghijklmnop", "abcdefghijklmnopqrstuvwxyz", "thequickbrownfox",
  "correcthorsebatterystaple", "trustno1trustno1", "football12345678", "baseball12345678",
  "superman12345678", "princessprincess", "sunshinesunshine", "monkeymonkeymonkey", "dragondragondragon",
]);
const PRODUCT_WORDS = ["cverity"];

/** Length in characters as the server counts them (emoji count once, not twice). */
export const pwLength = (p: string) => [...p.normalize("NFC")].length;

function predictable(pw: string) {
  const chars = [...pw];
  if (new Set(chars).size <= 3) return true;
  const steps = new Set(chars.slice(1).map((c, i) => c.codePointAt(0)! - chars[i].codePointAt(0)!));
  return steps.size === 1 && (steps.has(1) || steps.has(-1));
}

export function newPasswordError(password: string, email = "", name = ""): string | null {
  if (!password) return MSG.passwordRequired;
  const pw = password.normalize("NFC");
  const n = pwLength(pw);
  if (n < PASSWORD_MIN) return MSG.passwordShort;
  if (n > PASSWORD_MAX) return MSG.passwordLong;
  const low = pw.toLowerCase();
  if (COMMON.has(low) || COMMON.has(low.replace(/\s+/g, ""))) return MSG.passwordCommon;
  if (predictable(pw)) return MSG.passwordPredictable;
  const e = normalizeEmail(email);
  const context = [e, e.split("@")[0], ...PRODUCT_WORDS, ...cleanName(name).toLowerCase().split(" ")].filter((w) => w.length >= 4);
  if (context.some((w) => low.includes(w))) return MSG.passwordContext;
  return null;
}

/** Guidance while typing. Deliberately not a strength meter: length is what matters most. */
export function passwordHint(password: string): string {
  const n = pwLength(password);
  if (!n) return `Use at least ${PASSWORD_MIN} characters.`;
  if (n < PASSWORD_MIN) return `${n} of ${PASSWORD_MIN} characters. Keep going.`;
  if (n < 15) return `${n} characters. Good. Longer is even better.`;
  return `${n} characters. Great length.`;
}

/** Log In: only presence. Never the new-account rules, so older accounts keep working. */
export function loginPasswordError(password: string): string | null {
  return password ? null : MSG.passwordRequired;
}

export function confirmError(password: string, confirm: string): string | null {
  if (!confirm) return MSG.confirmRequired;
  // Exact: case, spaces and symbols all count.
  return confirm.normalize("NFC") === password.normalize("NFC") ? null : MSG.passwordsDiffer;
}
