/** `rules --base` with files: the flag judges the files the change made since the base, never files given with it. */
export const RULES_BASE_WITH_FILES =
	'rules --base <ref> judges the files changed since the merge-base of <ref> and HEAD: give it no files (exit 2)'

/** The option naming the base `rules` judges the change against: `--base <ref>`. */
export const BASE_OPTION = 'base'
