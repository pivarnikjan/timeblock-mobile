import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { vacationLabel } from '@timeblock/core/calendar/assemble';
import { spanLabel, type MultiDayReview } from '@timeblock/core/calendar/multi-day';
import { matchVacationToEvent, removeVacation } from '@timeblock/core/operations/vacation';
import { setMark } from '@timeblock/core/store/event-marks';
import { getSettings } from '@timeblock/core/store/settings';
import { listVacations } from '@timeblock/core/store/vacations';
import { nowIn } from '@timeblock/core/time/periods';
import { formInputs } from '@timeblock/core/vacation';
import { useMultiDayReviews } from '@/calendar/use-reviews';
import { env } from '@/env';
import { useApp } from '@/state/app';
import { useTheme } from '@/theme';
import { Body, Button, confirm, Note, Section, ui } from '@/ui';
import { useLoad } from '@/use-load';

/**
 * Vacations: the multi-day events that still need an answer (is it a
 * vacation?), Set vacation, and the vacations to come — what the desktop shows
 * above its calendar and under its 🏖 Set vacation button.
 */
export default function VacationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const app = useApp();
  const { reviews, refresh } = useMultiDayReviews();
  const [refreshing, setRefreshing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { data } = useLoad(async () => {
    const { db } = env();
    const zone = (await getSettings(db)).timezone;
    const upcoming = await listVacations(db, nowIn(zone).toUTC().toISO()!);
    return {
      zone,
      upcoming: upcoming.map((v) => ({
        id: v.id,
        label: vacationLabel(v.startsAt, v.endsAt, zone, v.note),
        startDate: DateTime.fromISO(v.startsAt).setZone(zone).toISODate()!,
      })),
    };
  }, [app.version]);
  const zone = data?.zone ?? 'UTC';

  const act = async (work: () => Promise<void>) => {
    setProblem(null);
    try {
      await work();
      app.changed();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  const openVacation = (id: number, date: string) => router.push({ pathname: '/item', params: { id: `vacation:${id}`, view: 'day', date } });

  const undecided = reviews.filter((r) => r.kind === 'undecided');
  const moved = reviews.filter((r) => r.kind === 'moved');

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={ui.screen}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }
    >
      {undecided.length > 0 && (
        <Section title={`${undecided.length} multi-day event${undecided.length === 1 ? '' : 's'} — is it a vacation?`} tone="accent">
          <Note>
            Until you decide, a busy one blocks every window and a free one (most all-day events) blocks none — so work may be planned
            into time you are away. A vacation closes just the windows you choose; the event then no longer counts as busy.
          </Note>
          {undecided.map((r) => (
            <Undecided
              key={r.occurrence}
              review={r}
              zone={zone}
              onVacation={() => router.push({ pathname: '/vacation', params: { ...fromEvent(r, zone), note: r.title, source: r.occurrence } })}
              onNot={() => act(() => setMark(env().db, r.key, r.title, 'notVacation', true))}
            />
          ))}
        </Section>
      )}

      {moved.length > 0 && (
        <Section title={`${moved.length} vacation${moved.length === 1 ? '' : 's'} no longer match${moved.length === 1 ? 'es' : ''} the event in Google`} tone="accent">
          {moved.map((r) => (
            <View key={r.occurrence} style={{ gap: 6 }}>
              <Body>
                {r.title} moved in Google: the vacation is {spanLabel(r.vacation!.startsAt, r.vacation!.endsAt, r.allDay, zone)}, the event is now{' '}
                {spanLabel(r.start, r.end, r.allDay, zone)}.
              </Body>
              <Button label="Move the vacation with it" onPress={() => act(() => matchVacationToEvent(env(), r.vacation!.id, r.start, r.end))} />
              <Button label="Open the vacation" onPress={() => openVacation(r.vacation!.id, DateTime.fromISO(r.vacation!.startsAt).setZone(zone).toISODate()!)} />
            </View>
          ))}
        </Section>
      )}

      <Button label="🏖 Set vacation" primary onPress={() => router.push('/vacation')} />
      {problem && <Body tone="bad">{problem}</Body>}

      <Section title="Upcoming">
        {!data || data.upcoming.length === 0 ? (
          <Note>No vacations ahead.</Note>
        ) : (
          data.upcoming.map((v) => (
            <View key={v.id} style={ui.inline}>
              <Text style={[ui.text, { flex: 1, color: theme.foreground }]} onPress={() => openVacation(v.id, v.startDate)}>
                {v.label}
              </Text>
              <Button
                label="Remove"
                onPress={async () => {
                  if (await confirm('Delete this vacation?', 'Its windows open again for planning.', 'Delete')) await act(() => removeVacation(env(), v.id));
                }}
              />
            </View>
          ))
        )}
        <Note>Tap one to see what is scheduled during it, or to edit it.</Note>
      </Section>

      {reviews.length === 0 && app.account?.calendar && (
        <Note>No multi-day event in the next three months needs a decision. Pull down to check Google again.</Note>
      )}
    </ScrollView>
  );
}

/** The vacation form's from/until for a Google event's span. */
function fromEvent(r: MultiDayReview, zone: string) {
  const { from, until } = formInputs(DateTime.fromISO(r.start).setZone(zone), DateTime.fromISO(r.end).setZone(zone));
  return { from, until };
}

function Undecided({ review: r, zone, onVacation, onNot }: { review: MultiDayReview; zone: string; onVacation(): void; onNot(): void }) {
  return (
    <View style={{ gap: 6 }}>
      <Body>
        {r.title} · {spanLabel(r.start, r.end, r.allDay, zone)}
      </Body>
      {r.repeats > 1 && <Note>Repeats ({r.repeats}× in the next three months) — one answer covers them all.</Note>}
      <View style={ui.wrap}>
        <Button label={r.repeats > 1 ? 'Make this one a vacation…' : 'Vacation…'} onPress={onVacation} />
        <Button label="Not a vacation" onPress={onNot} />
      </View>
    </View>
  );
}
