# Login page — module map

The original `login.html` mixed markup, ~900 lines of CSS and ~750 lines of
JavaScript in a single file. It has been split into focused, single-purpose
modules.

```
login.html                     Markup only — links the stylesheet + entry script
assets/
  css/
    login.css                  All styles, grouped by section (+ responsive)
  js/
    config.js                  Constants: API base, endpoints, storage keys, OTP rules
    i18n.js                    Translation dictionaries + applyLang()/toggleLang()
    api.js                     Backend access (fetch wrappers). No DOM.
    ui.js                      DOM helpers: toast, modals, password toggle, OTP inputs
    auth.js                    Auth controller: state machine + login/register/OTP/Google flows
    auth-page.js               Entry point: wires DOM events to the controller
```

## Dependency direction

```
auth-page.js  ──►  auth.js  ──►  api.js   (network)
                      │     ──►  ui.js    (DOM feedback)
                      │     ──►  i18n.js  (strings)
                      └     ──►  config.js (constants)
```

`api.js` and `config.js` never import the DOM; `ui.js` never imports the
network. This keeps each layer independently testable and replaceable.

## How to run

The page uses native ES modules (`<script type="module">`), which browsers load
only over `http://` — not `file://`. Serve the folder locally, e.g.:

```bash
npx serve .
# then open http://localhost:3000/login.html
```
