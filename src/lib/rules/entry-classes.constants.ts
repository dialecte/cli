/** Every name a module exports, as asked of it by an entry or an `export *` / `export * as`. */
export const ALL_EXPORTS = '*'

/** Every name but the default one, as `export *` asks it: `export *` never re-exports a default. */
export const STAR_EXPORTS = '*-default'

/** The name a module's default export is asked by. */
export const DEFAULT_EXPORT = 'default'
