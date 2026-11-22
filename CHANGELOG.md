# Changelog

## [2.7.0](https://github.com/lanestrin/icorium/compare/v2.6.2...v2.7.0) (2026-11-22)


### Features

* verify measurement units and flag ambiguous separators (19.3) ([#145](https://github.com/lanestrin/icorium/issues/145)) ([ad84627](https://github.com/lanestrin/icorium/commit/ad84627688743d9aaea4bd86b76f81f9799c765c))

## [2.6.2](https://github.com/lanestrin/icorium/compare/v2.6.1...v2.6.2) (2026-11-22)


### Bug Fixes

* name the account status region and keep policy checks per statement ([#143](https://github.com/lanestrin/icorium/issues/143)) ([6082d95](https://github.com/lanestrin/icorium/commit/6082d9569f1f476f65add011fb2b04964ad55031))

## [2.6.1](https://github.com/lanestrin/icorium/compare/v2.6.0...v2.6.1) (2026-11-22)


### Bug Fixes

* guard profile policies and normalize SQL grant checks ([#141](https://github.com/lanestrin/icorium/issues/141)) ([af4605a](https://github.com/lanestrin/icorium/commit/af4605a3452f423169451ad20bc462af26f37ee0))

## [2.6.0](https://github.com/lanestrin/icorium/compare/v2.5.0...v2.6.0) (2026-11-22)


### Features

* add layered header matching (19.2) ([#139](https://github.com/lanestrin/icorium/issues/139)) ([4137330](https://github.com/lanestrin/icorium/commit/413733061481916530124cb4a2408ec20cc0a6f0))

## [2.5.0](https://github.com/lanestrin/icorium/compare/v2.4.1...v2.5.0) (2026-11-22)


### Features

* add structured validation issues and ingestion types (19.1) ([#137](https://github.com/lanestrin/icorium/issues/137)) ([f6d25ae](https://github.com/lanestrin/icorium/commit/f6d25aea0ed048e22e83bf4a41371df7c9746128))

## [2.4.1](https://github.com/lanestrin/icorium/compare/v2.4.0...v2.4.1) (2026-11-20)


### Bug Fixes

* update the Architecture page and add the roadmap ([#134](https://github.com/lanestrin/icorium/issues/134)) ([90921d8](https://github.com/lanestrin/icorium/commit/90921d8db76789727adab0ac4ea009ae4199ed15))

## [2.4.0](https://github.com/lanestrin/icorium/compare/v2.3.0...v2.4.0) (2026-11-19)


### Features

* add sign-in, activation, recovery and sign-out (17.2b) ([#132](https://github.com/lanestrin/icorium/issues/132)) ([0dbe9ec](https://github.com/lanestrin/icorium/commit/0dbe9ecf4334859ac4889b3ae4ba1b1e10a47545))

## [2.3.0](https://github.com/lanestrin/icorium/compare/v2.2.0...v2.3.0) (2026-11-19)


### Features

* add identity schema and invite-only rules (17.2a) ([#130](https://github.com/lanestrin/icorium/issues/130)) ([1a3cf00](https://github.com/lanestrin/icorium/commit/1a3cf009dec27851db290006ab405b1de88ee1ff))

## [2.2.0](https://github.com/lanestrin/icorium/compare/v2.1.0...v2.2.0) (2026-11-18)


### Features

* explain OCR, scaling and customer security (9.15) ([#126](https://github.com/lanestrin/icorium/issues/126)) ([0656409](https://github.com/lanestrin/icorium/commit/06564097b8cd53855ded898904b952ce7470012d))

## [2.1.0](https://github.com/lanestrin/icorium/compare/v2.0.0...v2.1.0) (2026-11-18)


### Features

* read scanned PDFs and images with OCR (9.14c) ([#124](https://github.com/lanestrin/icorium/issues/124)) ([14a4f6f](https://github.com/lanestrin/icorium/commit/14a4f6fa4790f21c08ff1421a86958ada5618b71))

## [2.0.0](https://github.com/lanestrin/icorium/compare/v1.20.0...v2.0.0) (2026-11-18)


### ⚠ BREAKING CHANGES

* the HTTP API (/api/files, /api/process, /api/compare, /api/generate and the rest) and `npm start -w server` no longer exist. Build with `npm run build -w client` and serve client/dist from any static host; files are kept in each visitor's browser.

### Features

* retire the server and Vercel Blob for a static site (16.3) ([#121](https://github.com/lanestrin/icorium/issues/121)) ([8ff66a8](https://github.com/lanestrin/icorium/commit/8ff66a8d88193c2fb310a35997fdb33ce64b8446))

## [1.20.0](https://github.com/lanestrin/icorium/compare/v1.19.0...v1.20.0) (2026-11-18)


### Features

* keep files in the browser with Clear my data (16.2) ([#119](https://github.com/lanestrin/icorium/issues/119)) ([2b1f1f7](https://github.com/lanestrin/icorium/commit/2b1f1f7af07177f91a021b565eecfbdcf1643d8e))

## [1.19.0](https://github.com/lanestrin/icorium/compare/v1.18.0...v1.19.0) (2026-11-17)


### Features

* import text PDF partner files after a review (9.14b) ([#115](https://github.com/lanestrin/icorium/issues/115)) ([fd8da17](https://github.com/lanestrin/icorium/commit/fd8da17de28727e606291d5d804dbb68212ca35e))

## [1.18.0](https://github.com/lanestrin/icorium/compare/v1.17.1...v1.18.0) (2026-11-17)


### Features

* import partner Excel files after a review (9.14a) ([#113](https://github.com/lanestrin/icorium/issues/113)) ([e11f496](https://github.com/lanestrin/icorium/commit/e11f4961e4e3dbae3026464e7f025c0502aa8754))

## [1.17.1](https://github.com/lanestrin/icorium/compare/v1.17.0...v1.17.1) (2026-11-17)


### Bug Fixes

* refuse uploads and comparisons too large to send online (10.15) ([#111](https://github.com/lanestrin/icorium/issues/111)) ([19e8fa1](https://github.com/lanestrin/icorium/commit/19e8fa18a0dc4c4d17007bd4d7601b5219db2022))

## [1.17.0](https://github.com/lanestrin/icorium/compare/v1.16.0...v1.17.0) (2026-11-17)


### Features

* store Blob file metadata apart from CSV text (10.11) ([#107](https://github.com/lanestrin/icorium/issues/107)) ([a9903cd](https://github.com/lanestrin/icorium/commit/a9903cd644425dd5835a4410d1d4c45c8dbeb34b))

## [1.16.0](https://github.com/lanestrin/icorium/compare/v1.15.0...v1.16.0) (2026-11-16)


### Features

* show new results first after Run Processing (9.13) ([#105](https://github.com/lanestrin/icorium/issues/105)) ([d918435](https://github.com/lanestrin/icorium/commit/d91843559b1ebbfbb6c11e19b9891597990ce7a1))

## [1.15.0](https://github.com/lanestrin/icorium/compare/v1.14.0...v1.15.0) (2026-11-16)


### Features

* show new uploads first after uploading (9.12) ([#103](https://github.com/lanestrin/icorium/issues/103)) ([71a4580](https://github.com/lanestrin/icorium/commit/71a45804f09481aed7f92999201c9ab276bf1612))

## [1.14.0](https://github.com/lanestrin/icorium/compare/v1.13.0...v1.14.0) (2026-11-16)


### Features

* move chart and file colours onto design tokens (14.3) ([#100](https://github.com/lanestrin/icorium/issues/100)) ([7def107](https://github.com/lanestrin/icorium/commit/7def1078c454ee33e7eeb9be8b795d38da9ab867))

## [1.13.0](https://github.com/lanestrin/icorium/compare/v1.12.0...v1.13.0) (2026-11-16)


### Features

* load the Generator, Architecture and comparison on demand (14.2) ([#98](https://github.com/lanestrin/icorium/issues/98)) ([47d1be1](https://github.com/lanestrin/icorium/commit/47d1be11fa3fe92e8aac893ae917f021133af7f9))

## [1.12.0](https://github.com/lanestrin/icorium/compare/v1.11.0...v1.12.0) (2026-11-16)


### Features

* wrap long Architecture file paths at phone width (14.5c) ([#95](https://github.com/lanestrin/icorium/issues/95)) ([f7d7b5d](https://github.com/lanestrin/icorium/commit/f7d7b5d9229e1bd88e828872fd033b5c07579b22))

## [1.11.0](https://github.com/lanestrin/icorium/compare/v1.10.0...v1.11.0) (2026-11-16)


### Features

* make the CSV Files page work at phone width (14.5b) ([#93](https://github.com/lanestrin/icorium/issues/93)) ([9e8374e](https://github.com/lanestrin/icorium/commit/9e8374e50b8ea6aa9b69d7a99c3c14012a17dd0c))

## [1.10.0](https://github.com/lanestrin/icorium/compare/v1.9.2...v1.10.0) (2026-11-16)


### Features

* make the dialogs work at phone width (14.5a) ([#91](https://github.com/lanestrin/icorium/issues/91)) ([2156f9c](https://github.com/lanestrin/icorium/commit/2156f9c5181b65c40345a254d8c153a519ef977a))

## [1.9.2](https://github.com/lanestrin/icorium/compare/v1.9.1...v1.9.2) (2026-11-16)


### Bug Fixes

* show "Loading files…" until the file list arrives (10.14) ([#88](https://github.com/lanestrin/icorium/issues/88)) ([4f910e1](https://github.com/lanestrin/icorium/commit/4f910e1a6955e8f3962f25d47ea7e21576823d45))

## [1.9.1](https://github.com/lanestrin/icorium/compare/v1.9.0...v1.9.1) (2026-11-16)


### Bug Fixes

* show a clear message when an error response has none (10.13) ([#86](https://github.com/lanestrin/icorium/issues/86)) ([7100215](https://github.com/lanestrin/icorium/commit/7100215005081793157a369713cb8fc09d384ff6))

## [1.9.0](https://github.com/lanestrin/icorium/compare/v1.8.0...v1.9.0) (2026-11-16)


### Features

* show a reload message when a page fails to render (14.1) ([#84](https://github.com/lanestrin/icorium/issues/84)) ([4209b09](https://github.com/lanestrin/icorium/commit/4209b098edf8817bd64653888ab83a9d24c5263e))

## [1.8.0](https://github.com/lanestrin/icorium/compare/v1.7.0...v1.8.0) (2026-11-15)


### Features

* remove Tailwind and guard against its return (13.7) ([#81](https://github.com/lanestrin/icorium/issues/81)) ([c992c79](https://github.com/lanestrin/icorium/commit/c992c79bc4430bd553cc253b7dfd35f5a05b7a26))

## [1.7.0](https://github.com/lanestrin/icorium/compare/v1.6.0...v1.7.0) (2026-11-15)


### Features

* move the pages and the remaining globals to SCSS (13.6) ([#79](https://github.com/lanestrin/icorium/issues/79)) ([e1ed31d](https://github.com/lanestrin/icorium/commit/e1ed31d46104a3ff92b24f967b427b58e93288d1))

## [1.6.0](https://github.com/lanestrin/icorium/compare/v1.5.0...v1.6.0) (2026-11-15)


### Features

* move the Compare and CSV Generator areas to SCSS (13.5) ([#77](https://github.com/lanestrin/icorium/issues/77)) ([a1bd157](https://github.com/lanestrin/icorium/commit/a1bd157dc1569dcb5f7be9f3aebe9d03d07bf599))

## [1.5.0](https://github.com/lanestrin/icorium/compare/v1.4.0...v1.5.0) (2026-11-15)


### Features

* move the row menu to Radix and the file workspace to SCSS (13.4) ([#75](https://github.com/lanestrin/icorium/issues/75)) ([7ba2266](https://github.com/lanestrin/icorium/commit/7ba2266261bb357bb63b0cbb8022fcb3e52d58d2))

## [1.4.0](https://github.com/lanestrin/icorium/compare/v1.3.0...v1.4.0) (2026-11-15)


### Features

* move dialogs to Radix and the modals area to SCSS (13.3) ([#73](https://github.com/lanestrin/icorium/issues/73)) ([634a373](https://github.com/lanestrin/icorium/commit/634a373fedbb25e00837e29c8bb65801c3c44eb7))

## [1.3.0](https://github.com/lanestrin/icorium/compare/v1.2.0...v1.3.0) (2026-11-15)


### Features

* add design tokens and the SCSS foundation (13.1) ([#70](https://github.com/lanestrin/icorium/issues/70)) ([a911a14](https://github.com/lanestrin/icorium/commit/a911a1474470a166a279c57717d4eb948f0f7ae4))
* add shared Button and Card components with Storybook (13.2) ([#72](https://github.com/lanestrin/icorium/issues/72)) ([9524738](https://github.com/lanestrin/icorium/commit/95247389f66a9a8c01c758faafbe385796a51a12))

## [1.2.0](https://github.com/lanestrin/icorium/compare/v1.1.0...v1.2.0) (2026-11-15)


### Features

* build a deployable release zip for every published release (12.2) ([#68](https://github.com/lanestrin/icorium/issues/68)) ([4245405](https://github.com/lanestrin/icorium/commit/4245405e29d35eb6fed4b0c717b29e7e7b357635))

## [1.1.0](https://github.com/lanestrin/icorium/compare/v1.0.0...v1.1.0) (2026-11-14)


### Features

* add automated releases and a version label (12.1) ([d3e4245](https://github.com/lanestrin/icorium/commit/d3e4245ac72ebc8b91996cd483191f9395b0e6e7))
