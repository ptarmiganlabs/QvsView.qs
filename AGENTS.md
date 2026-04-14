# QvsView.qs

This file provides guidance to AIs when working with code in this repository.

## Onboarding

At the start of each session, read: `README.md` and `docs/*.md` for architecture, plan, and syntax details.

## Quick Commands

```bash
npm run lint:fix      # Fix lint errors
npm run format        # Format code
npm run pack:dev      # Dev build + zip
npm run pack:prod     # Production build + zip
npm run start         # Local nebula dev server
```

## Project Basics

- **Qlik Sense extension** — read-only script viewer with syntax highlighting
- Built with [nebula.js](https://qlik.dev/toolkits/nebulajs/), bundled as UMD via Rollup
- `"type": "module"` — use ESM `import`/`export`
- Entry points: `src/index.js` (Supernova), `src/ext/index.js` (property panel)
- Supports Qlik Cloud and Qlik Sense Enterprise (client-managed)
- **Data binding**: Uses a hypercube dimension — user selects a field containing script text

## Architecture

- `src/syntax/` — Regex-based tokenizer, keyword lists (from BNF), token color definitions
- `src/ui/` — Read-only code viewer renderer
- `src/ext/` — Property panel sections (viewer settings, about)
- `src/util/` — Logger with build-type awareness
- `bnf/` — Reference BNF grammar from Qlik Engine API (`GetBaseBNF`)

## Project Structure

```
QvsView.qs/
├── bnf/                          # Reference BNF grammar
│   └── getBaseBNF_result.json
├── docs/                         # Documentation
│   └── qlik-script-viewer-plan.md
├── scripts/                      # Build utilities
│   ├── build-date.cjs
│   ├── post-build.mjs
│   └── zip-extension.mjs
├── src/
│   ├── ext/                      # Property panel
│   │   ├── index.js
│   │   ├── viewer-section.js
│   │   └── about-section.js
│   ├── syntax/                   # Syntax highlighting
│   │   ├── highlighter.js        # Tokenizer + HTML renderer
│   │   ├── keywords.js           # Qlik keywords & functions
│   │   └── tokens.js             # Token types + CSS colors
│   ├── ui/                       # Viewer rendering
│   │   └── viewer.js
│   ├── util/
│   │   └── logger.js
│   ├── data.js                   # Hypercube target (1 dimension)
│   ├── index.js                  # Supernova entry point
│   ├── meta.json                 # Extension metadata
│   ├── object-properties.js      # Default properties
│   └── style.css                 # Viewer styles
├── AGENTS.md
├── eslint.config.js
├── nebula.config.cjs
├── package.json
└── .prettierrc.yaml
```

## Constraints

- No dynamic imports — UMD bundle must be single file
- No runtime dependencies — extension is self-contained
- Font/size props use `type: 'number'` via dropdown
- Keywords are case-insensitive in Qlik script

## Quality Gates (required before commit)

Run in order: `npm run lint:fix` → `npm run format` → verify build works

## JSDoc

When adding/modifying functions, include complete JSDoc: describe behavior, list all params (including object properties), list return types (including Promises), empty line between params and return.

## Versioning

- Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages
- `feat:` for new features, `fix:` for bug fixes, `docs:` for documentation

## Build Artifacts (do not edit)

- `qvsview-qs-ext/` — unpacked extension folder
- `qvsview-qs.zip` — deployable package
- `dist/` — Rollup output

## Repo Hygiene

- Do not edit generated artifacts (`node_modules/`, `qvsview-qs-ext/`, `dist/`)
- Keep diffs focused — avoid drive-by formatting changes

## Project Todo List

**Keep a project-wide todo list** in `./docs/TODO.md` for things that need follow-up:

- Feature gaps or missing test coverage
- Known issues or bugs
- Ideas for future enhancements (e.g., BNF parser integration, dark theme, section tabs)
