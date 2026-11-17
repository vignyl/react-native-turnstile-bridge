import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import {
  Turnstile,
  TurnstileException,
  TurnstileHeadless,
  useTurnstileController,
  useTurnstileState,
  type TurnstileEvent,
  type TurnstileSize,
  type TurnstileTheme,
} from 'react-native-turnstile-bridge';

// Cloudflare test keys work on any hostname:
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
const TEST_KEYS = [
  { label: 'Always passes', key: '1x00000000000000000000AA' },
  { label: 'Always fails', key: '2x00000000000000000000AB' },
  { label: 'Forces interaction', key: '3x00000000000000000000FF' },
];
const INVISIBLE_TEST_KEY = '1x00000000000000000000BB';
const THEMES: TurnstileTheme[] = ['auto', 'light', 'dark'];
const SIZES: TurnstileSize[] = ['normal', 'compact', 'flexible'];

// With a real key, use a hostname allowed for it in the Cloudflare dashboard.
const BASE_URL = 'https://example.com';

const preview = (token: string) => (token.length <= 32 ? token : `${token.slice(0, 32)}...`);

export default function App() {
  const dark = useColorScheme() === 'dark';
  const colors = dark ? darkColors : lightColors;

  const controller = useTurnstileController();
  const state = useTurnstileState(controller);
  const headless = useTurnstileController();

  const [keyIndex, setKeyIndex] = useState(0);
  const [theme, setTheme] = useState<TurnstileTheme>('auto');
  const [size, setSize] = useState<TurnstileSize>('normal');
  const [log, setLog] = useState<string[]>([]);
  const [headlessResult, setHeadlessResult] = useState<string | null>(null);
  const [headlessBusy, setHeadlessBusy] = useState(false);

  const addLog = (line: string) =>
    setLog((lines) => [`${new Date().toLocaleTimeString()}  ${line}`, ...lines].slice(0, 50));

  const describe = (event: TurnstileEvent): string => {
    switch (event.type) {
      case 'token':
        return `token (${event.token.length} chars)`;
      case 'failed':
        return `failed: ${event.error.code} (${event.error.category})`;
      case 'resized':
        return `resized ${event.width}x${event.height}`;
      case 'loaded':
        return `loaded ${event.widgetId ?? ''}`;
      default:
        return event.type;
    }
  };

  const guard = (action: () => Promise<unknown> | void) => async () => {
    try {
      await action();
    } catch (error) {
      addLog(error instanceof TurnstileException ? `error: ${error.error.code}` : String(error));
    }
  };

  const getInvisibleToken = async () => {
    setHeadlessBusy(true);
    setHeadlessResult(null);
    try {
      setHeadlessResult(`Token: ${preview(await headless.getToken())}`);
    } catch (error) {
      setHeadlessResult(error instanceof TurnstileException ? `Failed: ${error.error.code}` : String(error));
    } finally {
      setHeadlessBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Turnstile Bridge</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          react-native-turnstile-bridge on {Platform.OS}
        </Text>

        <Section title="Test key" colors={colors}>
          <Chips
            values={TEST_KEYS.map((entry) => entry.label)}
            selected={TEST_KEYS[keyIndex]!.label}
            onSelect={(label) => setKeyIndex(TEST_KEYS.findIndex((entry) => entry.label === label))}
            colors={colors}
          />
        </Section>
        <Section title="Theme" colors={colors}>
          <Chips values={THEMES} selected={theme} onSelect={setTheme} colors={colors} />
        </Section>
        <Section title="Size" colors={colors}>
          <Chips values={SIZES} selected={size} onSelect={setSize} colors={colors} />
        </Section>

        <View style={styles.widget}>
          <Turnstile
            controller={controller}
            baseUrl={BASE_URL}
            options={{ siteKey: TEST_KEYS[keyIndex]!.key, theme, size, action: 'example' }}
            onEvent={(event) => addLog(describe(event))}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Status: {state.status}</Text>
          <Text style={{ color: colors.muted }}>
            {state.token ? `Token: ${preview(state.token)}` : state.lastError?.toString() ?? 'No token yet'}
          </Text>
        </View>

        <View style={styles.buttons}>
          <Button label="Reset" onPress={guard(() => controller.reset())} colors={colors} />
          <Button label="Remove" onPress={guard(() => controller.remove())} colors={colors} />
          <Button label="Render" onPress={guard(() => controller.render())} colors={colors} />
          <Button
            label="getResponse"
            onPress={guard(async () => addLog(`getResponse: ${await controller.getResponse()}`))}
            colors={colors}
          />
          <Button label="Destroy" onPress={guard(() => controller.destroy())} colors={colors} />
          <Button label="Recreate" onPress={guard(() => controller.recreate())} colors={colors} />
        </View>

        <Section title="Headless (invisible key)" colors={colors}>
          <View style={styles.row}>
            <Button
              label={headlessBusy ? 'Working...' : 'Get invisible token'}
              onPress={getInvisibleToken}
              disabled={headlessBusy}
              colors={colors}
              primary
            />
            {headlessResult ? <Text style={[styles.flex, { color: colors.text }]}>{headlessResult}</Text> : null}
          </View>
        </Section>

        <Section title="Events" colors={colors}>
          {log.map((line, index) => (
            <Text key={`${index}-${line}`} style={[styles.logLine, { color: colors.muted }]}>
              {line}
            </Text>
          ))}
        </Section>
      </ScrollView>

      <TurnstileHeadless controller={headless} baseUrl={BASE_URL} options={{ siteKey: INVISIBLE_TEST_KEY }} />
    </View>
  );
}

type Colors = typeof lightColors;

const lightColors = {
  background: '#FFF8F3',
  card: '#FDEBDD',
  chip: '#F6DCC8',
  chipSelected: '#B85C10',
  text: '#2B1A0E',
  muted: '#6B5444',
  onPrimary: '#FFFFFF',
};

const darkColors: Colors = {
  background: '#1B130D',
  card: '#2C2018',
  chip: '#3A2A1F',
  chipSelected: '#F08A2B',
  text: '#F7E9DE',
  muted: '#C9B3A3',
  onPrimary: '#1B130D',
};

function Section({ title, colors, children }: { title: string; colors: Colors; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Chips<T extends string>({
  values,
  selected,
  onSelect,
  colors,
}: {
  values: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  colors: Colors;
}) {
  return (
    <View style={styles.row}>
      {values.map((value) => {
        const active = value === selected;
        return (
          <Pressable
            key={value}
            onPress={() => onSelect(value)}
            style={[styles.chip, { backgroundColor: active ? colors.chipSelected : colors.chip }]}
          >
            <Text style={{ color: active ? colors.onPrimary : colors.text }}>{value}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Button({
  label,
  onPress,
  colors,
  disabled,
  primary,
}: {
  label: string;
  onPress: () => void;
  colors: Colors;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        { backgroundColor: primary ? colors.chipSelected : colors.chip, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text style={{ color: primary ? colors.onPrimary : colors.text }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingTop: 56, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { marginTop: -8 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  widget: { alignItems: 'center', minHeight: 70, justifyContent: 'center' },
  card: { padding: 12, borderRadius: 12, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  logLine: { fontSize: 12, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  flex: { flex: 1 },
});
