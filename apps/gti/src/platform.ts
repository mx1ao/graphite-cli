import type { ThemeColor } from "./theme";
import type { Disposable, PlatformName } from "./types";

import { browserPlatform } from "./BrowserPlatform";
import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";

export type InitialParamKeys = "token" | string;

/**
 * Platform-specific API for each target: vscode extension, electron standalone, browser, ...
 */
export interface Platform {
  platformName: PlatformName;
  confirm(message: string, details?: string): Promise<boolean>;
  openFile(path: RepoRelativePath): void;
  openExternalLink(url: string): void;
  clipboardCopy(value: string): void;

  theme?: {
    getTheme(): ThemeColor;
    onDidChangeTheme(callback: (theme: ThemeColor) => unknown): Disposable;
  };
}

declare global {
  interface Window {
    gtiPlatform?: Platform;
  }
}

// Non-browser platforms are defined by setting window.gtiPlatform
// before the main GTI script loads.
const foundPlatform = window.gtiPlatform ?? browserPlatform;
window.gtiPlatform = foundPlatform;

export default foundPlatform;