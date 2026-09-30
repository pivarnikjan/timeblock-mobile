import { DateTime } from 'luxon';
import { Text, View } from 'react-native';
import type { HorizonOutlook } from '@timeblock/core/planner';
import { useTheme } from '@/theme';
import { ui } from '@/ui';

const day = (iso: string) => DateTime.fromISO(iso).toFormat('ccc d LLL');

/** What the forecast says about a goal, in a small badge — the desktop's wording and colours. */
export function OutlookBadge({ outlook }: { outlook: HorizonOutlook | undefined }) {
  const theme = useTheme();
  if (!outlook || outlook.status === 'empty') return null;

  const partial = outlook.status === 'on-track' && outlook.unplanned > 0;
  const tone: Record<Exclude<HorizonOutlook['status'], 'empty'>, string> = {
    done: theme.ok,
    finished: theme.ok,
    'on-track': theme.muted,
    'at-risk': theme.danger,
    unscheduled: '#d97706',
    upcoming: theme.muted,
  };
  const color = partial ? '#d97706' : tone[outlook.status];

  const text =
    outlook.status === 'done'
      ? 'done'
      : outlook.status === 'finished'
        ? 'all planned work finished'
        : outlook.status === 'upcoming'
          ? `starts ${day(outlook.starts)}`
          : outlook.status === 'on-track'
            ? `${outlook.runsTo ? `on track so far · runs to ${day(outlook.runsTo)}` : `on track · done by ${day(outlook.finish)}`}${
                outlook.unplanned > 0 ? ` · ${outlook.unplanned} below with nothing planned yet` : ''
              }`
            : outlook.status === 'unscheduled'
              ? `${outlook.openTasks} task${outlook.openTasks === 1 ? '' : 's'} waiting to be put into a week`
              : `at risk · ${outlook.reason}`;

  return (
    <View style={[ui.chip, { borderColor: color, alignSelf: 'flex-start' }]}>
      <Text style={[ui.chipText, { color }]}>{text}</Text>
    </View>
  );
}
