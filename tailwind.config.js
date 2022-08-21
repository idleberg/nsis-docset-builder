const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/templates/docset.ejs',
    './src/templates/index.ejs', 
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Fira Sans"', ...defaultTheme.fontFamily.sans],
        mono: ['"Fira Mono"', ...defaultTheme.fontFamily.mono]
      }
    }
  },
  plugins: []
}
