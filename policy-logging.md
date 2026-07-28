# Policy Logging — Spec

Scope: ONLY the policy-log feature and its two chart overlays. Reference implementation: `RLViz Evaluate Prototype.dc.html` (Monte Carlo → Chart view).

## 1 · Logging a policy
- **Evaluate π** (toolbar) or **+ Log π** (chart header) computes exact Vπ(S₀) for the current policy and adds a row to the **Policy log**.
- A name prompt appears first, pre-filled `π1, π2, …` — accept or type a custom name (≤12 chars). Double-click the name in the log to rename later.
- Log is capped at **6** policies; when full, logging refuses with a toast ("remove one first"). A `n / 6` counter sits under the list.
- Row shows: name · E[G]-vs-t sparkline · avg E[G] (★ = best, green).

## 2 · Removing a logged policy (×)
- Each row ends with a small **×** (grey, red on hover) after the E[G] value.
- Clicking × removes ONLY that policy — its row, its chart chip, its value-over-time curve, and its histogram overlay all disappear together.
- **clear** (log header) is separate: wipes all rows at once.

## 3 · Value over time — policy curves
- Every logged π draws its exact E[G]-vs-horizon curve on the value-over-time chart: dashed, one color per policy (best = green), end-labeled `name value` (★ on best).
- Labels de-overlap: right-aligned at the plot edge, stacked ≥13px apart, thin leader lines connect a nudged label to its curve endpoint. The lines should be faded out if not selected. 
- Chart header shows one **chip** per logged π (same color). Chip click = hide/show that policy's curve AND histogram overlay (chip goes strikethrough when hidden). Chip or log-row hover = thicken that curve.

## 4 · Return distribution — histogram overlays
- Each visible logged π overlays a translucent stepped histogram of 64 returns sampled under that policy (cached per π), same color as its chip/curve.
- Its dashed vertical E[G] marker + name label sit on top.
- Chips and hover behave identically to the trend chart (§3) — one control drives both charts.

## Layout
- Both charts are stacked cards, always visible (no view toggle): "Value over time" (±σ band legend) above "Return distribution" (`n = N episodes`).
- The shared strip above the cards holds + Log π and the chips.
