import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0b1b42" } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" options={{ presentation: "modal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
