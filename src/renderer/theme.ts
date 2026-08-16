export type AppearanceMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const appearanceStorageKey = "a3-manager:appearance";

const allowedAppearanceModes = new Set<AppearanceMode>([
  "system",
  "light",
  "dark",
]);

export function readAppearancePreference(): AppearanceMode {
  try {
    const stored = window.localStorage.getItem(appearanceStorageKey);
    return isAppearanceMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function persistAppearancePreference(mode: AppearanceMode): void {
  try {
    window.localStorage.setItem(appearanceStorageKey, mode);
  } catch {
    // A preferência visual continua funcional na sessão atual mesmo sem storage.
  }
}

export function resolveAppearance(mode: AppearanceMode): ResolvedTheme {
  if (mode === "light" || mode === "dark") {
    return mode;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyAppearance(mode: AppearanceMode): ResolvedTheme {
  const resolved = resolveAppearance(mode);
  const root = document.documentElement;
  root.dataset.appearance = mode;
  root.dataset.theme = resolved;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  return resolved;
}

export function onSystemAppearanceChange(listener: () => void): () => void {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!media) return () => undefined;

  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function isAppearanceMode(value: string | null): value is AppearanceMode {
  return Boolean(value && allowedAppearanceModes.has(value as AppearanceMode));
}
