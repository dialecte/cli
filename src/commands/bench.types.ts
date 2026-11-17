export type Metrics = Record<string, number>

/** The compiler a bench ran with: `tsgo` for TypeScript 7 and later (the native one), `tsc` below. */
export type Compiler = { name: 'tsgo' | 'tsc'; version: string }

/** One compiler run over the given arguments, its `--extendedDiagnostics` metrics parsed. */
export type RunCompiler = (args: string[]) => Metrics

/** Whether a baseline's counts can be compared with this run's: the same compiler at the same version. */
export type CompilerComparison = { kind: 'comparable' } | { kind: 'refused'; line: string }
