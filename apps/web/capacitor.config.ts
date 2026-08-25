import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.justus.watchparty',
  appName: 'JustUS',
  webDir: 'out',
  overrideUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  server: {
    url: 'https://just-us-web.vercel.app',
    cleartext: true,
    allowNavigation: [
      '*.netflix.com',
      '*.primevideo.com',
      '*.amazon.com',
      '*.livekit.cloud',
      '*.supabase.co',
      'just-us-web.vercel.app',
      '*'
    ],
  },
  ios: {
    allowsLinkPreview: false,
    scrollEnabled: true,
    contentInset: 'always',
    preferredContentMode: 'desktop',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
