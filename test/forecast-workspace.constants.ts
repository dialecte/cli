/** The files of the scratch repository's first commit: one shared file per case, written whole. */
export const FORECAST_FILES: Readonly<Record<string, string>> = {
	'src/shared.ts': 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n',
	'src/other.ts': 'alpha\nbeta\ngamma\n',
	'.gitignore': 'ignored.log\n',
}

/** The shared file as each side rewrites it, whole: line 1, line 10 or line 2 changed. */
export const SHARED_LINE1_A = 'one-a\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n'
export const SHARED_LINE10_B = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten-b\n'
export const SHARED_LINE2_A = 'one\ntwo-a\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n'
export const SHARED_LINE2_B = 'one\ntwo-b\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n'
export const SHARED_LINE2_MAIN = 'one\ntwo-main\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n'

/** The other file as the second lot rewrites it, whole. */
export const OTHER_B = 'alpha\nbeta-b\ngamma\n'

/** A lock file as each lot adds it, whole: an exclusive path (decision Q2). */
export const LOCK_A = '{\n  "lockfileVersion": 3,\n  "name": "a"\n}\n'
export const LOCK_B = '{\n  "lockfileVersion": 3,\n  "name": "b"\n}\n'

/** The identity and dates (author, email, author and committer epoch) every snapshot commit carries. */
export const SNAPSHOT_IDENTITY = 'dialecte forecast forecast@dialecte.invalid 0 0'

/** The clock of the starts and the forecasts of the tests. */
export const FORECAST_NOW = new Date('2026-11-17T12:00:00.000Z')

/** The scope every test lot declares: the same folder, so their scopes meet. */
export const FORECAST_SCOPE: readonly string[] = ['src/']

/** What the git stub of the old-version cases answers to `--version` and `version`. */
export const OLD_GIT_STUB = `case " $* " in *" --version "*|*" version "*) echo "git version 2.37.0"; exit 0;; esac`

/** A git version a stub reports: one without merge-tree --write-tree. */
export const OLD_GIT_VERSION = 'git version 2.37.0'

/** The step limit of the over-time case, in milliseconds, and how long its stub sleeps, in seconds. */
export const SHORT_STEP_LIMIT_MS = 4_000
export const STUB_SLEEP_SECONDS = 30
