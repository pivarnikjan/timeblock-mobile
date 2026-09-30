import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { cachedCalendars } from '@/db/cache';
import { setCalendarHidden, showEvent, updateFilters } from '@/db/mutations';
import { getFilters, getSettings, listWindows } from '@/db/queries';
import { loadDemoPlan } from '@/dev/demo';
import { ago } from '@/format';
import { SIGN_IN_AVAILABLE } from '@/google/auth';
import { useApp } from '@/state/app';
import { phoneSyncStatus, renamePhone } from '@/sync/phone-sync';
import { useTheme } from '@/theme';
import { Button, Section, ToggleRow, ui } from '@/ui';
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
        {Object.entries(filters.hiddenEvents).length > 0 && <Text style={[ui.label, { color: theme.muted }]}>Hidden events</Text>}
        {Object.entries(filters.hiddenEvents).map(([key, title]) => (
          <View key={key} style={ui.inline}>
            <Text style={[ui.text, { color: theme.foreground, flex: 1 }]} numberOfLines={1}>
              {title}
            </Text>
            <Button
              label="Show"
              onPress={async () => {
                showEvent(key);
                app.changed();
              }}
            />
          </View>
        ))}
      </Section>

      <Section title="Time windows">
        {windows.map((w) => (
          <View key={w.id} style={ui.inline}>
            <View style={[ui.swatch, { backgroundColor: colors.get(w.id) }]} />
            <Text style={[ui.text, { color: theme.foreground, flex: 1 }]}>{w.name}</Text>
            <Text style={[ui.text, { color: theme.muted }]}>
              {w.startTime}–{w.endTime}
            </Text>
          </View>
        ))}
        <Text style={[ui.note, { color: theme.muted }]}>Time windows, lunch and block sizes are edited on the desktop. Times are in {settings.timezone}.</Text>
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
