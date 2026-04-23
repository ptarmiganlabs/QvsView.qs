# QvsView.qs — TODO

## Phase 1: Core Scaffold

- [x] Scaffold nebula.js extension project
- [x] Implement hypercube data target (1 dimension)
- [x] Render raw script text in viewer
- [x] Basic property panel (viewer settings)
- [x] Regex-based syntax highlighter (keywords, functions, strings, comments, variables)

## Phase 2: Enhanced Highlighting

- [x] Parse BNF file (`bnf/getBaseBNF_result.json`) to auto-generate complete keyword/function lists
- [x] Add remaining functions from BNF — all 343 functions + 90 aggregation functions now included
- [ ] Variable expansion highlighting (`$(vName)`)
- [ ] `REM` comment edge cases (nested semicolons)

## Phase 3: Viewer Features

- [ ] Dark theme option
- [x] Copy to clipboard button
- [x] Script section detection (tab headers like `///$tab Main`)
- [x] Section navigation / tab switcher
- [x] Text selection and right-click context menu support in the viewer
- [x] Search within script (Ctrl/Cmd+F)
- [x] Collapsible code blocks / folding

## Phase 4: BNF Parser Integration

- [x] Investigate hooking into Qlik Sense's native `bnfLang` AMD module — NOT accessible from extension context (only in Data Load Editor micro-frontend)
- [x] Static BNF extraction: `scripts/extract-bnf-keywords.mjs` parses raw BNF JSON into pre-extracted keyword arrays (6KB vs 557KB raw JSON)
- [x] Runtime BNF fetch: property panel toggle fetches live BNF via Engine API `getBaseBNF()` + `bnf-parser.js` + `bnf-loader.js`
- [x] Deprecated function detection: 18 deprecated entries rendered with strikethrough styling
- [x] Field token type: `[FieldName]` bracket references highlighted as field (orange)
- [ ] Test runtime BNF toggle on Qlik Cloud vs client-managed

## Known Issues

- [x] Add `preview.png` — `nebula sense` warns it's missing during build
- [x] `qInitialDataFetch` height (10,000 rows) may not cover very large scripts — pagination added via `getHyperCubeData`
- [x] Hypercube dimension sorting was alphabetical by default — fixed with `qSortByNumeric: 1` in `data.js` and `qInterColumnSortOrder: [0, 1, 2]` in `object-properties.js`
- [x] Hypercube deduplicates identical/empty script lines — fixed by using a user-supplied row number field as the first dimension (all 3 dims are required)
- [x] Existing objects placed before the row-number dimension change need to be removed and re-added to the sheet to pick up the new property defaults
- [ ] Font size dropdown values may need adjustment after user testing

## Ideas

- [ ] Monaco Editor integration (read-only mode) for richer UX
- [ ] Export script as syntax-highlighted PDF/HTML
- [ ] Line-level linking (click line number to copy link)
