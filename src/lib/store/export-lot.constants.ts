/** The temporary folder an export copies into, in `<dir>`: `.{name}.tmp-{pid}`. */
export const EXPORT_TEMPORARY_NAME = '.{name}.tmp-{pid}'

/** What marks another run's temporary folder of the same lot: `.{name}.tmp-`. */
export const EXPORT_TEMPORARY_PREFIX = '.{name}.tmp-'

/** The permission bits of a mode. */
export const PERMISSION_BITS = 0o7777

/** How many copies a file gets before the export fails: the first and one retry. */
export const COPY_ATTEMPTS = 2

/** Why the export failed on a file: `{path}`. */
export const COPY_DIFFERS = '{path} differs from its source after two copies: nothing exported'
