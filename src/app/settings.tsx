import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { cachedCalendars } from '@/db/cache';
import { setCalendarHidden, showEvent, updateFilters } from '@/db/mutations';
import { getFilters, getSettings, listWindows } from '@/db/queries';
import { loadDemoPlan } from '@/dev/demo';
import { ago } from '@/format';
import { SIGN_IN_AVAILABLE } from '@/google/auth';
import { useApp } from '@/state/app';
import { phoneSyncStatus, renamePhone } from '@/sync/phone-sync';
import { useTheme, type Theme } from '@/theme';
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
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.screen}>
      <Section theme={theme} title="Google account">
        {!SIGN_IN_AVAILABLE ? (
          <Text style={[styles.text, { color: theme.muted }]}>Google sign-in works in the Android app; this browser preview runs on local data.</Text>
        ) : app.account ? (
          <>
            <Text style={[styles.text, { color: theme.foreground }]}>
              Signed in as {app.account.email}
            </Text>
            {!app.account.complete && (
              <>
                <Text style={[styles.text, { color: theme.danger }]}>
                  Calendar or Google Drive access was not granted. Both are needed: Drive for syncing with the desktop (TimeBlock&apos;s own hidden folder only), Calendar for your meetings.
                </Text>
                <Button theme={theme} label="Grant access" primary onPress={() => act(app.grantMissingScopes)} />
              </>
            )}
            <Button theme={theme} label="Sign out" onPress={() => act(app.signOut)} />
          </>
        ) : (
          <>
            <Text style={[styles.text, { color: theme.muted }]}>
              Sign in with the Google account the desktop uses. On Google&apos;s screen, allow calendar access and “See, create, and delete its own configuration data in your Google Drive”.
            </Text>
            <Button theme={theme} label="Sign in with Google" primary onPress={() => act(app.signIn)} />
          </>
        )}
      </Section>

      <Section theme={theme} title="Sync with the desktop">
        <View style={styles.inline}>
          <Text style={[styles.text, { color: theme.foreground, flex: 1 }]}>Last synced: {ago(device.lastSyncAt)}</Text>
          {app.syncing && <ActivityIndicator />}
        </View>
        {device.lastError && <Text style={[styles.text, { color: theme.danger }]}>The last sync failed: {device.lastError}</Text>}
        <Button theme={theme} label="Sync now" primary disabled={!app.account || app.syncing} onPress={() => act(() => app.sync())} />
        {app.stale && (
          <>
            <Text style={[styles.text, { color: theme.danger }]}>
              This phone last synced more than 90 days ago. Merging now could bring back things deleted on the desktop since.
            </Text>
            <Button theme={theme} label="Replace this phone’s data with the desktop’s" onPress={() => act(app.replaceFromDrive)} />
            <Button theme={theme} label="Sync anyway" onPress={() => act(() => app.sync({ allowStale: true }))} />
          </>
        )}
        {peers.map((p) => (
          <Text key={p.fileId} style={[styles.note, { color: theme.muted }]}>
            {p.name || p.device}: last synced {ago(p.writtenAt)}, taken in here {ago(p.mergedAt)}
          </Text>
        ))}
        <Text style={[styles.label, { color: theme.muted }]}>This phone is called (on the desktop)</Text>
        <View style={styles.inline}>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={40}
            style={[styles.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.surface }]}
          />
          <Button
            theme={theme}
            label="Save"
            disabled={name.trim() === '' || name.trim() === device.name}
            onPress={async () => {
              renamePhone(name);
              app.changed();
            }}
          />
        </View>
        <Text style={[styles.note, { color: theme.muted }]}>
          Drafts stay on the desktop until committed; planning happens there. The phone sends its changes a few seconds after you make them, and fetches the desktop&apos;s when it opens.
        </Text>
      </Section>

      <Section theme={theme} title="Calendar">
        <ToggleRow
          theme={theme}
          label="TimeBlock plan"
          value={!filters.hidePlan}
          onChange={(on) => {
            updateFilters((f) => ({ ...f, hidePlan: !on }));
            app.changed();
          }}
        />
        {calendars.length === 0 && (
          <Text style={[styles.note, { color: theme.muted }]}>Your Google calendars are listed here once the phone has read them.</Text>
        )}
        {calendars.map((c) => (
          <ToggleRow
            key={c.id}
            theme={theme}
            label={c.summary}
            color={c.color}
            value={!filters.hiddenCalendars.includes(c.id)}
            onChange={(on) => {
              setCalendarHidden(c.id, !on);
              app.changed();
            }}
          />
        ))}
        {Object.entries(filters.hiddenEvents).length > 0 && <Text style={[styles.label, { color: theme.muted }]}>Hidden events</Text>}
        {Object.entries(filters.hiddenEvents).map(([key, title]) => (
          <View key={key} style={styles.inline}>
            <Text style={[styles.text, { color: theme.foreground, flex: 1 }]} numberOfLines={1}>
              {title}
            </Text>
            <Button
              theme={theme}
              label="Show"
              onPress={async () => {
                showEvent(key);
                app.changed();
              }}
            />
          </View>
        ))}
      </Section>

      <Section theme={theme} title="Time windows">
        {windows.map((w) => (
          <View key={w.id} style={styles.inline}>
            <View style={[styles.swatch, { backgroundColor: colors.get(w.id) }]} />
            <Text style={[styles.text, { color: theme.foreground, flex: 1 }]}>{w.name}</Text>
            <Text style={[styles.text, { color: theme.muted }]}>
              {w.startTime}–{w.endTime}
            </Text>
          </View>
        ))}
        <Text style={[styles.note, { color: theme.muted }]}>Windows, goals and tasks are edited on the desktop. Times are in {settings.timezone}.</Text>
      </Section>

      {__DEV__ && Platform.OS === 'web' && (
        <Section theme={theme} title="Development">
          <Button
            theme={theme}
            label="Load a demo plan"
            onPress={async () => {
              loadDemoPlan();
              app.changed();
            }}
          />
        </Section>
      )}

      {busy && <ActivityIndicator />}
      {problem && <Text style={[styles.text, { color: theme.danger }]}>{problem}</Text>}
      <Text style={[styles.note, { color: theme.muted, textAlign: 'center' }]}>TimeBlock for Android · device {device.device}</Text>
    </ScrollView>
  );
}

function Section({ theme, title, children }: { theme: Theme; title: string; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.foreground }]}>{title}</Text>
      {children}
    </View>
  );
}

function Button({
  theme,
  label,
  onPress,
  primary,
  disabled,
}: {
  theme: Theme;
  label: string;
  onPress(): Promise<void>;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => void onPress()}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: theme.accent } : { borderWidth: 1, borderColor: theme.border },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: primary ? '#fff' : theme.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({ theme, label, value, onChange, color }: { theme: Theme; label: string; value: boolean; onChange(on: boolean): void; color?: string }) {
  return (
    <View style={styles.inline}>
      {color && <View style={[styles.swatch, { backgroundColor: color }]} />}
      <Text style={[styles.text, { color: theme.foreground, flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12, gap: 12 },
  section: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  text: { fontSize: 14, lineHeight: 19 },
  note: { fontSize: 12, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: '600' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  button: { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' },
  buttonText: { fontWeight: '700', fontSize: 14 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
});
