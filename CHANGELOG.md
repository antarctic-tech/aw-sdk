# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.4.2](https://github.com/antarctic-tech/aw-sdk/compare/v0.4.1...v0.4.2) (2026-09-24)


### Features

* **FE-1640:** вибрация ([46f98b5](https://github.com/antarctic-tech/aw-sdk/commit/46f98b53932d7921614be7f543c884edc801de33))
* **FE-1640:** окружение хоста и QR-сканер ([cf0602c](https://github.com/antarctic-tech/aw-sdk/commit/cf0602c613ab60431f55f20ef8332c9a132b27b1))
* **FE-1640:** цвет фона ([a482f5f](https://github.com/antarctic-tech/aw-sdk/commit/a482f5ffdebba70530bc6bde7236495f7c81fb37))


### Bug Fixes

* **FE-1640:** destroy сбрасывает таймер, убрал возможность передать текст в сканер ([e93c154](https://github.com/antarctic-tech/aw-sdk/commit/e93c15410bdc61875b41ef606cca3aaf249aed11))
* **FE-1640:** ERROR-ответ на запрос не эмитит sdk.error ([b421c14](https://github.com/antarctic-tech/aw-sdk/commit/b421c142f77ebf3e224d9884bc37cfb723a5ea9e))
* **FE-1640:** фикс кнопки назад ([2499798](https://github.com/antarctic-tech/aw-sdk/commit/2499798470986c7779a845a79cc7f1d5dabfe69c))

### [0.4.1](https://github.com/antarctic-tech/aw-sdk/compare/v0.4.0...v0.4.1) (2026-09-23)

## [0.4.0](https://github.com/antarctic-tech/aw-sdk/compare/v0.3.4...v0.4.0) (2026-09-10)


### ⚠ BREAKING CHANGES

* **aw-2013:** удалён `sdk.operations.prepare()` и связанные с ним типы;
изменены значения `AWScope` и `AWOperationType`.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012URvKNyzbtqcgJHRxaDoJs

### Features

* **aw-2013:** привести операции и скоупы к контракту кошелька ([2c8a664](https://github.com/antarctic-tech/aw-sdk/commit/2c8a6646db6bd6557a027b6ffeb3bc700ca7e736))


### Bug Fixes

* **aw-2013:** брать SDK_VERSION из package.json ([2439dae](https://github.com/antarctic-tech/aw-sdk/commit/2439daec4911d18ce15b4b794058aeeeb29e9343))

### [0.3.4](https://ssh.gitlab.awalltest.xyz/antarctic/frontend/aw-sdk/compare/v0.3.3...v0.3.4) (2026-09-10)

### [0.3.3](https://ssh.gitlab.awalltest.xyz/antarctic/frontend/aw-sdk/compare/v0.3.2...v0.3.3) (2026-09-10)


### Features

* **aw-2002:** BackButton API ([ae6f5a9](https://ssh.gitlab.awalltest.xyz/antarctic/frontend/aw-sdk/commit/ae6f5a9e593a89e8fae3ba7000a735fbad6fc70a))

### [0.3.2](https://ssh.gitlab.awalltest.xyz/antarctic/frontend/aw-sdk/compare/v0.3.1...v0.3.2) (2026-09-09)

### [0.3.1](https://gitlab.awalltest.xyz/antarctic/frontend/aw-sdk/compare/v0.3.0...v0.3.1) (2026-06-29)

### 0.2.2 (2026-04-18)


### Features

* **aw-778:** обновил sdk и новые версии ([0c7ef27](https://gitlab.awalltest.xyz/antarctic/frontend/aw-sdk/commit/0c7ef279efeb65804d38c4cf4d53cf7fbe50bde8))
* **aw-778:** перенес тесты в отдельную папку ([8f4b5ae](https://gitlab.awalltest.xyz/antarctic/frontend/aw-sdk/commit/8f4b5ae3547eeab88b3a39e7b4baa0e8dce1333f))
* **aw-778:** поднял версию пакета ([dc71831](https://gitlab.awalltest.xyz/antarctic/frontend/aw-sdk/commit/dc71831b94d389acf51ecfea4bee1afcbd94996b))
* **aw-778:** поправил ошибку ([f0211f8](https://gitlab.awalltest.xyz/antarctic/frontend/aw-sdk/commit/f0211f8097e7f6d2543ee4b8882be89f85197de3))
