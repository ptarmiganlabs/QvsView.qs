# Changelog

## [0.4.0](https://github.com/ptarmiganlabs/QvsView.qs/compare/qvsview-qs-v0.3.0...qvsview-qs-v0.4.0) (2026-04-20)


### Features

* add BNF parser and loader for dynamic keyword extraction ([281563c](https://github.com/ptarmiganlabs/QvsView.qs/commit/281563c1e0152ba934303b41625cb81fae9eba44))
* Add CI workflows ([a613a0f](https://github.com/ptarmiganlabs/QvsView.qs/commit/a613a0fde097b5b1d569030e833920a4c91ec128))
* add context menu option to copy selected text to clipboard ([387681d](https://github.com/ptarmiganlabs/QvsView.qs/commit/387681d58b70741d765ff008126808957772faa8))
* Add list of available Anthropic LLMs ([6724697](https://github.com/ptarmiganlabs/QvsView.qs/commit/6724697f0f09010f162d7fd5efc444e87508f860))
* add Markdown table rendering support to AI analysis view ([1b8467a](https://github.com/ptarmiganlabs/QvsView.qs/commit/1b8467ad26eb84d47ce79a6ef9dcd118533f1591))
* add PDF generation for README and update packaging scripts ([3d38092](https://github.com/ptarmiganlabs/QvsView.qs/commit/3d38092351f694019eebf78f291561667acc8387))
* add search functionality to toolbar with clear button ([4784707](https://github.com/ptarmiganlabs/QvsView.qs/commit/478470762f4c6558641353c7770dc418193d6376))
* add section tabs, copy button, and hypercube pagination ([ddd6d80](https://github.com/ptarmiganlabs/QvsView.qs/commit/ddd6d805717ed31a1cfce3da1d910d0851d073b8))
* add SVG preview for QvsView.qs extension ([f7c83cf](https://github.com/ptarmiganlabs/QvsView.qs/commit/f7c83cf05d663ed785602a5bbdb6dc3783db65be))
* add text selection support and in-viewer search (Ctrl/Cmd+F) ([2067f1b](https://github.com/ptarmiganlabs/QvsView.qs/commit/2067f1b8eaf80079452c20bf539081a77a390ed5))
* add toggle to control when prompt template is specified ([bb0cfd2](https://github.com/ptarmiganlabs/QvsView.qs/commit/bb0cfd21d714d22794df0086d0cfa2e514c82201)), closes [#3](https://github.com/ptarmiganlabs/QvsView.qs/issues/3)
* Added AI analysis using Ollama ([641552f](https://github.com/ptarmiganlabs/QvsView.qs/commit/641552f2349f2568ccc8ed98eef6aa5e2fae5d2f))
* enhance erDiagram sanitization and improve column index resolution in data fetching ([1b2e0fa](https://github.com/ptarmiganlabs/QvsView.qs/commit/1b2e0fa44bebba589063b4fbe50250c9b883b99e))
* implement code folding feature with toolbar options for copy button and font size ([462a880](https://github.com/ptarmiganlabs/QvsView.qs/commit/462a880d793f8cc99657b63ec9f406690f38a21f))
* Implement OpenAI model fetching and refresh functionality ([46efa86](https://github.com/ptarmiganlabs/QvsView.qs/commit/46efa8650952e6a18054613cdd05a7c10297a202))
* show active prompt template in AI analysis loading and result views ([15b7941](https://github.com/ptarmiganlabs/QvsView.qs/commit/15b794192fb3f6ff0403de105a68812132d1582f))
* Show warning/count of selected scripts when there are more than 5 of them ([9d6b34d](https://github.com/ptarmiganlabs/QvsView.qs/commit/9d6b34d41a5f2b26523f7f74ad40b0756081580b))
* Two variants: One smaller for Internet connected scenarios, and one larger for air-gapped ([2b4f880](https://github.com/ptarmiganlabs/QvsView.qs/commit/2b4f880edd262e5dbd159c49e3a36eb10c027972))
* Update Anthropic model handling ([f4fa341](https://github.com/ptarmiganlabs/QvsView.qs/commit/f4fa3412ab74a81e573590cb4900d79df3c568d6))


### Bug Fixes

* adjust user-select properties for code and viewer elements ([5499415](https://github.com/ptarmiganlabs/QvsView.qs/commit/5499415baef1d17a14514d73bb0cf648df55f074))
* apply unresolved review feedback from PR review thread ([7cc447f](https://github.com/ptarmiganlabs/QvsView.qs/commit/7cc447f2f7d3811672f6810c1a6bd51c1a437410))
* better handling of empty lines in the viewed script ([f041167](https://github.com/ptarmiganlabs/QvsView.qs/commit/f0411677bd44b495c4d9206f8abc94d50c21de8a))
* **docs:** update README with accurate file sizes and add LICENSE file ([dc948a8](https://github.com/ptarmiganlabs/QvsView.qs/commit/dc948a8468dd16e678b36c36e28f1cb332204947))
* eliminate listener leaks in ai-modal close handler ([a7c519a](https://github.com/ptarmiganlabs/QvsView.qs/commit/a7c519ad8ae036bf00472523f862703e659901de))
* make PDF generation non-fatal when Chrome/Puppeteer is not installed ([27d0167](https://github.com/ptarmiganlabs/QvsView.qs/commit/27d016764405df656863d325af5faaf9bbf9ce12))
* mark `preview.png` as added in TODO to resolve build warning ([0fc1cb3](https://github.com/ptarmiganlabs/QvsView.qs/commit/0fc1cb3dadc117a60995176870e087ffe352c375))
* move copy handler to container so Cmd+C copies only selected text ([df65f60](https://github.com/ptarmiganlabs/QvsView.qs/commit/df65f60cad82f8f06d0751b4691d2925d12b37fb))
* move role/aria-modal/aria-label to dialog, add tabindex=-1, focus close button on open ([d664509](https://github.com/ptarmiganlabs/QvsView.qs/commit/d6645096f0001d23288e67e906987825c8b38f9c))
* paginate fetchActiveIdentifiers + pin mermaid CDN version with fallback ([ed9022e](https://github.com/ptarmiganlabs/QvsView.qs/commit/ed9022e661acf6915f20f32f17ee907d2c2fc1bd))
* search input typing, copy support, toolbar layout ([4624ef5](https://github.com/ptarmiganlabs/QvsView.qs/commit/4624ef51acfa0cb01ed94ddc1d277532125781ff))
* tighten table row detection and support escaped pipes in cells ([5536016](https://github.com/ptarmiganlabs/QvsView.qs/commit/55360164cf621696ed097ad7b594dbfd1454cba5))
* update basic-ftp package version to 5.3.0 ([08d6356](https://github.com/ptarmiganlabs/QvsView.qs/commit/08d6356c1f0319f1122d773fec28e49353e7b684))
* use keydown + Clipboard API for Cmd/Ctrl+C copy ([c0e6518](https://github.com/ptarmiganlabs/QvsView.qs/commit/c0e65189e9f6f4773421599ff4ae6bb0dc3c1df0))


### Miscellaneous

* add gitleaks:allow for example xrfkey placeholders ([711dbbb](https://github.com/ptarmiganlabs/QvsView.qs/commit/711dbbb4624581ea02c29a7fe1e05a3deea5bb46))
* **main:** release qvsview-qs 0.2.0 ([15df951](https://github.com/ptarmiganlabs/QvsView.qs/commit/15df951a5bb305a367f0c4f3e2260f52e6b41646))
* **main:** release qvsview-qs 0.2.0 ([0497e0e](https://github.com/ptarmiganlabs/QvsView.qs/commit/0497e0efc118546cbdb6e9493b35c2c530fb4c32))
* **main:** release qvsview-qs 0.3.0 ([599d06c](https://github.com/ptarmiganlabs/QvsView.qs/commit/599d06c4aefc2f7950f3b9e00033402cd66de2c3))
* **main:** release qvsview-qs 0.3.0 ([d5cea9b](https://github.com/ptarmiganlabs/QvsView.qs/commit/d5cea9b0e01ce3408c755f07fdd84a5df6a07c52))
* remove CodeQL analysis workflow configuration ([4b1b444](https://github.com/ptarmiganlabs/QvsView.qs/commit/4b1b444683eb57be3d15ad49d67519578620dedc))
* Update eslint and prettier versions ([9bf78fd](https://github.com/ptarmiganlabs/QvsView.qs/commit/9bf78fd9f6688a13d9f93ee083f71838bd4cfeb1))


### Refactoring

* improve clarity of system prompt computation and comment wording ([4c2388b](https://github.com/ptarmiganlabs/QvsView.qs/commit/4c2388bab05765aa970c2daa476298510871675d))


### Documentation

* Add FUNDING.yml and README.md for project support and documentation ([3d3d68f](https://github.com/ptarmiganlabs/QvsView.qs/commit/3d3d68fa079671cbcc4c6966556bfcbf154fc3a9))

## [0.3.0](https://github.com/ptarmiganlabs/QvsView.qs/compare/qvsview-qs-v0.2.0...qvsview-qs-v0.3.0) (2026-04-20)


### Features

* Add list of available Anthropic LLMs ([6724697](https://github.com/ptarmiganlabs/QvsView.qs/commit/6724697f0f09010f162d7fd5efc444e87508f860))
* Implement OpenAI model fetching and refresh functionality ([46efa86](https://github.com/ptarmiganlabs/QvsView.qs/commit/46efa8650952e6a18054613cdd05a7c10297a202))
* Update Anthropic model handling ([f4fa341](https://github.com/ptarmiganlabs/QvsView.qs/commit/f4fa3412ab74a81e573590cb4900d79df3c568d6))


### Miscellaneous

* Update eslint and prettier versions ([9bf78fd](https://github.com/ptarmiganlabs/QvsView.qs/commit/9bf78fd9f6688a13d9f93ee083f71838bd4cfeb1))

## [0.2.0](https://github.com/ptarmiganlabs/QvsView.qs/compare/qvsview-qs-v0.1.0...qvsview-qs-v0.2.0) (2026-04-19)

### Features

- add BNF parser and loader for dynamic keyword extraction ([281563c](https://github.com/ptarmiganlabs/QvsView.qs/commit/281563c1e0152ba934303b41625cb81fae9eba44))
- Add CI workflows ([a613a0f](https://github.com/ptarmiganlabs/QvsView.qs/commit/a613a0fde097b5b1d569030e833920a4c91ec128))
- add context menu option to copy selected text to clipboard ([387681d](https://github.com/ptarmiganlabs/QvsView.qs/commit/387681d58b70741d765ff008126808957772faa8))
- add Markdown table rendering support to AI analysis view ([1b8467a](https://github.com/ptarmiganlabs/QvsView.qs/commit/1b8467ad26eb84d47ce79a6ef9dcd118533f1591))
- add PDF generation for README and update packaging scripts ([3d38092](https://github.com/ptarmiganlabs/QvsView.qs/commit/3d38092351f694019eebf78f291561667acc8387))
- add search functionality to toolbar with clear button ([4784707](https://github.com/ptarmiganlabs/QvsView.qs/commit/478470762f4c6558641353c7770dc418193d6376))
- add section tabs, copy button, and hypercube pagination ([ddd6d80](https://github.com/ptarmiganlabs/QvsView.qs/commit/ddd6d805717ed31a1cfce3da1d910d0851d073b8))
- add SVG preview for QvsView.qs extension ([f7c83cf](https://github.com/ptarmiganlabs/QvsView.qs/commit/f7c83cf05d663ed785602a5bbdb6dc3783db65be))
- add text selection support and in-viewer search (Ctrl/Cmd+F) ([2067f1b](https://github.com/ptarmiganlabs/QvsView.qs/commit/2067f1b8eaf80079452c20bf539081a77a390ed5))
- add toggle to control when prompt template is specified ([bb0cfd2](https://github.com/ptarmiganlabs/QvsView.qs/commit/bb0cfd21d714d22794df0086d0cfa2e514c82201)), closes [#3](https://github.com/ptarmiganlabs/QvsView.qs/issues/3)
- Added AI analysis using Ollama ([641552f](https://github.com/ptarmiganlabs/QvsView.qs/commit/641552f2349f2568ccc8ed98eef6aa5e2fae5d2f))
- enhance erDiagram sanitization and improve column index resolution in data fetching ([1b2e0fa](https://github.com/ptarmiganlabs/QvsView.qs/commit/1b2e0fa44bebba589063b4fbe50250c9b883b99e))
- implement code folding feature with toolbar options for copy button and font size ([462a880](https://github.com/ptarmiganlabs/QvsView.qs/commit/462a880d793f8cc99657b63ec9f406690f38a21f))
- show active prompt template in AI analysis loading and result views ([15b7941](https://github.com/ptarmiganlabs/QvsView.qs/commit/15b794192fb3f6ff0403de105a68812132d1582f))
- Show warning/count of selected scripts when there are more than 5 of them ([9d6b34d](https://github.com/ptarmiganlabs/QvsView.qs/commit/9d6b34d41a5f2b26523f7f74ad40b0756081580b))
- Two variants: One smaller for Internet connected scenarios, and one larger for air-gapped ([2b4f880](https://github.com/ptarmiganlabs/QvsView.qs/commit/2b4f880edd262e5dbd159c49e3a36eb10c027972))

### Bug Fixes

- adjust user-select properties for code and viewer elements ([5499415](https://github.com/ptarmiganlabs/QvsView.qs/commit/5499415baef1d17a14514d73bb0cf648df55f074))
- apply unresolved review feedback from PR review thread ([7cc447f](https://github.com/ptarmiganlabs/QvsView.qs/commit/7cc447f2f7d3811672f6810c1a6bd51c1a437410))
- better handling of empty lines in the viewed script ([f041167](https://github.com/ptarmiganlabs/QvsView.qs/commit/f0411677bd44b495c4d9206f8abc94d50c21de8a))
- eliminate listener leaks in ai-modal close handler ([a7c519a](https://github.com/ptarmiganlabs/QvsView.qs/commit/a7c519ad8ae036bf00472523f862703e659901de))
- make PDF generation non-fatal when Chrome/Puppeteer is not installed ([27d0167](https://github.com/ptarmiganlabs/QvsView.qs/commit/27d016764405df656863d325af5faaf9bbf9ce12))
- mark `preview.png` as added in TODO to resolve build warning ([0fc1cb3](https://github.com/ptarmiganlabs/QvsView.qs/commit/0fc1cb3dadc117a60995176870e087ffe352c375))
- move copy handler to container so Cmd+C copies only selected text ([df65f60](https://github.com/ptarmiganlabs/QvsView.qs/commit/df65f60cad82f8f06d0751b4691d2925d12b37fb))
- move role/aria-modal/aria-label to dialog, add tabindex=-1, focus close button on open ([d664509](https://github.com/ptarmiganlabs/QvsView.qs/commit/d6645096f0001d23288e67e906987825c8b38f9c))
- paginate fetchActiveIdentifiers + pin mermaid CDN version with fallback ([ed9022e](https://github.com/ptarmiganlabs/QvsView.qs/commit/ed9022e661acf6915f20f32f17ee907d2c2fc1bd))
- search input typing, copy support, toolbar layout ([4624ef5](https://github.com/ptarmiganlabs/QvsView.qs/commit/4624ef51acfa0cb01ed94ddc1d277532125781ff))
- tighten table row detection and support escaped pipes in cells ([5536016](https://github.com/ptarmiganlabs/QvsView.qs/commit/55360164cf621696ed097ad7b594dbfd1454cba5))
- update basic-ftp package version to 5.3.0 ([08d6356](https://github.com/ptarmiganlabs/QvsView.qs/commit/08d6356c1f0319f1122d773fec28e49353e7b684))
- use keydown + Clipboard API for Cmd/Ctrl+C copy ([c0e6518](https://github.com/ptarmiganlabs/QvsView.qs/commit/c0e65189e9f6f4773421599ff4ae6bb0dc3c1df0))

### Miscellaneous

- add gitleaks:allow for example xrfkey placeholders ([711dbbb](https://github.com/ptarmiganlabs/QvsView.qs/commit/711dbbb4624581ea02c29a7fe1e05a3deea5bb46))

### Refactoring

- improve clarity of system prompt computation and comment wording ([4c2388b](https://github.com/ptarmiganlabs/QvsView.qs/commit/4c2388bab05765aa970c2daa476298510871675d))

### Documentation

- Add FUNDING.yml and README.md for project support and documentation ([3d3d68f](https://github.com/ptarmiganlabs/QvsView.qs/commit/3d3d68fa079671cbcc4c6966556bfcbf154fc3a9))
