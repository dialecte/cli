### Changed

- **Breaking:** in a package whose vitest config declares projects, `dialecte tdd red`, `tdd green` and the collect behind `tdd status`, the gate and the hook run each vitest test file in the projects the package's CI runs it in, read from its own `.github/workflows/_test.yml` and the npm scripts it reaches, no longer in every project of the config. `tdd red` and `tdd green` print `vitest projects: <names> (as <source> runs them)` first; a file no CI project holds still runs where its config holds it, said as `not in CI's projects: <file>`. A CI project name the config does not declare fails the run. When CI cannot be read whole, every project runs as before and `tdd red` and `tdd green` say why (`vitest projects: all (<reason>)`): a package whose CI also runs a script the reader does not follow (such as a `tsx` script) keeps every project and gains only the module-mock refusal below. A package without vitest projects runs as before.
- **Breaking:** a changed test file mocking a module (`vi.mock`, `vi.doMock`) in a project that shares modules between files (`isolate: false`) is refused: `tdd red` refuses the file before its run, `tdd green` refuses every case of it with the reason `module mock`. Test it without a module mock, or move it to a project that isolates files.

### Fixed

- A test file passing alone in `tdd` while CI fails it: a module mock in a project sharing modules between files is not applied when CI loaded the module first, and a file ran in projects CI does not run (or twice). tdd now runs the projects CI runs and refuses such a mock.
