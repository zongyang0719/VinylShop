import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1a1512",
        wood: "#2d2420",
        paper: "#f5f0eb",
      },
      boxShadow: {
        vinyl: "0 8px 0 0 rgba(0,0,0,.4), 0 16px 30px rgba(0,0,0,.28)",
        cd: "0 2px 0 0 rgba(255,255,255,.1), 0 12px 22px rgba(0,0,0,.28)",
      },
    },
  },
  plugins: [],
};

export default config;
