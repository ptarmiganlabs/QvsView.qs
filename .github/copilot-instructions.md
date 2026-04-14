---
applyTo: '**'
---

# copilot-instructions.md

This file provides guidance to Copilot when working with code in the QvsView.qs repository.

## Onboarding

At the start of each session, read:

1. `README.md` for project overview
2. `docs/qlik-script-viewer-plan.md` for architecture and plan
3. `AGENTS.md` for build commands and conventions

## Quality Gates

When writing code, Copilot must not finish until all of these succeed:

1. `npm run lint:fix`
2. `npm run format`

If any check fails, fix the issues and run checks again.

## Project Basics (read this before changing code)

- This repo is a **Qlik Sense extension** built with [nebula.js](https://qlik.dev/toolkits/nebulajs/) and bundled as a UMD module via Rollup.
- `"type": "module"` in `package.json` — prefer `import`/`export` and ESM patterns.
- The Supernova entry point is `src/index.js`. The property panel is defined in `src/ext/index.js`.
- The extension supports **both Qlik Cloud and Qlik Sense Enterprise on Windows (client-managed)**.
- **Data binding**: A single hypercube dimension — user selects a field containing script text.

## How to Build & Deploy

- Install deps: `npm ci`
- Development build + zip: `npm run pack:dev` → `qvsview-qs.zip`
- Production build + zip: `npm run pack:prod` → `qvsview-qs.zip`
- Common scripts:
    - `npm run lint:fix`
    - `npm run format`
    - `npm run build` (build only, no zip)
    - `npm run start` (nebula serve for local dev)

## Architecture

- **Syntax layer** (`src/syntax/`): Regex-based tokenizer (`highlighter.js`), keyword database (`keywords.js`), token type/color definitions (`tokens.js`).
- **UI layer** (`src/ui/`): Read-only code viewer renderer (`viewer.js`).
- **Property panel** (`src/ext/`): Viewer settings (line numbers, wrap, font size) and about section.
- **Utilities** (`src/util/`): Logger with build-type awareness.
- **Data** (`src/data.js`): Hypercube target — one dimension, zero measures.
- **BNF reference** (`bnf/`): Official Qlik Engine BNF grammar for keyword extraction.

## Constraints

- No dynamic imports — UMD bundle must be single file
- No runtime dependencies — extension is fully self-contained
- Keywords are case-insensitive in Qlik script
- Build-time tokens: `__BUILD_TYPE__`, `__PACKAGE_VERSION__`, `__BUILD_DATE__`
- **Extension upload**: You cannot upload the extension zip to Qlik Sense yourself. After building, tell the user the zip is ready and wait for them to confirm the upload is done before testing.

## Coding Guidelines

- Include complete JSDoc for all functions (behavior, params, returns)
- Use Prettier and ESLint — do not do manual formatting
- Keep diffs focused on the requested change
