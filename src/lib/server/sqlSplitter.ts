/**
 * Splits an editor buffer into executable statements on `;`, ignoring
 * semicolons inside 'strings', "strings", `identifiers`, -- and # line
 * comments, and block comments. Not a SQL parser — just delimiter-aware
 * enough for an IDE's "run" button.
 */
export function splitStatements(sql: string): string[] {
	const statements: string[] = [];
	let start = 0;
	let i = 0;

	const push = (end: number) => {
		const text = sql.slice(start, end).trim();
		if (text) statements.push(text);
	};

	while (i < sql.length) {
		const ch = sql[i];
		const next = sql[i + 1];

		if (ch === "'" || ch === '"' || ch === '`') {
			const quote = ch;
			i++;
			while (i < sql.length) {
				if (sql[i] === '\\' && quote !== '`') i += 2;
				else if (sql[i] === quote) {
					// doubled quote is an escaped quote, not a terminator
					if (sql[i + 1] === quote) i += 2;
					else break;
				} else i++;
			}
			i++;
		} else if ((ch === '-' && next === '-') || ch === '#') {
			while (i < sql.length && sql[i] !== '\n') i++;
		} else if (ch === '/' && next === '*') {
			i += 2;
			while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
			i += 2;
		} else if (ch === ';') {
			push(i);
			i++;
			start = i;
		} else {
			i++;
		}
	}
	push(sql.length);
	return statements;
}
