/** What became of one item once the acts ran: removed (where to), kept (why), or waiting (on what). */
export type ActedItem = { removed: string } | { kept: string } | { waiting: string }

/** Each acted item's outcome, by `<lot> <item> <name>`. */
export type LotPruneOutcomes = Map<string, ActedItem>

/** One act's outcomes, by outcome key, and the trashed worktrees whose removal it started. */
export type ActedItems = { acted: [string, ActedItem][]; started: string[] }
