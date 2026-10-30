
/**
 * Cursor-based pagination controls.
 * The API only pages forward via next_cursor, so callers keep a stack of
 * cursors for the Back button (see AdminUsersPage for the pattern).
 */
import { Button, Icon } from './ui';

export function Pagination({
  nextCursor,
  hasPrev,
  onNext,
  onPrev,
}: {
  nextCursor: string | null;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-4">
      <Button variant="secondary" size="sm" onClick={onPrev} disabled={!hasPrev}>
        <Icon name="arrowL" className="h-4 w-4" /> Back
      </Button>
      <span className="rounded-full bg-desk-ink/5 px-3 py-1 text-xs font-medium text-desk-ink/50 dark:bg-white/10 dark:text-stone-400">
        {nextCursor ? 'More pages available' : 'End of list'}
      </span>
      <Button variant="secondary" size="sm" onClick={onNext} disabled={!nextCursor}>
        Next <Icon name="arrowR" className="h-4 w-4" />
      </Button>
    </div>
  );
}
