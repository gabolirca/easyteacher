/** Tema de AulaFácil — Colegio Pedro de Gante.
 *
 *  Fuente única de verdad de la paleta. Sale de los bloques
 *  <script id="tailwind-config"> que estaban repetidos en cada HTML.
 *  (login.html tenía una paleta naranja anterior al rebrand; se descartó
 *  a propósito para que todo quede en el rojo del colegio.)
 *
 *  Después de cambiar algo aquí: npm run css
 */
module.exports = {
  content: ['./*.html', './assets/js/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
        "colors": {
              "on-error-container": "#93000a",
              "on-primary-fixed-variant": "#830e10",
              "surface-dim": "#d9d9e2",
              "tertiary-fixed-dim": "#ffb694",
              "tertiary-fixed": "#ffdbcc",
              "on-primary": "#ffffff",
              "outline-variant": "#c2c6d4",
              "surface-container": "#ededf6",
              "primary-fixed-dim": "#f7bdb4",
              "primary": "#7a0d0e",
              "inverse-primary": "#f7bdb4",
              "surface-container-low": "#f2f3fc",
              "outline": "#727784",
              "on-surface": "#191c21",
              "on-primary-container": "#f8cac2",
              "surface": "#f9f9ff",
              "secondary-fixed": "#b1f0ce",
              "on-error": "#ffffff",
              "error-container": "#ffdad6",
              "surface-container-lowest": "#ffffff",
              "primary-fixed": "#fbe1db",
              "background": "#f9f9ff",
              "secondary": "#2c694e",
              "surface-bright": "#f9f9ff",
              "error": "#ba1a1a",
              "on-secondary": "#ffffff",
              "on-tertiary": "#ffffff",
              "primary-container": "#d02b2f",
              "on-primary-fixed": "#3a0906",
              "surface-tint": "#a82322",
              "surface-container-highest": "#e1e2ea",
              "on-secondary-fixed": "#002114",
              "tertiary": "#722b00",
              "surface-container-high": "#e7e8f0",
              "on-surface-variant": "#424752",
              "secondary-container": "#aeeecb",
              "on-secondary-fixed-variant": "#0e5138",
              "on-tertiary-container": "#ffc2a7",
              "inverse-surface": "#2e3037",
              "on-tertiary-fixed-variant": "#7b2f00",
              "secondary-fixed-dim": "#95d4b3",
              "on-background": "#191c21",
              "on-tertiary-fixed": "#351000",
              "on-secondary-container": "#316e52",
              "surface-variant": "#e1e2ea",
              "inverse-on-surface": "#f0f0f9",
              "tertiary-container": "#983c00"
        },
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
