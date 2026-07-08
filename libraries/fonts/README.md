# Vendored fonts

Font files used by the dark-theme redesign, loaded both by p5 (`loadFont()`, canvas text) and by
`style.css` (`@font-face`, DOM text) — see `src/main/view/helpers/Typography.js`.

All fonts are SIL Open Font License 1.1 (see `OFL.txt`, copied from the IBM Plex repo; STIX Two
Text ships under the same license terms).

| File | Family | Source |
|---|---|---|
| `IBMPlexSans-Regular.ttf` | IBM Plex Sans, 400 | https://github.com/IBM/plex (packages/plex-sans) |
| `IBMPlexSans-Medium.ttf` | IBM Plex Sans, 500 | same |
| `IBMPlexSans-SemiBold.ttf` | IBM Plex Sans, 600 | same |
| `IBMPlexSans-Bold.ttf` | IBM Plex Sans, 700 (DOM-only; no canvas label currently needs bold) | same |
| `IBMPlexMono-Regular.ttf` | IBM Plex Mono, 400 | https://github.com/IBM/plex (packages/plex-mono) |
| `IBMPlexMono-Medium.ttf` | IBM Plex Mono, 500 | same |
| `STIXTwoText-Italic.ttf` | STIX Two Text, italic (variable font, default instance used) | https://github.com/google/fonts (ofl/stixtwotext) — the upstream https://github.com/stipub/stixfonts repo ships sources only, no compiled binaries |
