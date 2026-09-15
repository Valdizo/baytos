import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.baytos.app',
  appName: 'Baytos',
  webDir: 'out',
  android: {
    // Dev only: the WebView serves the app from https://localhost, so calls to the
    // plain-HTTP dev backend (http://10.0.2.2:4000) are blocked as mixed content.
    // Remove once the backend is HTTPS. Cleartext itself is debug-only —
    // see android/app/src/debug/AndroidManifest.xml.
    allowMixedContent: true
  }
};

export default config;
