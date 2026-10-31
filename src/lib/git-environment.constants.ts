/**
 * The variables that point git at a repository, chosen by us (not copied from git): a git command
 * the cli runs names its folder, and must not act on another repository because a hook or the user
 * set one of these. Git's config variables (GIT_CONFIG, GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT and
 * its keys) are left out on purpose: `-c` options and environment config such as safe.directory
 * still reach every git command.
 */
export const REPOSITORY_ENVIRONMENT_VARIABLES = [
	// which repository and work tree: set by git for a hook, or by the user
	'GIT_DIR',
	'GIT_WORK_TREE',
	'GIT_COMMON_DIR',
	'GIT_IMPLICIT_WORK_TREE',
	'GIT_PREFIX',
	// which index: a pre-commit hook gets the commit's own index
	'GIT_INDEX_FILE',
	// where the objects are read and written
	'GIT_OBJECT_DIRECTORY',
	'GIT_ALTERNATE_OBJECT_DIRECTORIES',
	// what the history looks like: shallow commits, grafts and replace refs
	'GIT_SHALLOW_FILE',
	'GIT_GRAFT_FILE',
	'GIT_NO_REPLACE_OBJECTS',
	'GIT_REPLACE_REF_BASE',
] as const
