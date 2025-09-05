/** @type {import('tailwindcss').Config} */
module.exports = {
  // Include ALL places you’ll use className (Expo Router uses /app)
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [],
};
