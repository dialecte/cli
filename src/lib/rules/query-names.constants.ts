/** The file in the git folder that caches the query read names of a run. */
export const QUERY_NAMES_CACHE_FILE = 'dialecte-query-names.json'

/** The file named when the dependencies' skills cannot be listed. */
export const QUERY_NAMES_MANIFEST = 'package.json'

/** The line a run prints when an API index cannot be read: `{file}` the index, `{why}` what is wrong with it. */
export const QUERY_IN_LOOP_NOT_RUN_LINE =
	'query-in-loop: not run, {file}: {why} (dialecte skills generate, or reinstall)'
