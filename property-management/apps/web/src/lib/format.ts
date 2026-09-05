/** Presentation helpers. All money is stored in minor-unit-agnostic numbers
 *  and formatted at the edge, so switching reporting currency is one change. */

export type Currency = 'USD' | 'KES' | 'GBP' | 'AED' | 'EUR'

const SYMBOL: Record<Currency, string> = {
  USD: '$', KES: 'KSh', GBP: '£', AED: 'AED', EUR: '€',
}

export const money = (v: number, ccy: Currency = 'USD'): string =>
  `${SYMBOL[ccy]} ${Math.round(v).toLocaleString('en-US')}`

/** Compact money for KPI tiles: $ 4.28M, $ 486K. */
export const moneyShort = (v: number, ccy: Currency = 'USD'): string => {
  const s = SYMBOL[ccy]
  const a = Math.abs(v)
  if (a >= 1e9) return `${s} ${(v / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${s} ${(v / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${s} ${Math.round(v / 1e3)}K`
  return `${s} ${v.toLocaleString('en-US')}`
}

export const num = (v: number): string => v.toLocaleString('en-US')

export const pct = (v: number, dp = 1): string => `${v.toFixed(dp)}%`

/** Signed percentage for variance columns: +6.2%, -2.4%. */
export const delta = (v: number, dp = 1): string => `${v > 0 ? '+' : ''}${v.toFixed(dp)}%`

export const initials = (name: string): string =>
  name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

const AVATAR_COLORS = ['#00E5C8', '#3b82f6', '#a99bff', '#f0b429', '#22c98b', '#f2495c', '#2ea6ff', '#e0894a']

/** Stable colour per name, so the same person is always the same colour. */
export const avatarColor = (seed: string): string =>
  AVATAR_COLORS[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length]

export const days = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`

export const relativeDays = (n: number): string =>
  n < 0 ? `${Math.abs(n)} overdue` : n === 0 ? 'today' : `${n} left`
