# QvsView.qs — TODO

## Phase 1: Core Scaffold

- [x] Scaffold nebula.js extension project
- [x] Implement hypercube data target (1 dimension)
- [x] Render raw script text in viewer
- [x] Basic property panel (viewer settings)
- [x] Regex-based syntax highlighter (keywords, functions, strings, comments, variables)

## Phase 2: Enhanced Highlighting

- [ ] Parse BNF file (`bnf/getBaseBNF_result.json`) to auto-generate complete keyword/function lists
- [ ] Add remaining functions from BNF (currently ~250 of 344 included)
- [ ] Variable expansion highlighting (`$(vName)`)
- [ ] `REM` comment edge cases (nested semicolons)

## Phase 3: Viewer Features

- [ ] Dark theme option
- [x] Copy to clipboard button
- [x] Script section detection (tab headers like `///$tab Main`)
- [x] Section navigation / tab switcher
- [x] Text selection and right-click context menu support in the viewer
- [x] Search within script (Ctrl/Cmd+F)
- [ ] Collapsible code blocks / folding

## Phase 4: BNF Parser Integration (Optional)

- [ ] Investigate hooking into Qlik Sense's native `bnfLang` AMD module
- [ ] Create AMD module discovery utility
- [ ] Wrap native tokenizer with fallback to regex highlighter
- [ ] Test on Qlik Cloud vs client-managed

## Known Issues

- [ ] Add `preview.png` — `nebula sense` warns it's missing during build
- [x] `qInitialDataFetch` height (10,000 rows) may not cover very large scripts — pagination added via `getHyperCubeData`
- [x] Hypercube dimension sorting was alphabetical by default — fixed with `qSortByLoadOrder: 1` in `data.js`
- [ ] Existing objects require dimension removal + re-add for sort fix to take effect
- [ ] Font size dropdown values may need adjustment after user testing

## Ideas

- [ ] Monaco Editor integration (read-only mode) for richer UX
- [ ] Export script as syntax-highlighted PDF/HTML
- [ ] Line-level linking (click line number to copy link)
