import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Gamepad2, RefreshCw, ShieldCheck, AlertCircle, Play, LoaderCircle } from "lucide-react";

type BedrockInfo = {
  installed: boolean;
  version: string | null;
  packageFamilyName: string | null;
  worldsPath: string | null;
  behaviorPacksPath: string | null;
  resourcePacksPath: string | null;
  message: string;
};

export function BedrockManager() {
  const [info, setInfo] = useState<BedrockInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    setChecking(true);
    setError("");
    try {
      const status = await invoke<BedrockInfo>("detect_bedrock_installation");
      setInfo(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const launch = async () => {
    setLaunching(true);
    setError("");
    setNotice("");
    try {
      await invoke("launch_bedrock");
      setNotice("Запрос на запуск Minecraft Bedrock отправлен Windows.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
      await refresh();
    }
  };

  return <section className="bedrock-hub bedrock-simple">
    <div className="bedrock-banner">
      <div className="bedrock-mark"><Gamepad2 size={30}/></div>
      <div className="bedrock-banner-copy">
        <span className="panel-kicker">ИЗДАНИЕ MINECRAFT</span>
        <h2>Bedrock Edition</h2>
        <p>Запуск установленной игры прямо из L.o.S.A.</p>
      </div>
      <button className="outline bedrock-refresh" onClick={() => void refresh()} disabled={checking || launching} title="Проверить установку">
        <RefreshCw size={14}/> Проверить
      </button>
    </div>

    <div className={info?.installed ? "bedrock-install-state is-installed" : "bedrock-install-state"}>
      {info?.installed ? <ShieldCheck size={19}/> : <AlertCircle size={19}/>}
      <div>
        <b>{checking ? "Проверяем Minecraft Bedrock…" : info?.installed ? "Minecraft Bedrock найден" : "Minecraft Bedrock не найден"}</b>
        <span>{checking ? "Проверяем официальную установку Windows" : info?.installed ? `Версия ${info.version}` : (info?.message ?? "Не удалось проверить установку.")}</span>
      </div>
    </div>

    <div className="bedrock-launch-panel">
      <div>
        <b>Готов к игре?</b>
        <p>{info?.installed ? "L.o.S.A. откроет установленный Minecraft Bedrock." : "Установи Minecraft Bedrock через Microsoft Store, затем нажми «Проверить»."}</p>
      </div>
      <button className="primary bedrock-launch-button" disabled={!info?.installed || checking || launching} onClick={() => void launch()}>
        {launching ? <><LoaderCircle size={15} className="spin"/> Запускаем…</> : <><Play size={15}/> Играть</>}
      </button>
    </div>

    <p className="bedrock-footnote">L.o.S.A. не скачивает и не подменяет файлы игры: используется твоя официальная установка Minecraft Bedrock.</p>
    {error && <div className="bedrock-message error">{error}</div>}
    {notice && <div className="bedrock-message">{notice}</div>}
  </section>;
}
