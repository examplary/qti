# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `addNamespacedAttribute()` / `getNamespacedAttributes()` for extension data on items and tests,
  written as `prefix:name` attributes on the root element. Unlike namespaced elements, these keep
  QTI 3.0 documents schema-valid. QTI 2.1 has no extension point for them, so they are left out
  of 2.1 documents.

### Fixed

- QTI 3.0 items and tests write `tool-name`, `tool-version` and `keep-together` in kebab-case, as
  the schema requires (QTI 2.1 keeps `toolName`, `toolVersion` and `keepTogether`). Parsing still
  accepts the camelCase names of packages generated before.

- Initial extraction of `@examplary/qti` into its own open-source repository.

## [1.5.0] - 2026-01-27

### Added

- Generation of QTI 3.0 and 2.1 assessment packages (items, tests, IMS manifest, ZIP output).
- Parsing of QTI 3.0 and 2.1 packages with auto-detection of version.
