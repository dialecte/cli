/** How emitted files are formatted: `--format-config <path>`, `--no-format`. */
export type FormatOpts = { config?: string; skip?: boolean }

/** The files to format, relative to `root` (or absolute), and how to format them. */
export type FormatFilesParams = { root: string; files: string[]; options?: FormatOpts }
