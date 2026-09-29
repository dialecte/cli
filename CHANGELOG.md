# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.3] - 2026-09-29

### Fixed

- `bench` measures only your own types: library declaration files are skipped, so a library's typing or a library error no longer moves the numbers. Regenerate your baseline once with this version.
