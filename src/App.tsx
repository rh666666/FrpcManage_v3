import { useEffect, useState } from "preact/hooks";
import { listen } from "@tauri-apps/api/event";
import "./styles/index.scss";
import type { FrpcInstance, Settings, ThemeId, ViewId } from "./types";
import AppShell from "./components/layout/AppShell";
import { processApi, settingsApi } from "./lib/tauri";
import { applyTheme, normalizeTheme } from "./lib/theme";

function App() {
  const [view, setView] = useState<ViewId>("run");
  const [instances, setInstances] = useState<FrpcInstance[]>([]);
  const [settings, setSettings] = useState<Settings>({});

  useEffect(() => {
    settingsApi
      .get()
      .then((next) => {
        setSettings(next);
        applyTheme(normalizeTheme(next.theme));
      })
      .catch((e) => console.error("加载设置失败", e));
  }, []);

  useEffect(() => {
    processApi
      .list()
      .then(setInstances)
      .catch((e) => {
        console.error("加载实例失败", e);
        setInstances([]);
      });

    const unlistenPromise = listen<FrpcInstance[]>("instance-changed", (event) => {
      setInstances(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const saveFrpcPath = async (path: string | null) => {
    try {
      const next =
        path == null ? await settingsApi.clearFrpcPath() : await settingsApi.setFrpcPath(path);
      setSettings(next);
    } catch (e) {
      console.error("保存 frpc 路径失败", e);
      throw e;
    }
  };

  const saveTheme = async (theme: ThemeId) => {
    try {
      const next = await settingsApi.setTheme(theme);
      setSettings(next);
      applyTheme(normalizeTheme(next.theme));
    } catch (e) {
      console.error("保存主题失败", e);
      throw e;
    }
  };

  return (
    <AppShell
      view={view}
      onNavigate={setView}
      frpcPath={settings.frpcPath ?? null}
      theme={normalizeTheme(settings.theme)}
      onSaveFrpcPath={saveFrpcPath}
      onSaveTheme={saveTheme}
      instances={instances}
    />
  );
}

export default App;
