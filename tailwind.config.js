/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "var(--brand-primary, #2563eb)",
          "primary-hover": "var(--brand-primary-hover, #1d4ed8)",
          secondary: "var(--brand-secondary, #475569)",
          bg: "var(--brand-bg, #0f172a)",
          surface: "var(--brand-surface, #1e293b)",
          accent: "var(--brand-accent, #3b82f6)",
        },
      },
    },
  },
  plugins: [],
};
