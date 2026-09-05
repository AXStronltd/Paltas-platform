/** Tiny classnames joiner — avoids pulling in clsx for six characters of logic. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
