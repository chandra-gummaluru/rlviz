# Planning Index

This directory is intentionally kept small. Completed implementation plans are removed once the corresponding code is in place and recorded in `CHANGES_LOG.md`.

## Active

- `2026-06-16-canvas-mathjax-rendering.md` — current plan to replace `MathRenderer`'s p5 plain-text LaTeX fallback with cached MathJax SVG images drawn onto the p5 canvas. This supersedes the June 15 VI canvas declutter note where the two conflict.

## Parked

- Interactive Probability/Reward matrix viewer — the previous implementation was reverted on 2026-06-12, restoring static `P[s][a][s']` and `R[s][a][s']` labels pending a redesigned UI. Recreate this as a new plan if it becomes active again.

## Removed As Implemented Or Superseded

- Hover/click right-panel display for nodes and edges.
- Curved edge hover and arrowhead gap fixes.
- Editor neighborhood highlight and reward-edge focus fixes.
- Right-panel state/action name MathJax and auto-update fixes.
- Right-panel MathJax diagnostics and fixes.
- Original all-math MathJax migration notes, superseded by the active canvas MathJax plan.
- Q-table right-panel display and progressive reveal.
- VI calculation toggle, explanation panel, `explain_q` phase, and canvas declutter work.
- Right-panel resize handle and VI relayout-on-resize fixes.
- Codebase cleanup, palette consolidation, helper extraction, and spinning-arrow visual update plans.
