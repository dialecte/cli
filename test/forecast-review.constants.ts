/** The shared file as main rewrites it, whole: its first line changed. */
export const SHARED_LINE1_MAIN = 'one-main\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n'

/** The shared file as the second lot rewrites it, whole: its first five lines changed. */
export const SHARED_LINES1TO5_B =
	'one-b\ntwo-b\nthree-b\nfour-b\nfive-b\nsix\nseven\neight\nnine\nten\n'

/** The shared file as the first lot rewrites it, whole: its fifth line changed. */
export const SHARED_LINE5_A = 'one\ntwo\nthree\nfour\nfive-a\nsix\nseven\neight\nnine\nten\n'

/** What the git stub of the version-over-time case does on `--version`: sleeps past the step limit. */
export const SLOW_VERSION_STUB = `case " $* " in *" --version "*) exec sleep 30;; esac`

/** The step limit of the version-over-time case, in milliseconds. */
export const VERSION_STEP_LIMIT_MS = 2_000

/** The default step limit the forecast must keep (decision Q7: 20 s). */
export const DECIDED_STEP_LIMIT_MS = 20_000
