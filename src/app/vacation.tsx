import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { windowColors } from '@timeblock/core/calendar/colors';
import { saveVacation } from '@timeblock/core/operations/vacation';
import { getSettings } from '@timeblock/core/store/settings';
import { getVacation } from '@timeblock/core/store/vacations';
import { listWindows } from '@timeblock/core/store/windows';
import { closedWindows, formInputs } from '@timeblock/core/vacation';
import { env } from '@/env';
import { pickDayAndTime, PICKERS_AVAILABLE, type LocalMoment } from '@/pickers';
import { useApp } from '@/state/app';
import { useTheme } from '@/theme';
import { Body, Button, Checkbox, Note, Section, ui } from '@/ui';
import { useLoad } from '@/use-load';

interface Draft {
  from: LocalMoment;
  until: LocalMoment;
  /** Windows it closes; null is Anytime. */
  windowIds: (number | null)[];
  note: string;
  inGoogle: boolean;
}

const moment = (local: string): LocalMoment => ({ date: local.slice(0, 10), time: local.slice(11, 16) });
const local = (m: LocalMoment) => `${m.date}T${m.time}`;

/**
 * Set a vacation, change one, or make one from a Google event: from and until
 * (an end of 23:59 covers the whole last day), the windows it closes, a note,
 * and whether it is also shown in Google Calendar — the desktop's form.
 *
 * Params: `id` to edit; or `from`/`until` (local `YYYY-MM-DDTHH:mm`), `note`
 * and `source` (the Google event occurrence) for a new one.
 */
