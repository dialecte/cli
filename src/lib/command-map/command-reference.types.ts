import type { CommandEntry, RenamedWords } from './command-map.types.ts'

/** A listed command as the reference pages render it. */
export type ReferenceCommand = { name: string; entry: CommandEntry }

/** What the reference pages are rendered from: the listed commands in help order and the renamed forms. */
export type ReferenceSource = { commands: ReferenceCommand[]; renamed: RenamedWords[] }

/** One page of the reference: its path from the package root, its title line and its generated block. */
export type ReferencePage = { path: string; title: string; block: string }

/** Why a page of the reference does not match the command map. */
export type ReferenceFaultKind = 'stale' | 'missing' | 'extra'

/** One page that does not match the command map. */
export type ReferenceFault = { path: string; kind: ReferenceFaultKind }

/** The reference pages checked against the command map: how many it declares, and the faults. */
export type ReferenceCheck = { pages: number; faults: ReferenceFault[] }
