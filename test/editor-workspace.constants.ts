/**
 * The script of a fake editor: it writes its arguments, one per line, to `{record}`, then marks the record
 * complete by writing `{done}`. Only shell builtins, so it runs with an empty `PATH`.
 */
export const FAKE_EDITOR_SCRIPT = `#!/bin/sh
printf '%s\\n' "$@" > {record}
printf done > {done}
`

/**
 * The script of a fake editor that stays running: it records like `FAKE_EDITOR_SCRIPT`, writes its process id to
 * `{pid}` before marking the record complete, then waits (a tenth of a second at a time, two minutes at most) for
 * `{release}` to exist.
 */
export const BLOCKING_EDITOR_SCRIPT = `#!/bin/sh
printf '%s\\n' "$@" > {record}
printf '%s' "$$" > {pid}
printf done > {done}
i=0
while [ ! -e {release} ] && [ $i -lt 1200 ]; do
	sleep 0.1
	i=$((i + 1))
done
`

/** The suffixes of the files a blocking fake editor writes its process id to, and waits for. */
export const PID_SUFFIX = '.pid'
export const RELEASE_SUFFIX = '.release'

/** The suffix of the file that marks a fake editor's record complete. */
export const RECORD_DONE_SUFFIX = '.done'

/** The suffix of the file a fake editor records its arguments in. */
export const RECORD_SUFFIX = '.argv'

/** How often a case looks for the record of a fake editor it waits for, in milliseconds. */
export const RECORD_POLL_INTERVAL_MS = 25

/** The mode of an executable file, and of a file that is not. */
export const EXECUTABLE_MODE = 0o755
export const NOT_EXECUTABLE_MODE = 0o644

/** The path of the hand-over's review diff, relative to the hand-over folder. */
export const REVIEW_DIFF_SEGMENTS = ['review', 'lot.diff'] as const

/** A command word that is on no list: an editor the cli never searches for. */
export const UNLISTED_EDITOR_WORD = 'unlisted-editor'
