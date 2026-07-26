import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mazy.vinylshop",
  appName: "唱片库",
  webDir: "dist/client",

  // In production, load from deployed Cloudflare Workers URL.
  // Comment this out and run `npx cap sync` to use embedded local assets instead.
  server: {
    url: "https://mazys-record-library.chatplus-3746.chatgpt.site/",
    // Allow cleartext for local dev (`http://localhost:3000`):
    androidScheme: "https",
  },

  ios: {
    // Full-screen immersive layout
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "唱片库",
    backgroundColor: "#1c1c1e",
  },

  plugins: {
    Haptics: {
      // Use selection feedback for scroll crossing events
    },
  },
};

export default config;
