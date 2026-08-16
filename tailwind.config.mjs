import animate from "tailwindcss-animate";
import defaultTheme from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/renderer/**/*.{ts,tsx}"
  ],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", ...defaultTheme.fontFamily.sans]
      },
      colors: {
        border: "var(--border-subtle)",
        input: "var(--border-strong)",
        background: "var(--background-primary)",
        foreground: "var(--text-primary)",
        primary: {
          DEFAULT: "var(--brand-primary)",
          foreground: "var(--brand-ink)"
        },
        secondary: {
          DEFAULT: "var(--surface-hover)",
          foreground: "var(--text-primary)"
        },
        muted: {
          DEFAULT: "var(--background-secondary)",
          foreground: "var(--text-muted)"
        },
        accent: {
          DEFAULT: "var(--brand-accent)",
          foreground: "var(--brand-ink)"
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "#ffffff"
        },
        card: {
          DEFAULT: "var(--surface-elevated)",
          foreground: "var(--text-primary)"
        }
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)"
      },
      boxShadow: {
        card: "var(--shadow-card)",
        panel: "var(--shadow-md)"
      }
    }
  },
  plugins: [animate]
};
