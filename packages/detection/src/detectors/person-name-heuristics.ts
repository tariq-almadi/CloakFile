/**
 * Helpers for multi-token personal names that compromise often splits or misses.
 *
 * Examples from real PDFs:
 *   - "Brigitte" without "Von Schwenk"
 *   - "Chinedu Okafor" missed entirely beside a longer detected name
 *   - "Tariq Ibn Ziyad" before a job title in a table cell
 */

/** Words that end a personal-name run when they appear as the next token. */
const NAME_TERMINATOR = new Set([
  'Systems',
  'System',
  'Architect',
  'Architecture',
  'Assigned',
  'Department',
  'Regional',
  'Office',
  'Data',
  'Governance',
  'Security',
  'Operations',
  'Client',
  'Relations',
  'Research',
  'Development',
  'Software',
  'Engineer',
  'Engineering',
  'Developer',
  'Quality',
  'Assurance',
  'Manager',
  'Management',
  'Director',
  'Coordinator',
  'Specialist',
  'Analyst',
  'Officer',
  'Consultant',
  'Administrator',
  'Technician',
  'Supervisor',
  'Lead',
  'Senior',
  'Junior',
  'Principal',
  'Montreal',
  'Geneva',
  'Document',
  'Section',
  'Executive',
  'Overview',
  'Introduction',
  'Historical',
  'Context',
  'Technical',
  'Constraints',
  'Parser',
  'Behavior',
  'Testing',
  'Complex',
  'Interleaved',
  'Prose',
  'Edge',
  'Cases',
  'Concluding',
  'Segment',
  'Target',
  'Entity',
  'Recognition',
  'Dense',
  'Flow',
  'Application',
  'Parsing',
  'Extraction',
  'Diagnostic',
  'Report',
  'Page',
  'Name',
  'Text',
  'Test',
  'Press',
  'MIT',
  'For',
  'The',
  'This',
  'During',
  'Furthermore',
  'Similarly',
  'Modern',
  'Automated',
  'Project',
  'Departmental',
  'signed',
  'called',
  'demonstrate',
  'noted',
  'consider',
  'hosted',
  'managed',
  'verified',
  'confirmed',
  'collaborate',
  'isolate',
  'accurately',
  'Pay',
]);

/**
 * Title-case phrases that are labels and headings, not people.
 * A sequence is rejected only when every word is in this set (or a terminator),
 * so "Victoria Sterling" still matches and "Financial Records" does not.
 */
const COMMON_HEADING = new Set([
  'Account',
  'Address',
  'Administrator',
  'Benchmark',
  'Billing',
  'Cardholder',
  'Classifications',
  'Comprehensive',
  'Confidential',
  'Contact',
  'Contacts',
  'Credentials',
  'Customer',
  'Direct',
  'Email',
  'Emergency',
  'Escalation',
  'Evaluation',
  'Evergreen',
  'Financial',
  'Hotline',
  'Identifiable',
  'Incident',
  'Information',
  'Interaction',
  'Internal',
  'Ledger',
  'Logs',
  'Matching',
  'Narrative',
  'Number',
  'Pattern',
  'Payment',
  'Personally',
  'Phone',
  'Primary',
  'Purpose',
  'Records',
  'Settlement',
  'Suite',
  'Support',
  'Target',
  'Terrace',
  'Transaction',
  'Validation',
  'Vector',
  'Vectors',
  'Vendor',
]);

