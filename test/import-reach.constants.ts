/** A value import, an `export ... from` or a dynamic `import('...')`; type-only imports are erased and skipped. */
export const IMPORT_PATTERN =
	/(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;'"]*?from\s+'([^']+)'|(?:^|\n)\s*import\s+'([^']+)'|\bimport\(\s*'([^']+)'\s*\)/g

/** The specifiers of a child process module. */
export const CHILD_PROCESS_PATTERN = /^(node:)?child_process$/