export default function VacationScreen() {
  const theme = useTheme();
  const router = useRouter();
  const app = useApp();
  const params = useLocalSearchParams<{ id?: string; from?: string; until?: string; note?: string; source?: string }>();
  const editing = params.id ? Number(params.id) : null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warning, setWarning] = useState<{ text: string; id: number; date: string } | null>(null);

  const { data } = useLoad(async () => {
    const { db } = env();
    const [settings, windows] = await Promise.all([getSettings(db), listWindows(db)]);
    const zone = settings.timezone;
    const existing = editing ? await getVacation(db, editing) : null;
    const today = DateTime.now().setZone(zone).toISODate()!;
    let initial: Draft;
    if (existing) {
      const span = formInputs(DateTime.fromISO(existing.startsAt).setZone(zone), DateTime.fromISO(existing.endsAt).setZone(zone));
      initial = { from: moment(span.from), until: moment(span.until), windowIds: closedWindows(existing), note: existing.note ?? '', inGoogle: existing.inGoogle };
    } else {
      initial = {
        from: moment(params.from ?? `${today}T00:00`),
        until: moment(params.until ?? `${today}T23:59`),
        windowIds: [...windows.map((w) => w.id), null],
        note: params.note ?? '',
        inGoogle: false,
      };
    }
    return { windows, colors: windowColors(windows), initial, missing: editing !== null && !existing };
  }, [editing]);

  if (!data) return <View style={{ flex: 1, backgroundColor: theme.background }} />;
  if (data.missing) {
    return (
      <View style={[ui.screen, { flex: 1, backgroundColor: theme.background }]}>
        <Body tone="muted">This vacation no longer exists — it may have been deleted on the desktop.</Body>
      </View>
    );
  }

  const form = draft ?? data.initial;
  const set = (patch: Partial<Draft>) => setDraft({ ...form, ...patch });
  const toggleWindow = (id: number | null) =>
    set({ windowIds: form.windowIds.includes(id) ? form.windowIds.filter((w) => w !== id) : [...form.windowIds, id] });
  const googleReady = app.account?.calendar === true;

  const pick = async (which: 'from' | 'until') => {
    const picked = await pickDayAndTime(form[which], { minuteInterval: 1 });
    if (picked) set({ [which]: picked });
  };

  const openVacation = (id: number, date: string) => router.replace({ pathname: '/item', params: { id: `vacation:${id}`, view: 'day', date } });

  const save = async () => {
    setSaving(true);
    setProblem(null);
    setWarning(null);
    try {
      const result = await saveVacation(env(), {
        from: local(form.from),
        to: local(form.until),
        windowIds: form.windowIds,
        note: form.note,
        inGoogle: form.inGoogle && googleReady,
        id: editing,
        sourceEvent: params.source ?? null,
      });
      if (!result.ok) return setProblem(result.message);
      app.changed();
      if (result.warning) setWarning({ text: result.warning, id: result.id, date: result.date });
      else openVacation(result.id, result.date);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const label = (m: LocalMoment) => DateTime.fromISO(local(m)).toFormat('ccc d LLL yyyy · HH:mm');

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: editing ? 'Edit vacation' : params.source ? 'Make it a vacation' : 'Set vacation' }} />

      <Section title="When">
        {(['from', 'until'] as const).map((which) => (
          <View key={which} style={{ gap: 4 }}>
            <Text style={[ui.label, { color: theme.muted }]}>{which === 'from' ? 'From' : 'Until'}</Text>
            {PICKERS_AVAILABLE ? (
              <Pressable onPress={() => void pick(which)} style={[ui.input, { borderColor: theme.border, backgroundColor: theme.background }]} accessibilityRole="button">
                <Text style={[ui.text, { color: theme.foreground }]}>{label(form[which])}</Text>
              </Pressable>
            ) : (
              <TextInput
                value={`${form[which].date} ${form[which].time}`}
                onChangeText={(text) => set({ [which]: { date: text.slice(0, 10), time: text.slice(11, 16) } })}
                style={[ui.input, { color: theme.foreground, borderColor: theme.border }]}
                placeholder="YYYY-MM-DD HH:mm"
                placeholderTextColor={theme.muted}
              />
            )}
          </View>
        ))}
        <Note>An end of 23:59 covers the whole last day.</Note>
      </Section>

      <Section title="Unavailable for">
        {data.windows.map((w) => (
          <Checkbox
            key={w.id}
            checked={form.windowIds.includes(w.id)}
            onPress={() => toggleWindow(w.id)}
            label={w.name}
            detail={`${w.startTime}–${w.endTime}`}
            color={data.colors.get(w.id)}
            strike={false}
          />
        ))}
        <Checkbox checked={form.windowIds.includes(null)} onPress={() => toggleWindow(null)} label="Work with no window (Anytime)" strike={false} />
        <Note>Nothing is planned in the ticked windows while you are away; the others work as usual.</Note>
      </Section>

      <Section title="Note (optional)">
        <TextInput
          value={form.note}
          onChangeText={(note) => set({ note })}
          placeholder="e.g. Crete"
          placeholderTextColor={theme.muted}
          style={[ui.input, { color: theme.foreground, borderColor: theme.border }]}
          maxLength={120}
        />
      </Section>

      <Section>
        <View style={ui.inline}>
          <View style={{ flex: 1 }}>
            <Body>Also show in Google Calendar</Body>
            <Note>
              {googleReady
                ? 'As an event in the “TimeBlock — Focus” calendar, kept in step when you edit or delete the vacation.'
                : 'Sign in with Google calendar access (⚙ Settings) to use this.'}
            </Note>
          </View>
          <Switch value={form.inGoogle && googleReady} disabled={!googleReady} onValueChange={(inGoogle) => set({ inGoogle })} />
        </View>
      </Section>

      <Note>Run Reschedule… (Plan) afterwards to move work already planned into it.</Note>
      {problem && <Body tone="bad">{problem}</Body>}
      {warning ? (
        <>
          <Note tone="warn">{warning.text}</Note>
          <Button label="Open the vacation" onPress={() => openVacation(warning.id, warning.date)} />
        </>
      ) : (
        <Button
          label={editing ? 'Save changes' : params.source ? 'Make it a vacation' : 'Save vacation'}
          primary
          busy={saving}
          onPress={save}
        />
      )}
    </ScrollView>
  );
}
