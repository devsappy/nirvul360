import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#FAFCF9",
        foreground: "#025033",
        forest: {
          deep: "#025033",
          dark: "#00432C",
          emerald: "#05572F",
          muted: "#3A8067",
          soft: "#CAE4D8",
          pale: "#E6F7EF",
          offwhite: "#FAFCF9",
          purewhite: "#FFFFFF",
          lightgrey: "#E5EAE7",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
