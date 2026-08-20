import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.a3locacao.a3manager",
  appName: "A3 Manager",
  webDir: "dist/renderer",
  android: {
    path: "android",
  },
};

export default config;
