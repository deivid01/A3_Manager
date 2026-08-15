/// <reference types="vite/client" />

import type { A3Api } from "../shared/contracts";

declare global {
  interface Window {
    a3: A3Api;
  }
}
