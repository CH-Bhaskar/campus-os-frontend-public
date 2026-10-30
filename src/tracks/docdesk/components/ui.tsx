/**
 * DocDesk design system primitives — College Documents Desk visual language.
 * Same component API as before (props/names unchanged); only the styling
 * was re-skinned. Light + dark ready, scoped to the DocDesk track.
 */
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/* ---------------- Icons (inline SVG, lucide-style) ---------------- */

const PATHS = {
  home: (
    <>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  megaphone: (
    <>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
  fileText: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </>
  ),
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  logOut: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  copy: (
    <>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  pencil: (
    <>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  x: <path d="M18 6 6 18" />,
  check: <path d="M20 6 9 17l-5-5" />,
  chevL: <path d="m15 18-6-6 6-6" />,
  chevR: <path d="m9 18 6-6-6-6" />,
  chevD: <path d="m6 9 6 6 6-6" />,
  arrowR: (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  arrowL: (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
  cap: (
    <>
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
      <path d="M22 10v6" />
    </>
  ),
  shield: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z" />
    </>
  ),
  calendar: (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className = 'h-5 w-5',
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/* ---------------- Buttons ---------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brass';
type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-desk-primary focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-desk-navy text-white shadow-desk hover:bg-desk-ink dark:bg-indigo-500 dark:hover:bg-indigo-400',
  secondary:
    'border border-slate-200 bg-white text-desk-ink shadow-desk hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  ghost:
    'text-slate-500 hover:bg-white hover:text-desk-ink dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white',
  danger:
    'bg-rose-600 text-white shadow-desk hover:bg-rose-700 dark:bg-rose-500/90 dark:hover:bg-rose-500',
  brass:
    'bg-amber-400 text-desk-navy shadow-desk hover:bg-amber-300 dark:bg-amber-400 dark:hover:bg-amber-300',
};

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-1.5 text-[13px]',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-[15px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={`${BTN_BASE} ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]} ${className}`}
      {...props}
    />
  );
}

/* ---------------- Form controls ---------------- */

export const INPUT_CLS =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-desk-ink shadow-[inset_0_1px_2px_rgb(30_27_75/0.04)] transition outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-desk-primary focus:ring-2 focus:ring-desk-primary/50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${INPUT_CLS} ${className}`} {...props} />;
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${INPUT_CLS} ${className}`} {...props} />;
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={`${INPUT_CLS} cursor-pointer appearance-none pr-10 ${className}`} {...props}>
        {children}
      </select>
      <Icon
        name="chevD"
        className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
    </span>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold text-desk-ink dark:text-slate-200"
      >
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400 dark:text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

/* ---------------- Surfaces ---------------- */

export function Card({
  className = '',
  hover = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={`card-desk ${hover ? 'lift' : ''} ${className}`}
      {...props}
    />
  );
}

type BadgeTone =
  | 'ivy'
  | 'brass'
  | 'sky'
  | 'violet'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'red'
  | 'emerald'
  | 'slate';

const BADGE_TONES: Record<BadgeTone, string> = {
  ivy: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300',
  brass: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
};

export function Badge({
  tone = 'slate',
  className = '',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${BADGE_TONES[tone]} ${className}`}
      {...props}
    />
  );
}

/* ---------------- Typography ---------------- */

export function SectionHeading({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[11px] font-bold tracking-[0.16em] text-desk-primary uppercase">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="mt-1 font-display text-[28px] leading-tight font-bold tracking-tight text-desk-ink dark:text-white">
          {title}
        </h1>
        {desc ? (
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-slate-400 dark:text-slate-500">
            {desc}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ---------------- Brand ---------------- */

export function Logo({ tagline = true }: { tagline?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-desk-primary text-white shadow-desk">
        <Icon name="cap" className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-[19px] font-bold tracking-tight text-desk-ink dark:text-white">
          CampusOS
        </span>
        {tagline ? (
          <span className="block text-[11px] font-medium text-slate-400">
            One campus. One portal.
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function Avatar({ name, className = '' }: { name?: string; className?: string }) {
  const initials =
    name
      ?.split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-100 font-display text-sm font-bold text-desk-primary ring-1 ring-indigo-900/10 dark:bg-indigo-400/15 dark:text-indigo-300 dark:ring-white/10 ${className}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/* ---------------- Module accents ---------------- */

export const MODULE_ACCENTS: Record<string, { label: string; icon: IconName; tile: string; badgeTone: BadgeTone }> = {
  dashboard: {
    label: 'Dashboard',
    icon: 'home',
    tile: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300',
    badgeTone: 'ivy',
  },
  users: {
    label: 'Users',
    icon: 'users',
    tile: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300',
    badgeTone: 'ivy',
  },
  findit: {
    label: 'FindIt',
    icon: 'search',
    tile: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
    badgeTone: 'amber',
  },
  noticehub: {
    label: 'Notice Hub',
    icon: 'megaphone',
    tile: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
    badgeTone: 'sky',
  },
  docdesk: {
    label: 'DocDesk',
    icon: 'fileText',
    tile: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
    badgeTone: 'violet',
  },
  fixit: {
    label: 'FixIt',
    icon: 'wrench',
    tile: 'bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300',
    badgeTone: 'orange',
  },
};

export function ModuleIcon({
  module,
  className = 'h-5 w-5',
}: {
  module: keyof typeof MODULE_ACCENTS;
  className?: string;
}) {
  const m = MODULE_ACCENTS[module];
  return (
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${m.tile}`}>
      <Icon name={m.icon} className={className} />
    </span>
  );
}
