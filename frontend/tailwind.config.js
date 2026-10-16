/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#12251F",
        mute: "#5F776E",
        brand: {
          DEFAULT: "#2E8B67",
          dark: "#247454",
          deep: "#155C42",
          tint: "#E5F3EC",
        },
        canvas: "#EAF4EE",
      },
      borderRadius: {
        card: "26px",
        chip: "15px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(18,37,31,.04), 0 18px 40px -18px rgba(21,92,66,.22)",
        chip: "0 1px 2px rgba(18,37,31,.05)",
        lift: "0 2px 6px rgba(18,37,31,.05), 0 30px 60px -26px rgba(21,92,66,.34)",
        glow: "0 0 0 1px rgba(255,255,255,.6), 0 24px 60px -24px rgba(46,139,103,.55)",
      },
      keyframes: {
        spinslow: { to: { transform: "rotate(360deg)" } },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
      },
      animation: {
        spinslow: "spinslow 26s linear infinite",
        float: "float 9s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
