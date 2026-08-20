import { Capacitor } from "@capacitor/core";
import { createAndroidA3Api } from "./androidA3Api";

export type RendererPlatform = "desktop" | "android" | "web";

const platformDataKey = "a3Platform";

export function ensureRendererPlatform(): RendererPlatform {
  if (window.a3) {
    return setRendererPlatform("desktop");
  }

  const nativePlatform = Capacitor.getPlatform();
  if (nativePlatform === "android") {
    window.a3 = createAndroidA3Api();
    return setRendererPlatform("android");
  }

  window.a3 = createAndroidA3Api();
  return setRendererPlatform("web");
}

export function getRendererPlatform(): RendererPlatform {
  const current = document.documentElement.dataset[platformDataKey];
  if (current === "android" || current === "web") {
    return current;
  }
  return "desktop";
}

function setRendererPlatform(platform: RendererPlatform): RendererPlatform {
  document.documentElement.dataset[platformDataKey] = platform;
  return platform;
}
