declare const printedBrand: unique symbol

/**
 * A text the cli may print, every line escaped once (or JSON): only `textOf` and `jsonOf` return one, so a command that
 * builds its output another way does not type-check. A plain string at run time.
 * @intent tell a text the cli escaped from a raw one, print a lookup's answer as it is
 */
export type PrintedText = string & { readonly [printedBrand]: true }

/** Where a printed text goes. */
export type PrintStream = 'stdout' | 'stderr'

/** How a print ends: a line feed after the text, or the text as it is. */
export type PrintEnding = 'line' | 'as-is'
