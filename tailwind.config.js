/** @type {import('tailwindcss').Config} */
const config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        mist: "#f3f4f6",
        signal: "#0f766e",
        ember: "#c2410c",
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at top left, rgba(15,118,110,0.12), transparent 30%), linear-gradient(135deg, rgba(17,24,39,0.04), rgba(17,24,39,0.01))",
      },
    },
  },
  plugins: [],
};

export default config;
