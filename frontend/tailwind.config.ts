import type { Config } from "tailwindcss";

// Semantic tokens backed by CSS variables (see app/globals.css). Light/dark follow prefers-color-scheme.
// Radius rule: controls (buttons, inputs, badges) = rounded-md (8px); containers (panels) = rounded-xl (12px).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        sunken: v("sunken"),
        ink: v("ink"),
        muted: v("muted"),
        subtle: v("subtle"),
        line: v("line"),
        accent: { DEFAULT: v("accent"), hover: v("accent-hover"), soft: v("accent-soft"), ink: v("accent-ink"), on: v("on-accent") },
        warn: { DEFAULT: v("warn"), soft: v("warn-soft") },
        bad: { DEFAULT: v("bad"), soft: v("bad-soft") },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { md: "8px", xl: "12px" },
      boxShadow: {
        panel: "0 1px 0 rgb(var(--line) / 0.6), 0 8px 24px -16px rgb(var(--shadow) / 0.25)",
      },
      transitionTimingFunction: { out: "cubic-bezier(0.16, 1, 0.3, 1)" },
    },
  },
  plugins: [],
} satisfies Config;
