import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { ComponentType, Ref } from "react";
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import type { WebViewProps } from "react-native-webview/lib/WebView";
import type { ShouldStartLoadRequest, WebViewErrorEvent, WebViewHttpErrorEvent } from "react-native-webview/lib/WebViewTypes";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getServerUrl } from "../lib/config";
import { INJECTED_BRIDGE } from "../lib/bridge";
import { colors } from "../lib/theme";

// The component is a forwardRef at runtime (goBack/reload via ref), but its published typings
// declare a plain FunctionComponent without `ref`; this alias restores the ref prop.
type WebViewHandle = { goBack: () => void; reload: () => void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

type BridgeMessage =
  | { type: "download-start" }
  | { type: "download"; name: string; mime: string; base64: string }
  | { type: "download-error"; message: string }
  | { type: "print-unsupported" };

export default function PortalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const web = useRef<WebViewHandle>(null);
  const [serverUrl, setServerUrl] = useState<string | null | undefined>(undefined);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Re-read the server URL whenever we come back from the settings screen.
  useFocusEffect(
    useCallback(() => {
      getServerUrl().then((url) => {
        setLoadError(null);
        setServerUrl(url);
      });
    }, []),
  );

  useEffect(() => {
    if (serverUrl === null) router.push("/settings");
  }, [serverUrl, router]);

  // Android hardware back navigates inside the portal first.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        web.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  // Links outside the portal (WhatsApp share, OpenStreetMap, mailto:, tel:) open in their own apps.
  const onShouldStart = (req: ShouldStartLoadRequest) => {
    if (!serverUrl) return false;
    if (req.url.startsWith(serverUrl) || req.url === "about:blank" || req.url.startsWith("data:") || req.url.startsWith("blob:")) return true;
    Linking.openURL(req.url).catch(() => flash("Tidak dapat membuka tautan"));
    return false;
  };

  const onMessage = async (e: WebViewMessageEvent) => {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(e.nativeEvent.data) as BridgeMessage;
    } catch {
      return;
    }
    if (msg.type === "download-start") flash("Menyiapkan berkas…");
    if (msg.type === "download-error") flash(`Unduhan gagal: ${msg.message}`);
    if (msg.type === "print-unsupported") flash("Cetak tidak tersedia di aplikasi — gunakan Bagikan/Unduh atau buka di browser");
    if (msg.type === "download") {
      try {
        const safeName = msg.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "download";
        const file = new File(Paths.cache, safeName);
        file.create({ overwrite: true });
        await file.write(msg.base64, { encoding: "base64" });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: msg.mime, dialogTitle: safeName });
        else flash(`Tersimpan: ${safeName}`);
      } catch (err) {
        flash(`Tidak dapat menyimpan berkas: ${(err as Error).message}`);
      }
    }
  };

  if (serverUrl === undefined) {
    return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.sky} /></View>;
  }

  if (!serverUrl || loadError) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
        <Text style={styles.title}>Tidak dapat terhubung</Text>
        <Text style={styles.body}>{loadError ?? "Server belum diatur."}</Text>
        {serverUrl ? <Text style={styles.mono}>{serverUrl}</Text> : null}
        <View style={styles.row}>
          {serverUrl ? (
            <Pressable style={styles.button} onPress={() => { setLoadError(null); web.current?.reload(); }}>
              <Text style={styles.buttonText}>Coba lagi</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.button, styles.secondary]} onPress={() => router.push("/settings")}>
            <Text style={[styles.buttonText, styles.secondaryText]}>Ubah server</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        ref={web}
        key={serverUrl}
        source={{ uri: `${serverUrl}/login` }}
        style={styles.fill}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        domStorageEnabled
        javaScriptEnabled
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={() => <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator color={colors.sky} size="large" /></View>}
        injectedJavaScriptBeforeContentLoaded={INJECTED_BRIDGE}
        injectedJavaScript={INJECTED_BRIDGE}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        onNavigationStateChange={(s: WebViewNavigation) => setCanGoBack(s.canGoBack)}
        onError={(e: WebViewErrorEvent) => setLoadError(`${e.nativeEvent.description || "Kesalahan jaringan"}. Pastikan ponsel dan komputer berada di jaringan Wi-Fi yang sama dan server berjalan.`)}
        onHttpError={(e: WebViewHttpErrorEvent) => { if (e.nativeEvent.statusCode >= 500) flash(`Server error ${e.nativeEvent.statusCode}`); }}
        onContentProcessDidTerminate={() => web.current?.reload()}
        onRenderProcessGone={() => web.current?.reload()}
      />
      <Pressable accessibilityLabel="Pengaturan server" onPress={() => router.push("/settings")} onLongPress={() => web.current?.reload()} style={[styles.fab, { bottom: insets.bottom + 16 }]}>
        <Text style={styles.fabText}>⚙︎</Text>
      </Pressable>
      {notice ? <View style={[styles.toast, { bottom: insets.bottom + 72 }]}><Text style={styles.toastText}>{notice}</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#ffffff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.navy },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  body: { color: colors.skyMuted, fontSize: 14, textAlign: "center", marginBottom: 8 },
  mono: { color: "#fff", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), marginBottom: 20 },
  row: { flexDirection: "row", gap: 12 },
  button: { backgroundColor: colors.sky, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: colors.navy, fontWeight: "700" },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.sky },
  secondaryText: { color: colors.sky },
  fab: { position: "absolute", right: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(11,27,66,0.55)", alignItems: "center", justifyContent: "center" },
  fabText: { color: "#fff", fontSize: 18 },
  toast: { position: "absolute", left: 16, right: 16, backgroundColor: colors.navy, padding: 12, borderRadius: 12 },
  toastText: { color: "#fff", textAlign: "center" },
});
