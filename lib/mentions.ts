/**
 * The `@mention` rules for the comment composer, kept out of the React component so
 * the token matching and the option list can be reasoned about (and checked) on their
 * own. No `server-only` and no React imports here.
 */

import type { ContactRow } from '@/lib/data/types';

/** One taggable option: a contact of the customer, or a colleague. */
export type MentionOption = {
  /** The encoded value the Server Action reads (`contact:<uuid>` / `user:<uuid>`). */
  value: string;
  name: string;
  kind: 'contact' | 'user';
  /** Email or phone, shown next to the name in the picker. */
  detail: string | null;
};

/** A contact's display name, with a fallback for the rows that have no first name. */
export function contactName(contact: ContactRow): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || 'Unnamed contact';
}

/**
 * The `@mention` the caret currently sits in, or `null` when there is none.
 *
 * Only a token that starts at the beginning of the text or after whitespace counts, so
 * `me@work.com` stays plain text, and the query is everything typed since the `@`
 * (spaces end it, which is why inserting a mention appends one). The caret is clamped
 * into the text, so a stale or out-of-range position can never produce a bad offset.
 */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const position = Math.min(Math.max(caret, 0), text.length);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, position));
  if (!match) return null;
  return { start: position - match[1].length - 1, query: match[1] };
}

/** Builds the tag list: colleagues first, then the customer's contacts. */
export function buildMentionOptions(
  contacts: ContactRow[],
  people: { id: string; name: string }[]
): MentionOption[] {
  return [
    ...people.map((person) => ({
      value: `user:${person.id}`,
      name: person.name,
      kind: 'user' as const,
      detail: null,
    })),
    ...contacts.map((contact) => ({
      value: `contact:${contact.id}`,
      name: contactName(contact),
      kind: 'contact' as const,
      detail: contact.email ?? contact.phone,
    })),
  ];
}

/** Escapes the parts of a name that a regular expression would otherwise read. */
export function escapeForMentionPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
