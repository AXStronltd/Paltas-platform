import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/Icon'
import type { Tone } from '@/types'

/* ------------------------------------------------------------------ Badge */

const BADGE_TONE: Record<Tone, string> = {
  ok:      'bg-ok/15 text-[#2ee0a0]',
  danger:  'bg-danger/15 text-[#ff7a8a]',
  warn:    'bg-warn/[0.16] text-[#f5c249]',
  teal:    'bg-teal/[0.14] text-teal',
  info:    'bg-info/[0.16] text-[#7cb0ff]',
  violet:  'bg-violet/[0.16] text-[#bcb0ff]',
  neutral: 'bg-white/[0.07] text-muted',
}

export function Badge({
  children, tone = 'neutral', dot = false, className,
}: { children: ReactNode; tone?: Tone; dot?: boolean; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11px] font-extrabold',
      BADGE_TONE[tone], className,
    )}>
      {dot && <span className="h-1.5 w-1.5 flex-none rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* ----------------------------------------------------------------- Button */

type ButtonVariant = 'ghost' | 'primary' | 'ok' | 'danger'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  ghost:   'border-stroke-2 bg-white/[0.04] text-ink hover:bg-white/[0.09]',
  primary: 'border-transparent bg-brand text-navy hover:brightness-110',
  ok:      'border-ok/40 bg-ok/15 text-[#2ee0a0] hover:bg-ok/25',
  danger:  'border-danger/35 bg-danger/[0.12] text-[#ff7a8a] hover:bg-danger/[0.22]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  icon?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', size = 'md', icon, className, children, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] border font-bold transition',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'px-[11px] py-1.5 text-[11.5px]' : 'px-3.5 py-2 text-[12.5px]',
        BUTTON_VARIANT[variant], className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
      {children}
    </button>
  )
})

/* ------------------------------------------------------------------- Chip */

export function Chip({
  children, active = false, onClick,
}: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition',
        active
          ? 'border-teal bg-teal text-navy'
          : 'border-stroke-2 bg-white/[0.03] text-ink-2 hover:bg-white/[0.08] hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------- Hint */

const HINT_TONE: Record<'info' | 'warn' | 'danger', string> = {
  info:   'border-teal/25 bg-teal/[0.055] text-teal',
  warn:   'border-warn/25 bg-warn/[0.06] text-[#f5c249]',
  danger: 'border-danger/25 bg-danger/[0.06] text-[#ff7a8a]',
}

/**
 * A short piece of analysis attached to the data above or below it. Used to say
 * what a number means, not to repeat it.
 */
export function Hint({
  children, tone = 'info', className,
}: { children: ReactNode; tone?: 'info' | 'warn' | 'danger'; className?: string }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', HINT_TONE[tone], className)}>
      <Icon name="alert" className="mt-0.5 h-4 w-4 flex-none" />
      <p className="m-0 text-[12.5px] leading-relaxed text-ink-2">{children}</p>
    </div>
  )
}

/* ----------------------------------------------------------------- Toggle */

export function Toggle({
  checked, onChange, disabled,
}: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative h-[25px] w-11 flex-none rounded-full transition disabled:opacity-40',
        checked ? 'bg-teal' : 'bg-white/[0.12]',
      )}
    >
      <span className={cn(
        'absolute top-[3px] h-[19px] w-[19px] rounded-full bg-white transition-all',
        checked ? 'left-[22px]' : 'left-[3px]',
      )} />
    </button>
  )
}

/* ------------------------------------------------------------ SearchInput */

interface SearchProps extends InputHTMLAttributes<HTMLInputElement> { }

export function SearchInput({ className, ...rest }: SearchProps) {
  return (
    <label className={cn(
      'flex h-[38px] items-center gap-2 rounded-[10px] border border-stroke-2 bg-white/[0.04] px-3',
      className,
    )}>
      <Icon name="search" className="h-[15px] w-[15px] flex-none text-muted" />
      <input
        {...rest}
        className="w-48 border-none bg-transparent text-[13px] text-ink outline-none placeholder:text-muted-2"
      />
    </label>
  )
}

/* -------------------------------------------------------------- SettingRow */

export function SettingRow({
  title, description, control,
}: { title: string; description?: string; control: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-white/5 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <b className="block text-[13.5px] font-bold text-ink">{title}</b>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>}
      </div>
      <div className="ml-auto flex-none">{control}</div>
    </div>
  )
}
