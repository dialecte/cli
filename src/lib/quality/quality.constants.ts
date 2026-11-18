/** A body with fewer tokens cannot tell two functions apart: such a function is never matched by its body alone. */
export const MOVED_BODY_MIN_TOKENS = 20

/** How many attributes of one element two functions share before one reads like the other (a named set counts as this many). */
export const DUPLICATE_READ_MIN_ATTRIBUTES = 3

/** How a named set shows among the shared attributes: `@<name>`. */
export const NAMED_SET_KEY = '@{name}'

/** How many existing functions `api find` lists for an added one before its words are compared. */
export const DUPLICATE_FIND_LIMIT = 5

/** How many distinct words of an added function's name and summary an existing one must hold to read as the same need. */
export const DUPLICATE_FIND_MIN_WORDS = 2

/** The package an index of the existing source functions is named for in `api find`. */
export const EXISTING_SOURCE_PACKAGE = 'existing source'

/** A file of declared types: a change of one of its types is a change of the signatures naming it. */
export const TYPES_FILE_PATTERN = /\.types\.ts$/

/** The profile whose packages keep their doc pages in step with their public API. */
export const CONTRIBUTOR_PROFILE = 'contributor'

/** What separates the segments of a public route (`doc.query.info.of`). */
export const ROUTE_SEPARATOR = '.'

/** How many last segments of a route a page names it by: one alone (`of`) names too much. */
export const ROUTE_NAMING_SEGMENTS = 2