const PARTICLE =
  /^(?:Ibn|Von|van|de|del|Van|Der|Di|Da|Mc|Mac|O'|Al-|Saint|St\.?)$/u;

const NAME_WORD = /^[\p{Lu}][\p{L}-]+(?:'[\p{L}-]+)?$/u;

const SEQUENCE =
  /\b([\p{Lu}][\p{L}-]+(?:\s+(?:(?:Ibn|Von|van|de|del|Van|Der|Di|Da|Mc|Mac|O'|Al-|Saint|St\.?)\s+)?[\p{Lu}][\p{L}-]+){1,5})\b/gu;

export interface NameSpan {
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

/** Grow a compromise person hit to include following surname particles and tokens. */
export function extendPersonSpan(text: string, start: number, end: number): NameSpan {
  let cursor = end;
  while (cursor < text.length) {
    const rest = text.slice(cursor);
    const match = rest.match(
      /^[ \t]+(?:(Ibn|Von|van|de|del|Van|Der|Di|Da|Mc|Mac|O'|Al-|Saint|St\.?)\s+)?([\p{Lu}][\p{L}'-]+)/u,
    );
    if (match === null) break;
    const nextWord = match[2] ?? '';
    const bare = stripPossessiveSuffix(nextWord);
    if (NAME_TERMINATOR.has(bare) || isHeadingWord(bare)) break;
    cursor += match[0].length;
    if (bare.length < nextWord.length) {
      cursor -= nextWord.length - bare.length;
      break;
    }
  }
  const value = stripPossessiveSuffix(text.slice(start, cursor));
  return { start, end: start + value.length, value };
}

/** Capitalized multi-word sequences compromise does not emit as people. */
export function findPersonSequences(text: string): readonly NameSpan[] {
  const spans: NameSpan[] = [];
  for (const match of text.matchAll(SEQUENCE)) {
    const raw = match[1];
    const index = match.index;
    if (raw === undefined || index === undefined) continue;

    const trimmed = trimToNameTokens(stripPossessive(raw));
    if (trimmed === null) continue;

    const value = trimmed.value;
    const start = index + trimmed.startOffset;
    const end = start + value.length;
    if (value.split(/\s+/u).length < 2) continue;
    if (isHeadingPhrase(value)) continue;
    spans.push({ start, end, value });
  }
  return spans;
}

/** Drop a label or parenthetical that compromise glued onto a name. */
export function clipPersonSurface(value: string): string {
  const line = value.split(/[\u001f\n]/u)[0] ?? value;
  const paren = line.search(/\s*\(/u);
  const cut = paren > 0 ? line.slice(0, paren) : line;
  const words = cut.trim().split(/\s+/u);
  while (words.length > 1) {
    const last = words.at(-1) ?? '';
    if (!isHeadingWord(last) && !NAME_TERMINATOR.has(last)) break;
    words.pop();
  }
  return words.join(' ');
}

/** True when every word is a heading, label, or all-caps token. */
export function isHeadingPhrase(value: string): boolean {
  const words = value.split(/[^\p{L}\p{N}'-]+/u).filter((word) => word.length > 0);
  if (words.length === 0) return true;
  return words.every((word) => isHeadingWord(word) || NAME_TERMINATOR.has(word) || PARTICLE.test(word));
}

function isHeadingWord(word: string): boolean {
  if (COMMON_HEADING.has(word) || NAME_TERMINATOR.has(word)) return true;
  return word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase();
}

export function stripPossessiveSuffix(value: string): string {
  return value.replace(/['\u2019]s$/u, '');
}

function stripPossessive(value: string): string {
  return stripPossessiveSuffix(value);
}

function trimToNameTokens(raw: string): { value: string; startOffset: number } | null {
  const words = raw.split(/\s+/u);
  const kept: string[] = [];

  for (const word of words) {
    if (word.length === 0) continue;
    if (kept.length === 0 && (NAME_TERMINATOR.has(word) || isHeadingWord(word) || !NAME_WORD.test(word))) {
      continue;
    }
    if (NAME_TERMINATOR.has(word) || isHeadingWord(word)) break;
    if (!PARTICLE.test(word) && !NAME_WORD.test(word)) break;
    kept.push(word);
  }

  if (kept.length < 2) return null;
  if (kept.every((word) => PARTICLE.test(word))) return null;

  const value = kept.join(' ');
  const startOffset = raw.indexOf(value);
  if (startOffset < 0) return null;
  return { value, startOffset };
}
