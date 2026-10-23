import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEFAULT_SERVER_URL, getServerUrl, normalizeServerUrl, setServerUrl } from "../lib/config";
import { colors } from "../lib/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getServerUrl().then((u) => setValue(u ?? DEFAULT_SERVER_URL));
  }, []);

  const save = async () => {
    const url = normalizeServerUrl(value);
    if (!url) return setError("Masukkan alamat server, mis. http://192.168.1.20:3000");
    setError(null);
    setStatus("Memeriksa koneksi…");
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(`${url}/api/health`, { signal: ctrl.signal });
      clearTimeout(t);
      const body = (await res.json().catch(() => ({}))) as { status?: string };
      if (!res.ok || body.status !== "ok") throw new Error(`Server menjawab ${res.status}`);
    } catch (e) {
      setStatus(null);
      return setError(`Tidak dapat menjangkau ${url}/api/health (${(e as Error).message}). Simpan tetap? Tekan lagi untuk menyimpan tanpa pemeriksaan.`);
    }
    await setServerUrl(url);
    setStatus(null);
    router.back();
  };

  const saveAnyway = async () => {
    const url = normalizeServerUrl(value);
    if (!url) return;
    await setServerUrl(url);
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.brand}>HAUSJO AGENT NETWORK</Text>
      <Text style={styles.title}>Alamat server</Text>
      <Text style={styles.body}>
        Jalankan aplikasi web di komputer Anda dengan <Text style={styles.code}>npm run dev:lan</Text>, lalu masukkan alamat yang ditampilkan
        (IP komputer di jaringan Wi-Fi yang sama, port 3000). Bisa juga alamat HTTPS server yang sudah di-deploy.
      </Text>
      <TextInput
        value={value}
        onChangeText={(v) => { setValue(v); setError(null); }}
        placeholder="http://192.168.1.20:3000"
        placeholderTextColor="#7f8db0"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={save}
        style={styles.input}
        accessibilityLabel="Alamat server"
      />
      {status ? <Text style={styles.status}>{status}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.row}>
        <Pressable style={styles.button} onPress={error?.includes("Simpan tetap") ? saveAnyway : save}>
          <Text style={styles.buttonText}>{error?.includes("Simpan tetap") ? "Simpan tanpa memeriksa" : "Simpan & hubungkan"}</Text>
        </Pressable>
        {router.canGoBack() ? (
          <Pressable style={[styles.button, styles.secondary]} onPress={() => router.back()}>
            <Text style={[styles.buttonText, styles.secondaryText]}>Batal</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.footnote}>Akun demo: budi@agent.test · kata sandi Hausjo#Demo2026. Data demo bukan transaksi nyata.</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy, paddingHorizontal: 24 },
  brand: { color: colors.sky, fontWeight: "800", letterSpacing: 1, marginBottom: 24 },
  title: { color: "#fff", fontSize: 24, fontWeight: "800", marginBottom: 8 },
  body: { color: colors.skyMuted, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  code: { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), color: "#fff" },
  input: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.navy },
  status: { color: colors.skyMuted, marginTop: 10 },
  error: { color: "#ffb4ab", marginTop: 10 },
  row: { flexDirection: "row", gap: 12, marginTop: 20 },
  button: { backgroundColor: colors.sky, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: colors.navy, fontWeight: "700" },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.sky },
  secondaryText: { color: colors.sky },
  footnote: { color: "#7f8db0", fontSize: 12, marginTop: "auto" },
});
