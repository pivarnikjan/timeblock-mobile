import type { TextStyle, ViewStyle } from 'react-native';
import type { CalendarItem } from '@timeblock/core/calendar/assemble';
import type { Theme } from '@/theme';

/**
 * Colours for a calendar item, as the desktop draws them: solid event colour
 * with contrasting text; declined events outlined and struck through; drafts
 * dashed and tinted; placeholders (time planning may use) dashed and lighter.
 */
export function chipStyle(item: CalendarItem, theme: Theme): { box: ViewStyle; text: TextStyle } {
  if (item.declined) {
    return {
      box: { borderWidth: 1, borderColor: item.color, backgroundColor: theme.surface },
      text: { color: item.color, textDecorationLine: 'line-through' },
    };
  }
  if (item.draft) {
    return {
      box: { borderWidth: 1, borderStyle: 'dashed', borderColor: item.color, backgroundColor: `${item.color}26` },
      text: { color: theme.foreground },
    };
  }
  if (item.placeholder) {
    return {
      box: { borderWidth: 1, borderStyle: 'dashed', borderColor: item.color, backgroundColor: `${item.color}1f` },
      text: { color: theme.foreground },
    };
  }
  return { box: { backgroundColor: item.color }, text: { color: item.textColor } };
}

/** A block whose every segment is ticked off. */
export const isFinished = (item: CalendarItem) =>
  item.kind === 'block' && item.segments.length > 0 && item.segments.every((s) => s.done);

/** The title as a chip shows it: ★ for important events, ✓ for finished blocks, 📌 for blocks placed by hand. */
export function chipTitle(item: CalendarItem): string {
  const marks = `${item.important ? '★ ' : ''}${isFinished(item) ? '✓ ' : ''}${item.pinned ? '📌 ' : ''}`;
  return `${marks}${item.title}`;
}
