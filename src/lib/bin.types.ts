/** A tool binary found: its path and whether the consumer's install or the cli's own copy holds it. */
export type ResolvedBin = { path: string; source: 'consumer' | 'own' }
