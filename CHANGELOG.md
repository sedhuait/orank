# Changelog

## [0.2.1](https://github.com/sedhuait/orank/compare/orank-v0.2.0...orank-v0.2.1) (2026-04-16)


### Features

* add 6 new curated badges, integrate dynamic badge system ([bd6fd8b](https://github.com/sedhuait/orank/commit/bd6fd8b35bd24c8010c76bff62504dae19638172))
* add dynamic-badges.js for auto-discovered badge tracks ([83e2369](https://github.com/sedhuait/orank/commit/83e2369066803e91b1d8e29270176169014fe626))
* add metrics.js for efficiency scoring and trends ([46b3614](https://github.com/sedhuait/orank/commit/46b3614dcb6dbb6210efaad280e19118098b4d82))
* add patterns.js for workflow pattern detection ([cd8c3e9](https://github.com/sedhuait/orank/commit/cd8c3e916de31dc53f036f3dcca3c15333369fd7))
* enhanced dashboard with efficiency, trends, insights command ([c54bd85](https://github.com/sedhuait/orank/commit/c54bd858a6ea864129e8ef51e1b79ffd21ccda64))
* expand hooks.json from 5 to 10 hook events ([07b9ebf](https://github.com/sedhuait/orank/commit/07b9ebfe34a989655e918eb1132ee6ea83fca780))
* initial orank plugin implementation ([4b8bbb0](https://github.com/sedhuait/orank/commit/4b8bbb064d666b4b674675f876bb01802f02ba31))
* rewrite tracker.js to read stdin JSON, handle 10 hook events ([3802ab3](https://github.com/sedhuait/orank/commit/3802ab304de5cec10faa707ab3a5bbb1d6a0be69))
* rich telemetry capture (langs, frameworks, repos, edit size) ([c9e146a](https://github.com/sedhuait/orank/commit/c9e146a6db9071705bf4875693d20daafe1301c9))
* update history-import.js for new event schema ([3db27e7](https://github.com/sedhuait/orank/commit/3db27e71f412eea733218c9438333d5ee6e114d4))
* update storage.js for new event schema and cache fields ([70b8cfb](https://github.com/sedhuait/orank/commit/70b8cfbf650fe70a36b85ef586a6422e843d2e1e))


### Bug Fixes

* **docs:** correct plugin install instructions ([5a3f277](https://github.com/sedhuait/orank/commit/5a3f2770384ae53b099f6d954f4ee06be65ccad7))
* **plugin:** drop hooks/skills manifest fields, fix README marketplace ID ([86d221c](https://github.com/sedhuait/orank/commit/86d221c52826e5012cf30b385958aeb4d98ac4fb))
* **plugin:** point hooks manifest field to hooks.json file, not directory ([703d18d](https://github.com/sedhuait/orank/commit/703d18da962a36944bcf99f36b00c935a64dea78))
* **plugin:** restore skills manifest field — skills do not auto-discover ([b3226a1](https://github.com/sedhuait/orank/commit/b3226a121b037cec059335741920b9b383802319))


### Refactors

* convert all test files to ESM ([f1bcc8d](https://github.com/sedhuait/orank/commit/f1bcc8d96aac2a4b25dfc6082c5c8fa096ce276c))
* convert badges.js and integrity.js to ESM ([ba30cf1](https://github.com/sedhuait/orank/commit/ba30cf1b3a987f0a36a2cbb15a57d11a7ec1720a))
* convert cli.js to ESM ([1f9ac20](https://github.com/sedhuait/orank/commit/1f9ac2001beab40672ddc84fcf502b6aa82b95f2))
* convert history-import.js and tracker.js to ESM ([d211c6b](https://github.com/sedhuait/orank/commit/d211c6b1181d333f523fd7f53de3a9828e2395bc))
* convert patterns, dynamic-badges, metrics to ESM ([cf92245](https://github.com/sedhuait/orank/commit/cf9224559c76fa2a2e3946f0f7fbcb917548729b))
* convert storage.js to ESM with dataDir constructor param ([ecbcef2](https://github.com/sedhuait/orank/commit/ecbcef2568991927e45fd795515433d9745068f0))
* convert vitest config and test helpers to ESM ([b8e8685](https://github.com/sedhuait/orank/commit/b8e8685b9ef318b916192077cb51a573242b2ab0))
* update integrity.js field names for new event schema ([d8360c6](https://github.com/sedhuait/orank/commit/d8360c644362a0789c4584666397eb097faf3cd7))


### Documentation

* add deep metrics & dynamic badges design spec ([3c0765b](https://github.com/sedhuait/orank/commit/3c0765b1d534a6cfc1b39a6f64a0f77c0b760c55))
* add deep metrics implementation plan (12 tasks) ([cee1de3](https://github.com/sedhuait/orank/commit/cee1de3ea830a1a30c80c8fee2cd599e4630fcf7))
* add insights command to SKILL.md ([7affb9a](https://github.com/sedhuait/orank/commit/7affb9a36c72a0a7427841d4456be9b919869fe1))
* add multi-tool support to roadmap (Codex, Gemini, Cursor, etc.) ([449342f](https://github.com/sedhuait/orank/commit/449342fa23ee800f59290cf66473f9f08b5b108c))
* rename tagline to "AI score" and document rich telemetry ([00acd59](https://github.com/sedhuait/orank/commit/00acd59f4dc52ed5e83369673e4edcc190a7db39))
