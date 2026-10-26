/**
 * JSDoc text as markdown, from the compiler's display parts: `ts.displayPartsToString` glues a link's
 * name to its label (`{@link getTree | the tree}` → `{@link getTreethe tree}`), so links are rendered
 * from the parts. A labelled link becomes its label; a bare `{@link X}` or `{@linkcode X}` becomes `` `X` ``.
 */
import type ts from 'typescript'

export function renderJsDocText(parts: readonly ts.SymbolDisplayPart[] | undefined): string {
	let text = ''
	let link: { name: string | undefined; label: string } | undefined
	for (const part of parts ?? []) {
		if (part.kind === 'link' && part.text.startsWith('{@link'))
			link = { name: undefined, label: '' }
		else if (link && part.kind === 'linkName') link.name = part.text
		else if (link && part.kind === 'linkText') link.label += part.text
		else if (link && part.kind === 'link') {
			text += renderLink(link)
			link = undefined
		} else text += part.text
	}
	return text
}

/** A target the compiler could not resolve arrives as one text, `target label`: split it. */
function renderLink(link: { name: string | undefined; label: string }): string {
	if (link.name !== undefined) return link.label.trim() || `\`${link.name}\``
	const [target = '', ...label] = link.label.trim().split(/\s+/)
	return label.join(' ') || `\`${target}\``
}
