import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Gamepad2, RefreshCw, ShieldCheck, AlertCircle, Play, LoaderCircle, Plus, Trash2 } from "lucide-react";

type BedrockInfo = {
  installed: boolean;
  version: string | null;
  packageFamilyName: string | null;
  worldsPath: string | null;
  behaviorPacksPath: string | null;
  resourcePacksPath: string | null;
  message: string;
};
type BedrockProfile = { id: string; name: string; createdAt: number; lastPlayedAt: number | null };

type Props = { profileName: string };

export function BedrockManager({ profileName }: Props) {
  const [info, setInfo] = useState<BedrockInfo | null>(null);
  const [profiles, setProfiles] = useState<BedrockProfile[]>([]);
  const [checking, setChecking] = useState(true);
  const [creating, setCreating] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    setChecking(true);
    setError("");
    try {
      const [status, saved] = await Promise.all([
        invoke<BedrockInfo>("detect_bedrock_installation"),
        invoke<BedrockProfile[]>("list_bedrock_instances")
      ]);
      setInfo(status);
      setProfiles(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const create = async () => {
    const cleanName = profileName.trim();
    if (!cleanName) {
      setError("Сначала укажи название профиля в поле выше.");
      return;
    }
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const item = await invoke<BedrockProfile>("create_bedrock_instance", { name: cleanName });
      setProfiles(current => [item, ...current]);
      setNotice("Профиль Bedrock создан. Миры и игровые данные остаются в официальной установке Minecraft.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const launch = async (profile: BedrockProfile) => {
    setLaunchingId(profile.id);
    setError("");
    setNotice("");
    try {
      await invoke("launch_bedrock", { instanceId: profile.id });
      setProfiles(current => current.map(item => item.id === profile.id ? { ...item, lastPlayedAt: Math.floor(Date.now() / 1000) } : item));
      setNotice("Запрос на запуск Minecraft Bedrock отправлен Windows.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunchingId(null);
    }
  };

  const remove = async (profile: BedrockProfile) => {
    try {
      await invoke("delete_bedrock_instance", { instanceId: profile.id });
      setProfiles(current => current.filter(item => item.id !== profile.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return <section className="bedrock-hub bedrock-simple">
    <div className="bedrock-banner">
      <div className="bedrock-mark"><Gamepad2 size={30}/></div>
      <div className="bedrock-banner-copy">
        <span className="panel-kicker">ИЗДАНИЕ MINECRAFT</span>
        <h2>Bedrock Edition</h2>
        <p>Понятный запуск официальной игры через L.o.S.A.</p>
      </div>
      <button className="outline bedrock-refresh" onClick={() => void refresh()} disabled={checking || creating || launchingId !== null} title="Проверить установку">
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
        <b>Новый профиль</b>
        <p>Использует установленную игру и её миры. Название берётся из поля «Название сборки» выше.</p>
      </div>
      <button className="primary bedrock-launch-button" disabled={!info?.installed || checking || creating || !profileName.trim()} onClick={() => void create()}>
        {creating ? <><LoaderCircle size={15} className="spin"/> Создаём…</> : <><Plus size={15}/> Создать профиль</>}
      </button>
    </div>

    <div className="community-panel bedrock-profiles">
      <div className="panel-heading"><div><b>Профили Bedrock</b><small>Выбери профиль и нажми «Играть»</small></div><span className="bedrock-count">{profiles.length}</span></div>
      {profiles.length === 0 ? <p className="bedrock-empty">Пока нет профилей. Введи название выше и создай первый.</p> : <div className="bedrock-profile-list">{profiles.map(profile => <div className="bedrock-profile" key={profile.id}>
        <div className="bedrock-profile-icon"><Gamepad2 size={18}/></div>
        <div className="bedrock-profile-copy"><b>{profile.name}</b><small>Bedrock · {profile.lastPlayedAt ? "последний запуск " + new Date(profile.lastPlayedAt * 1000).toLocaleDateString("ru-RU") : "ещё не запускался"}</small></div>
        <button className="primary" disabled={!info?.installed || checking || launchingId !== null} onClick={() => void launch(profile)}>
          {launchingId === profile.id ? <><LoaderCircle size={14} className="spin"/> Запуск…</> : <><Play size={14}/> Играть</>}
        </button>
        <button className="icon-button" title="Удалить профиль" onClick={() => void remove(profile)}><Trash2 size={15}/></button>
      </div>)}</div>}
    </div>

    <p className="bedrock-footnote">L.o.S.A. использует твою официальную установку Minecraft Bedrock и не скачивает игровые файлы.</p>
    {error && <div className="bedrock-message error">{error}</div>}
    {notice && <div className="bedrock-message">{notice}</div>}
  </section>;
}
