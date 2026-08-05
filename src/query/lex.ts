/**
 * Line splitting and boolean-combination tokenizing.
 *
 * Grammar (see §6.2/§6.2 boolean combination):
 *   One instruction per line; blank lines ignored; `#` starts a comment line.
 *   A boolean-combination line is built from parenthesized operands joined by
 *   AND / OR / XOR, or prefixed with NOT. Every operand must be explicitly
 *   parenthesized — bare, unparenthesized mixed expressions are not supported.
 */

export interface SourceLine {
	lineNumber: number;
	text: string;
}

/** Splits query source into non-blank, non-comment lines, preserving original 1-based line numbers. */
export function splitLines(source: string): SourceLine[] {
	const rawLines = source.split('\n');
	const result: SourceLine[] = [];
	for (let i = 0; i < rawLines.length; i++) {
		const text = (rawLines[i] ?? '').trim();
		if (text === '' || text.startsWith('#')) continue;
		result.push({ lineNumber: i + 1, text });
	}
	return result;
}

export type BoolToken =
	| { type: 'AND' | 'OR' | 'XOR' | 'NOT' }
	| { type: 'GROUP'; text: string };

const KEYWORD_RE = /^(AND|OR|XOR|NOT)\b/;

/**
 * Tokenizes a boolean-combination line into a flat top-level stream: AND / OR / XOR / NOT
 * keywords, and GROUP tokens holding the raw (unparsed) text between a matched pair of
 * top-level parentheses. Returns null if the line does not open with `(` or `NOT (` — i.e. it
 * is not a boolean-combination line at all, and should be parsed as a single plain instruction.
 */
export function tokenizeBooleanLine(line: string): BoolToken[] | null {
	const trimmed = line.trim();
	if (!(trimmed.startsWith('(') || /^NOT\s*\(/.test(trimmed))) return null;

	const tokens: BoolToken[] = [];
	let i = 0;
	const n = trimmed.length;
	while (i < n) {
		while (i < n && /\s/.test(trimmed[i]!)) i++;
		if (i >= n) break;
		if (trimmed[i] === '(') {
			let depth = 0;
			let j = i;
			let matched = false;
			for (; j < n; j++) {
				if (trimmed[j] === '(') depth++;
				else if (trimmed[j] === ')') {
					depth--;
					if (depth === 0) {
						matched = true;
						break;
					}
				}
			}
			if (!matched) {
				throw new Error(`Unmatched '(' at position ${i}`);
			}
			tokens.push({ type: 'GROUP', text: trimmed.slice(i + 1, j) });
			i = j + 1;
			continue;
		}
		const rest = trimmed.slice(i);
		const kw = KEYWORD_RE.exec(rest);
		if (kw) {
			tokens.push({ type: kw[1] as 'AND' | 'OR' | 'XOR' | 'NOT' });
			i += kw[0].length;
			continue;
		}
		throw new Error(`Unexpected text '${rest.slice(0, 20)}' — operands must be parenthesized`);
	}
	return tokens;
}
