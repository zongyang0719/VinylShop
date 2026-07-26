import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mazy.vinylshop",
  appName: "唱片库",
  webDir: "dist/mobile",

  ios: {
    // CSS owns the safe-area padding. Automatic inset would apply it twice.
    contentInset: "never",
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
