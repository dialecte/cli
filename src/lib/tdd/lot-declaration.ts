/**
 * `.dialecte/lot.json`: what the orchestrator declares about the lot in the package root. Never committed
 * (the hand-over and the hygiene leave it out). It holds whether the lot is exempt from the test receipts
 * (`{ "tdd": "exempt: <reason>" }` for a wording, rename or doc-only lot) and the cases it accepts without a
 * red (`"accept": [{ "case": "<file>::<name>", "reason": "..." }]`: a new test of behaviour that already
 * exists, an honest cut of an assertion).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { LOT_FILE } from '../worktree/worktree.constants.ts'
import { ACCEPT_ENTRY_KEYS, ACCEPT_SHAPE, LOT_KEYS, TDD_EXEMPT_PATTERN } from './tdd.constants.ts'

import type { CaseAcceptance, LotDeclaration, TddExemption } from './tdd.types.ts'

/** The exemption the lot declares, none, or why the declaration cannot be read. */
export function readTddExemption(root: string): TddExemption {
	const declaration = readLotDeclaration(root)
	if ('failure' in declaration) return { kind: 'invalid', reason: declaration.failure }
	if (declaration.tdd === undefined) return { kind: 'none' }
	const exempt = TDD_EXEMPT_PATTERN.exec(String(declaration.tdd))
	return exempt && exempt[1].trim()
		? { kind: 'exempt', reason: exempt[1].trim() }
		: {
				kind: 'invalid',
				reason: `${LOT_FILE}: "tdd" must be "exempt: <reason>", not ${JSON.stringify(declaration.tdd)}`,
			}
}

/** The cases the lot accepts without a red, or why the declaration cannot be read. */
export function readAcceptances(root: string): CaseAcceptance[] | { failure: string } {
	const declaration = readLotDeclaration(root)
	if ('failure' in declaration) return declaration
	const { accept } = declaration
	if (accept === undefined) return []
	if (!Array.isArray(accept)) return { failure: `${LOT_FILE}: ${ACCEPT_SHAPE}` }
	for (const entry of accept) {
		const unknown =
			typeof entry === 'object' && entry !== null
				? Object.keys(entry).find((key) => !ACCEPT_ENTRY_KEYS.includes(key))
				: undefined
		if (unknown)
			return {
				failure: `${LOT_FILE}: unknown key "${unknown}" in an "accept" entry (known: ${ACCEPT_ENTRY_KEYS.join(', ')})`,
			}
		if (!isAcceptance(entry)) return { failure: `${LOT_FILE}: ${ACCEPT_SHAPE}` }
	}
	return accept as CaseAcceptance[]
}

function readLotDeclaration(root: string): LotDeclaration | { failure: string } {
	const path = join(root, LOT_FILE)
	if (!existsSync(path)) return {}
	let declaration: LotDeclaration
	try {
		declaration = JSON.parse(readFileSync(path, 'utf8')) as LotDeclaration
	} catch (error) {
		return { failure: `${LOT_FILE}: not JSON (${(error as Error).message})` }
	}
	if (typeof declaration !== 'object' || declaration === null || Array.isArray(declaration))
		return { failure: `${LOT_FILE}: an object is expected` }
	const unknown = Object.keys(declaration).find((key) => !LOT_KEYS.includes(key))
	if (unknown)
		return { failure: `${LOT_FILE}: unknown key "${unknown}" (known: ${LOT_KEYS.join(', ')})` }
	return declaration
}

function isAcceptance(entry: unknown): entry is CaseAcceptance {
	if (typeof entry !== 'object' || entry === null) return false
	const { case: name, reason } = entry as Record<string, unknown>
	return typeof name === 'string' && typeof reason === 'string' && reason.trim() !== ''
}
