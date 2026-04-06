import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#107B7A", // Stitch Official Teal
          light: "#E6F4F1",
          dark: "#0a5d5c",
        },
        accent: {
          DEFAULT: "#DFA32B", // Stitch Official Gold/Orange
          light: "#FFF8E1",
        },
        status: {
          hot: "#22C55E", // Green (Muy Interesado)
          warm: "#FB923C", // Orange (Interés)
          cold: "#94A3B8", // Blue-gray (Frio)
        },
        background: "#F5F7F9",
      },
      borderRadius: {
        'stitch': '16px',
      },
      boxShadow: {
        'stitch': '0 4px 12px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
};
export default config;
