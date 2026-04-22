/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg)",
        surface: "var(--surface)",
        ink: "var(--text)",
        muted: "var(--muted)",
        brand: "var(--brand)",
      },
      fontFamily: {
        sans: ["var(--font)"],
      },
      borderRadius: {
        panel: "var(--radius-lg)",
      },
    },
  },
  plugins: [],
};
