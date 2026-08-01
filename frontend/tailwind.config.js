/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        border: "var(--color-divider)",
        hairline: "var(--color-hairline)",
        primary: "var(--color-accent)",
        "primary-hi": "var(--color-accent-hi)",
        pos: "var(--color-pos)",
        neg: "var(--color-neg)",
        muted: "var(--color-muted)",
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', "ui-monospace", "Menlo", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0px",
      },
    },
  },
  plugins: [],
};
