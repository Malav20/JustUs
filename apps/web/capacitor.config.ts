import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.justus.watchparty',
  appName: 'JustUS',
  webDir: 'out',
  server: {
    url: 'https://just-us-web.vercel.app',
    cleartext: true,
    allowNavigation: [
      '*.netflix.com',
      '*.primevideo.com',
      '*.amazon.com',
      '*.livekit.cloud',
      '*.supabase.co',
      'just-us-web.vercel.app'
    ],
  },
  ios: {
    allowsLinkPreview: false,
    scrollEnabled: true,
    contentInset: 'always',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
