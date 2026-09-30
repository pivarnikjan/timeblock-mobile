import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { formatMinutes } from '@timeblock/core/hierarchy';
import { updateSettings } from '@timeblock/core/store/settings';
import { cachedCalendars } from '@/db/cache';
import { setCalendarHidden, showEvent, updateFilters } from '@/db/mutations';
import { getFilters, getSettings, listWindows } from '@/db/queries';
import { loadDemoPlan } from '@/dev/demo';
import { ago } from '@/format';
import { SIGN_IN_AVAILABLE } from '@/google/auth';
import { env } from '@/env';
import { pickTime, PICKERS_AVAILABLE } from '@/pickers';
import { useApp } from '@/state/app';
import { phoneSyncStatus, renamePhone } from '@/sync/phone-sync';
import { useTheme } from '@/theme';
import { Body, Button, Note, Section, TextField, ToggleRow, ui } from '@/ui';
import { windowColors } from '@timeblock/core/calendar/colors';

export default function SettingsScreen() {
  const theme = useTheme();
  const app = useApp();
  const { device, peers } = useMemo(() => phoneSyncStatus(), [app.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const filters = useMemo(() => getFilters(), [app.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const settings = useMemo(() => getSettings(), [app.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const windows = useMemo(() => listWindows(), [app.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const calendars = useMemo(() => cachedCalendars().filter((c) => c.id !== settings.targetCalendarId), [app.version, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const colors = windowColors(windows);
  const [name, setName] = useState(device.name);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={ui.screen}>
      <Section title="Google account">
        {!SIGN_IN_AVAILABLE ? (
          <Text style={[ui.text, { color: theme.muted }]}>Google sign-in works in the Android app; this browser preview runs on local data.</Text>
        ) : app.account ? (
          <>
            <Text style={[ui.text, { color: theme.foreground }]}>
              Signed in as {app.account.email}
            </Text>
            {!app.account.complete && (
              <>
                <Text style={[ui.text, { color: theme.danger }]}>
                  Calendar or Google Drive access was not granted. Both are needed: Drive for syncing with the desktop (TimeBlock&apos;s own hidden folder only), Calendar for your meetings.
                </Text>
                <Button label="Grant access" primary onPress={() => act(app.grantMissingScopes)} />
              </>
            )}
            <Button label="Sign out" onPress={() => act(app.signOut)} />
          </>
        ) : (
          <>
            <Text style={[ui.text, { color: theme.muted }]}>
              Sign in with the Google account the desktop uses. On Google&apos;s screen, allow calendar access and “See, create, and delete its own configuration data in your Google Drive”.
            </Text>
            <Button label="Sign in with Google" primary onPress={() => act(app.signIn)} />
          </>
        )}
      </Section>

      <Section title="Sync with the desktop">
        <View style={ui.inline}>
          <Text style={[ui.text, { color: theme.foreground, flex: 1 }]}>Last synced: {ago(device.lastSyncAt)}</Text>
          {app.syncing && <ActivityIndicator />}
        </View>
        {device.lastError && <Text style={[ui.text, { color: theme.danger }]}>The last sync failed: {device.lastError}</Text>}
        <Button label="Sync now" primary disabled={!app.account || app.syncing} onPress={() => act(() => app.sync())} />
        {app.stale && (
          <>
            <Text style={[ui.text, { color: theme.danger }]}>
              This phone last synced more than 90 days ago. Merging now could bring back things deleted on the desktop since.
            </Text>
            <Button label="Replace this phone’s data with the desktop’s" onPress={() => act(app.replaceFromDrive)} />
            <Button label="Sync anyway" onPress={() => act(() => app.sync({ allowStale: true }))} />
          </>
        )}
        {peers.map((p) => (
          <Text key={p.fileId} style={[ui.note, { color: theme.muted }]}>
            {p.name || p.device}: last synced {ago(p.writtenAt)}, taken in here {ago(p.mergedAt)}
          </Text>
        ))}
        <Text style={[ui.label, { color: theme.muted }]}>This phone is called (on the desktop)</Text>
        <View style={ui.inline}>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={40}
            style={[ui.input, { flex: 1, color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
          />
          <Button
            label="Save"
            disabled={name.trim() === '' || name.trim() === device.name}
            onPress={async () => {
              renamePhone(name);
              app.changed();
            }}
          />
        </View>
        <Text style={[ui.note, { color: theme.muted }]}>
          The phone sends its changes a few seconds after you make them, and fetches the desktop&apos;s when it opens. Both devices can plan: planning, rescheduling and committing sync first, and drafts stay on the device that made them until committed.
        </Text>
      </Section>

      <Section title="Calendar">
        <CalendarHours start={settings.calendarStart} end={settings.calendarEnd} timezone={settings.timezone} onSaved={app.changed} />
        <ToggleRow
          label="Time windows in front"
          hint="Draw the window bands and their names over the blocks instead of behind them."
          value={filters.windowsInFront}
          onChange={(on) => {
            updateFilters((f) => ({ ...f, windowsInFront: on }));
            app.changed();
          }}
        />
        <ToggleRow
          label="Only multi-day events in Month"
          hint="Trips, holidays and conferences at a glance — plus any event marked ★ important."
          value={filters.multiDayOnly.includes('month')}
          onChange={(on) => {
            updateFilters((f) => ({ ...f, multiDayOnly: on ? ['month'] : [] }));
            app.changed();
          }}
        />
        <Text style={[ui.label, { color: theme.muted }]}>Shown on the calendar</Text>
        <ToggleRow
          label="TimeBlock plan"
          value={!filters.hidePlan}
          onChange={(on) => {
            updateFilters((f) => ({ ...f, hidePlan: !on }));
            app.changed();
          }}
        />
        {calendars.length === 0 && (
          <Text style={[ui.note, { color: theme.muted }]}>Your Google calendars are listed here once the phone has read them.</Text>
        )}
        {calendars.map((c) => (
          <ToggleRow
            key={c.id}
            label={c.summary}
            color={c.color}
            value={!filters.hiddenCalendars.includes(c.id)}
            onChange={(on) => {
              setCalendarHidden(c.id, !on);
              app.changed();
            }}
          />
        ))}
        {calendars.length > 0 && <Note>Unticked calendars are left off the calendar; planning still avoids their busy time.</Note>}
        <Text style={[ui.label, { color: theme.muted }]}>Hidden events ({Object.keys(filters.hiddenEvents).length})</Text>
        {Object.keys(filters.hiddenEvents).length === 0 && <Note>None. Tap an event and turn off “Show on the calendar” to hide it.</Note>}
        {Object.entries(filters.hiddenEvents).map(([key, title]) => (
          <View key={key} style={ui.inline}>
            <Text style={[ui.text, { color: theme.foreground, flex: 1 }]} numberOfLines={1}>
              {title}
            </Text>
            <Button
              label="Show again"
              onPress={async () => {
                showEvent(key);
                app.changed();
              }}
            />
          </View>
        ))}
        {Object.keys(filters.hiddenEvents).length > 1 && (
          <Button
            label="Show all again"
            onPress={async () => {
              updateFilters((f) => ({ ...f, hiddenEvents: {} }));
              app.changed();
            }}
          />
        )}
      </Section>

      <Section title="Day shape">
        <ReadOnly label="Timezone" value={settings.timezone} />
        <ReadOnly label="Day" value={`${settings.dayStart} – ${settings.dayEnd}`} />
        <ReadOnly label="Break around meetings and after blocks" value={formatMinutes(settings.bufferMin)} />
        <ReadOnly label="Blocks" value={`${formatMinutes(settings.minBlockMin)} – ${formatMinutes(settings.maxFocusBlockMin)}`} />
        <ReadOnly label="Lunch" value={settings.lunchMin > 0 ? `${settings.lunchStart} · ${formatMinutes(settings.lunchMin)}` : 'none'} />
        <Note>Set on the desktop (Settings → Day shape); the phone plans with the same values.</Note>
      </Section>

      <Section title="Time windows">
        <Note>
          Work is only scheduled inside its window. A task uses its own window, else the nearest one set on a goal above it, else the default below.
        </Note>
        {windows.map((w) => (
          <View key={w.id} style={ui.inline}>
            <View style={[ui.swatch, { backgroundColor: colors.get(w.id) }]} />
            <View style={{ flex: 1 }}>
              <Text style={[ui.text, { color: theme.foreground }]}>{w.name}</Text>
              <Text style={[ui.note, { color: theme.muted }]}>{weekdayLabel(w.weekdays)}</Text>
            </View>
            <Text style={[ui.text, { color: theme.muted }]}>
              {w.startTime}–{w.endTime}
            </Text>
          </View>
        ))}
        <ReadOnly
          label="Default window"
          value={windows.find((w) => w.id === settings.defaultWindowId)?.name ?? `Anytime (${settings.dayStart}–${settings.dayEnd})`}
        />
        <Note>Time windows are edited on the desktop (Settings → Time windows). Times are in {settings.timezone}.</Note>
      </Section>

      {__DEV__ && Platform.OS === 'web' && (
        <Section title="Development">
          <Button
            label="Load a demo plan"
            onPress={async () => {
              loadDemoPlan();
              app.changed();
            }}
          />
        </Section>
      )}

      {busy && <ActivityIndicator />}
      {problem && <Text style={[ui.text, { color: theme.danger }]}>{problem}</Text>}
      <Text style={[ui.note, { color: theme.muted, textAlign: 'center' }]}>TimeBlock for Android · device {device.device}</Text>
    </ScrollView>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Mon–Fri", "every day", or the days listed. */
function weekdayLabel(weekdays: string): string {
  const days = weekdays.split(',').map(Number).filter((d) => d >= 1 && d <= 7).sort();
  if (days.length === 7) return 'every day';
  if (days.join(',') === '1,2,3,4,5') return 'Mon–Fri';
  return days.map((d) => DAYS[d - 1]).join(', ');
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={ui.inline}>
      <Text style={[ui.text, { flex: 1, color: theme.muted }]}>{label}</Text>
      <Text style={[ui.text, { color: theme.foreground }]}>{value}</Text>
    </View>
  );
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * The hours the day and week views show — shared with the desktop (Settings →
 * Calendar there). An end of 00:00 means midnight.
 */
function CalendarHours({ start, end, timezone, onSaved }: { start: string; end: string; timezone: string; onSaved(): void }) {
  const theme = useTheme();
  const [draft, setDraft] = useState<{ start: string; end: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const value = draft ?? { start, end };
  const changed = value.start !== start || value.end !== end;

  const pick = async (which: 'start' | 'end') => {
    const picked = await pickTime(value[which]);
    if (picked) setDraft({ ...value, [which]: picked });
  };

  const save = async () => {
    setProblem(null);
    if (!/^\d{2}:\d{2}$/.test(value.start) || !/^\d{2}:\d{2}$/.test(value.end)) return setProblem('Use HH:mm, e.g. 05:00.');
    const endMin = minutesOf(value.end) === 0 ? 24 * 60 : minutesOf(value.end);
    if (endMin <= minutesOf(value.start)) return setProblem(`The calendar must end after it starts (${value.start}–${value.end}); use 00:00 for midnight.`);
    await updateSettings(env().db, { calendarStart: value.start, calendarEnd: value.end });
    setDraft(null);
    onSaved();
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={[ui.label, { color: theme.muted }]}>Hours shown (in {timezone})</Text>
      <View style={ui.inline}>
        {(['start', 'end'] as const).map((which) =>
          PICKERS_AVAILABLE ? (
            <Pressable
              key={which}
              onPress={() => void pick(which)}
              style={[ui.input, { flex: 1, borderColor: theme.border, backgroundColor: theme.background }]}
              accessibilityRole="button"
              accessibilityLabel={which === 'start' ? 'Show from' : 'Show until'}
            >
              <Text style={[ui.text, { color: theme.foreground, textAlign: 'center' }]}>{value[which]}</Text>
            </Pressable>
          ) : (
            <TextField key={which} value={value[which]} onChangeText={(t) => setDraft({ ...value, [which]: t.trim() })} style={{ flex: 1 }} placeholder="HH:mm" />
          ),
        )}
        <Button label="Save" primary disabled={!changed} onPress={save} />
      </View>
      <Note>From – until. An end of 00:00 means midnight. Also changes the desktop&apos;s calendar.</Note>
      {problem && <Body tone="bad">{problem}</Body>}
    </View>
  );
}
