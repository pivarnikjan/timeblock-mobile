import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { EVENT_COLORS } from '@timeblock/core/calendar/categories';
import { removeCategory, saveCategory } from '@timeblock/core/operations/events';
import { getCategory } from '@timeblock/core/store/categories';
import { env } from '@/env';
import { useApp } from '@/state/app';
import { useTheme } from '@/theme';
import { Body, Button, confirm, Field, Note, Section, TextField, ui } from '@/ui';
import { useLoad } from '@/use-load';

/** Google's eleven event colours: what a category can look like in Google too. */
const PALETTE = Object.values(EVENT_COLORS);

interface Draft {
  name: string;
  color: string;
  keywords: string;
}

/**
 * Add or edit an event category: its name, colour and title words — the
 * desktop's Settings → Categories, one at a time. Params: `id` to edit.
 */
export default function CategoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const app = useApp();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = params.id ? Number(params.id) : null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const { data } = useLoad(async () => {
    const existing = editing ? await getCategory(env().db, editing) : null;
    return { existing, missing: editing !== null && !existing };
  }, [editing]);

  if (!data) return <View style={{ flex: 1, backgroundColor: theme.background }} />;
  if (data.missing) {
    return (
      <View style={[ui.screen, { flex: 1, backgroundColor: theme.background }]}>
        <Body tone="muted">This category no longer exists — it may have been deleted on the desktop.</Body>
      </View>
    );
  }

  const form = draft ?? { name: data.existing?.name ?? '', color: data.existing?.color ?? '#616161', keywords: data.existing?.keywords ?? '' };
  const set = (patch: Partial<Draft>) => setDraft({ ...form, ...patch });

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await saveCategory(env(), form, editing ?? undefined);
      if (!result.ok) return setProblem(result.message);
      app.changed();
      if (result.warning) setWarning(result.warning);
      else router.back();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: editing ? 'Edit category' : 'Add a category' }} />
      <Section>
        <Field label="Name">
          <TextField value={form.name} onChangeText={(name) => set({ name })} placeholder="e.g. Traveling" />
        </Field>
        <Field label="Colour" hint="The colour its events have here, on the desktop, and in Google Calendar.">
          <View style={ui.wrap}>
            {PALETTE.map(({ name, hex }) => {
              const chosen = form.color.toLowerCase() === hex.toLowerCase();
              return (
                <Pressable
                  key={hex}
                  onPress={() => set({ color: hex })}
                  accessibilityRole="radio"
                  accessibilityLabel={name}
                  accessibilityState={{ selected: chosen }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: hex,
                    borderWidth: chosen ? 3 : 0,
                    borderColor: theme.foreground,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {chosen && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
          {!PALETTE.some((c) => c.hex.toLowerCase() === form.color.toLowerCase()) && (
            <Note>Its colour now ({form.color}) was set on the desktop; tap one above to change it.</Note>
          )}
        </Field>
        <Field label="Title words (one per line)" hint="An event whose title contains one of them gets this category; case and accents don't matter.">
          <TextField
            value={form.keywords}
            onChangeText={(keywords) => set({ keywords })}
            multiline
            placeholder={'e.g. škôlky\nletisko'}
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />
        </Field>
        <Button label={editing ? 'Save' : 'Add'} primary busy={busy} onPress={save} />
        {problem && <Body tone="bad">{problem}</Body>}
        {warning && (
          <>
            <Note tone="warn">{warning}</Note>
            <Button label="Done" onPress={() => router.back()} />
          </>
        )}
      </Section>

      {editing && (
        <Button
          label="Delete category"
          danger
          disabled={busy}
          onPress={async () => {
            if (!(await confirm('Delete this category?', 'Its events go back to the other categories’ title words, and lose its colour in Google.', 'Delete'))) return;
            setBusy(true);
            const warn = await removeCategory(env(), editing).catch((e: Error) => e.message);
            app.changed();
            setBusy(false);
            if (warn) setWarning(warn);
            else router.back();
          }}
        />
      )}
    </ScrollView>
  );
}
