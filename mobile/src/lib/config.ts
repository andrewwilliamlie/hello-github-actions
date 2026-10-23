import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "hausjo.serverUrl";

/** Build-time default (EXPO_PUBLIC_SERVER_URL in mobile/.env), overridable in the in-app settings. */
export const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "";

export function normalizeServerUrl(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`;
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export async function getServerUrl(): Promise<string | null> {
  const saved = await AsyncStorage.getItem(KEY);
  return normalizeServerUrl(saved ?? DEFAULT_SERVER_URL);
}

export async function setServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEY, url);
}
