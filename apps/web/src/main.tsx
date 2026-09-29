import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { MantineProvider, createTheme } from "@mantine/core";
import "@mantine/core/styles.css";
import { router } from "./router";
import { I18nProvider } from "./i18n";
import { registerServiceWorker } from "./sw/cacheStatus";
import { queueStore } from "./queue/instance";
import { migrateFromParcela } from "./data/rename";
import { migrateLegacyStores } from "./local/db";
import { gursStore } from "./local/instance";

registerServiceWorker();

const theme = createTheme({ primaryColor: "teal", fontFamily: "Inter, system-ui, -apple-system, sans-serif", defaultRadius: "md" });

// quota lives in IndexedDB now (migrated from localStorage once); load it before the first render
void migrateFromParcela().then(() => migrateLegacyStores(gursStore).catch((e) => console.warn("store migration failed", e))).then(() => queueStore.hydrate()).catch(() => undefined).then(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </MantineProvider>
  </StrictMode>,
));
