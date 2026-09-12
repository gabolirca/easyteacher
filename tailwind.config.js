/** Tema de AulaFácil.
 *
 *  Fuente única de verdad de la paleta. Sale de los bloques
 *  <script id="tailwind-config"> que estaban repetidos en cada HTML.
 *  (login.html tenía una paleta naranja anterior al rebrand; se descartó
 *  a propósito para que todo quede en el rojo del colegio.)
 *
 *  Los COLORES ya no viven aquí: salen de marca.json, que es lo único que
 *  cambia entre una escuela y otra. Ese archivo lo genera
 *  herramientas/generador-marca.html a partir del logo del colegio.
 *
 *  Después de cambiar algo aquí o en marca.json: npm run css
 */
const marca = require('./marca.json');

module.exports = {
  content: ['./*.html', './assets/js/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
        colors: marca.colors,
        "borderRadius": {
              "DEFAULT": "1rem",
              "lg": "2rem",
              "xl": "3rem",
              "full": "9999px"
        },
        "spacing": {
              "gutter": "24px",
              "stack-md": "24px",
              "margin-desktop": "48px",
              "stack-lg": "40px",
              "stack-sm": "12px",
              "margin-mobile": "16px",
              "base-unit": "8px"
        },
        "fontFamily": {
              "label-lg": [
                    "Inter",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "Roboto",
                    "Helvetica Neue",
                    "Arial",
                    "sans-serif"
              ],
              "headline-lg-mobile": [
                    "Inter",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "Roboto",
                    "Helvetica Neue",
                    "Arial",
                    "sans-serif"
              ],
              "body-lg": [
                    "Inter",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "Roboto",
                    "Helvetica Neue",
                    "Arial",
                    "sans-serif"
              ],
              "display-lg": [
                    "Inter",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "Roboto",
                    "Helvetica Neue",
                    "Arial",
                    "sans-serif"
              ],
              "headline-lg": [
                    "Inter",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "Roboto",
                    "Helvetica Neue",
                    "Arial",
                    "sans-serif"
              ],
              "headline-md": [
                    "Inter",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "Roboto",
                    "Helvetica Neue",
                    "Arial",
                    "sans-serif"
              ],
              "button-text": [
                    "Inter",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "Roboto",
                    "Helvetica Neue",
                    "Arial",
                    "sans-serif"
              ],
              "body-md": [
                    "Inter",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "Roboto",
                    "Helvetica Neue",
                    "Arial",
                    "sans-serif"
              ]
        },
        "fontSize": {
              "label-lg": [
                    "16px",
                    {
                          "lineHeight": "20px",
                          "fontWeight": "600"
                    }
              ],
              "headline-lg-mobile": [
                    "28px",
                    {
                          "lineHeight": "36px",
                          "fontWeight": "600"
                    }
              ],
              "body-lg": [
                    "18px",
                    {
                          "lineHeight": "28px",
                          "fontWeight": "400"
                    }
              ],
              "display-lg": [
                    "40px",
                    {
                          "lineHeight": "48px",
                          "letterSpacing": "-0.02em",
                          "fontWeight": "700"
                    }
              ],
              "headline-lg": [
                    "32px",
                    {
                          "lineHeight": "40px",
                          "fontWeight": "600"
                    }
              ],
              "headline-md": [
                    "24px",
                    {
                          "lineHeight": "32px",
                          "fontWeight": "600"
                    }
              ],
              "button-text": [
                    "18px",
                    {
                          "lineHeight": "24px",
                          "fontWeight": "600"
                    }
              ],
              "body-md": [
                    "16px",
                    {
                          "lineHeight": "24px",
                          "fontWeight": "400"
                    }
              ]
        }
  }
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')],
};
