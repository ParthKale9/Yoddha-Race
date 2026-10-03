import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Yoddha palette: black, white, flame orange.
        navy: { DEFAULT: "#0A0A0A", deep: "#000000", soft: "#1C1C1C" },
        saffron: { DEFAULT: "#FF7A1A", dark: "#E25F00" },
        crimson: "#E8481C",
        chalk: "#FFFFFF",
        ink: "#0A0A0A",
      },
      fontFamily: {
        display: ['"Bahnschrift"', '"Roboto Condensed"', '"Arial Narrow"', "system-ui", "sans-serif"],
        sans: ["system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
