/** Callable groups that belong to core's own surface, not to a dialecte's extensions. */
export const CORE_GROUPS: readonly string[] = ['any', 'perf', 'progress']

/** start marker (with its kind) · content · end marker; both markers may share one line (empty block) */
export const GENERATED_BLOCK_PATTERN =
	/(<!-- dialecte-skills:generated ([\w-]+) -->)\n?[\s\S]*?\n?(<!-- \/dialecte-skills:generated -->)/g

/** Any marker: group 1 is the kind for a start marker, undefined for an end marker. */
export const GENERATED_MARKER_PATTERN =
	/<!-- (?:dialecte-skills:generated ([\w-]+)|\/dialecte-skills:generated) -->/g

/** `__x__`: strong emphasis written with underscores. */
export const STRONG_UNDERSCORE_PATTERN = /__(?=\S)(.+?)(?<=\S)__/g

/** `_x_` not inside a word (`snake_case` stays): emphasis written with underscores. */
export const EMPHASIS_UNDERSCORE_PATTERN = /(^|[^\w_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w_])/g
