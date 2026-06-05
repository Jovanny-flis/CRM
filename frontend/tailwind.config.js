/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Esta sintaxis permite que funcione bg-primary/10, bg-primary/50, etc.
        primary: 'rgb(var(--color-primary) / <alpha-value>)', 
      }
    },
  },
  plugins: [],
}