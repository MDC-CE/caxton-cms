/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  // Paths are relative to THIS file (PACKAGE_ROOT), not process.cwd().
  // Weblify runs with cwd = PROJECT_ROOT, which has no ./client folder.
  content: {
    relative: true,
    files: [
      "./client/index.html",
      "./client/src/**/*.{js,jsx,ts,tsx}",
    ],
  },
  theme: {
    // MDC Figma MediaQuery / Grid System v0.1
    // Frame viewports: sm 332 · md 679 · lg 1132 · xl 1468
    screens: {
      sm: "332px",
      md: "679px",
      lg: "1132px",
      xl: "1468px",
      "2xl": "1536px",
      // Navbar chrome (between tablet and desktop)
      nav: "830px",
    },
    extend: {
      borderRadius: {
        lg: ".5625rem" /* 9px */,
        md: ".375rem" /* 6px */,
        sm: ".1875rem" /* 3px */,
        card: "0.75rem" /* 12px - brand standard */,
      },
      boxShadow: {
        card: "0 2px 2px 0 #E5E7EB80",
        elevation: "0 4px 4px 0 #E5E7EB80",
        "elevation-blue": "0 6px 10px 0 #005EAA4D",
      },
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
          border: "var(--muted-border)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          border: "var(--destructive-border)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          1: "hsl(var(--chart-1) / <alpha-value>)",
          2: "hsl(var(--chart-2) / <alpha-value>)",
          3: "hsl(var(--chart-3) / <alpha-value>)",
          4: "hsl(var(--chart-4) / <alpha-value>)",
          5: "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-accent-border)",
        },
        status: {
          online: "rgb(37 191 108)",
          away: "rgb(255 212 0)",
          busy: "rgb(234 18 57)",
          offline: "rgb(118 118 118)",
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)"],
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        /* MDC typography roles (Figma) — L = desktop, S = mobile default */
        h1: ["45px", { lineHeight: "45px", fontWeight: "700", letterSpacing: "0" }],
        h2: ["35px", { lineHeight: "35px", fontWeight: "700", letterSpacing: "0" }],
        h3: ["20px", { lineHeight: "22px", fontWeight: "700", letterSpacing: "0" }],
        h4: ["20px", { lineHeight: "22px", fontWeight: "500", letterSpacing: "0" }],
        body: ["16px", { lineHeight: "20px", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "18px", fontWeight: "400" }],
        link: ["16px", { lineHeight: "18px", fontWeight: "400" }],
      },
      spacing: {
        section: "64px",
        "card-padding": "24px",
        gutter: "20px",
        "page-margin": "var(--page-margin)",
      },
      transitionDuration: {
        brand: "150ms",
      },
      transitionTimingFunction: {
        brand: "ease-out",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        blink: "blink 1s steps(1) infinite",
      },
    },
  },
  safelist: ["group/editimg", "group-hover/editimg:visible"],
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
