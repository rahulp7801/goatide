# Design Tokens Contract

This contract governs the design-token JSON files under `src/styles/tokens/**/*.json`.
Plan 07-02 (DRIFT-01) consumes the jsonpath patterns; Plan 07-03 (DRIFT-03) consumes
the enforcing_sections list.

## Color Tokens

Every color token MUST declare `light` AND `dark` variants. The detector enforces this
via jsonpath patterns asserting both variants exist for each token.

```json
{
  "color": {
    "primary": {
      "light": "#3366ff",
      "dark":  "#88aaff"
    }
  }
}
```

## Spacing

Spacing tokens follow the 4px grid: 4, 8, 12, 16, 24, 32, 48, 64. Values not in this
sequence are caught by jsonpath op:'in'.

## Notes

This is a non-enforcing section. The token philosophy is described here for human
readers; cosmetic edits in this section do not trigger drift.
