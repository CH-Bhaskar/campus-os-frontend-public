
/** Friendly placeholder for empty lists. */
import type { ReactNode } from 'react';
import { Icon } from './ui';
import type { IconName } from './ui';

export function EmptyState({
  icon = 'inbox',
  emoji,
  title,
  hint,
  action,
}: {
  /** preferred: an icon name */
  icon?: IconName;
  /** legacy emoji prop still supported */
  emoji?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-desk-ink/15 bg-white/60 px-6 py-14 text-center dark:border-white/15 dark:bg-slate-800/60">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300">
        {emoji ? (
          <span className="text-3xl">{emoji}</span>
        ) : (
          <Icon name={icon} className="h-6 w-6" />
        )}
      </div>
      <div className="mt-3 font-display text-lg font-semibold text-desk-ink dark:text-white">
        {title}
      </div>
      {hint && (
        <div className="mx-auto mt-1 max-w-sm text-sm text-desk-ink/55 dark:text-stone-400">
          {hint}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
