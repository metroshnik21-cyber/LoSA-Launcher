import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Gamepad2, Plus, RefreshCw, Trash2, ShieldCheck, FolderOpen, Play, AlertCircle } from "lucide-react";

type BedrockInfo = {
  installed: boolean; version: string | null; packageFamilyName: string | null;
  worldsPath: string | null; behaviorPacksPath: string | null; resourcePacksPath: string | null; message: string;
};
type BedrockProfile = { id: string; name: string; createdAt: number; lastPlayedAt: number | null };

export function BedrockManager() {
  const [info, setInfo] = useState<BedrockInfo | null>(null);
  const [profiles, setProfiles] = useState<BedrockProfile[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    setBusy(true); setError("");
    try {
      const [status, saved] = await Promise.all([
        invoke<BedrockInfo>("detect_bedrock_installation"),
        invoke<BedrockProfile[]>("list_bedrock_instances")
      ]);
      setInfo(status); setProfiles(saved);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const create = async () => {
    if (!name.trim()) { setError("Введи название профиля."); return; }
    try {
      const item = await invoke<BedrockProfile>("create_bedrock_instance", { name: name.trim() });
      setProfiles(current => [item, ...current]); setName(""); setError("");
      setNotice("Профиль Bedrock создан. Он использует общую установку Minecraft Bedrock и общие игровые данные.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const launch = async (profile: BedrockProfile) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await invoke("launch_bedrock", { instanceId: profile.id });
      setNotice("Команда запуска Minecraft Bedrock передана Windows.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const remove = async (profile: BedrockProfile) => {
    try {
      await invoke("delete_bedrock_instance", { instanceId: profile.id });
      setProfiles(current => current.filter(item => item.id !== profile.id));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return <div className="bedrock-hub">
    <div className="bedrock-banner"><div className="bedrock-mark"><Gamepad2 size={30}/></div><div><span className="panel-kicker">ОТДЕЛЬНОЕ ИЗДАНИЕ</span><h2>Bedrock Edition</h2><p>Отдельные профили и запуск официальной Minecraft Bedrock для Windows.</p></div><button className="outline bedrock-refresh" onClick={() => void refresh()} disabled={busy}><RefreshCw size={14}/> Проверить</button></div>
    <div className={info?.installed ? "bedrock-install-state is-installed" : "bedrock-install-state"}>
      {info?.installed ? <ShieldCheck size={18}/> : <AlertCircle size={18}/>}
      <div><b>{info?.installed ? "Minecraft Bedrock обнаружен" : "Проверка установки Bedrock"}</b><span>{info?.installed ? `Версия ${info.version} · ${info.packageFamilyName}` : (info?.message ?? "Проверяем Microsoft Store…")}</span></div>
    </div>
    {info?.installed && <div className="bedrock-paths">
      <div><FolderOpen size={14}/><span><b>Миры</b><small>{info.worldsPath}</small></span></div>
      <div><FolderOpen size={14}/><span><b>Аддоны</b><small>{info.behaviorPacksPath}</small></span></div>
      <div><FolderOpen size={14}/><span><b>Ресурспаки</b><small>{info.resourcePacksPath}</small></span></div>
    </div>}
    <div className="community-panel bedrock-profiles">
      <div className="panel-heading"><div><b>Профили Bedrock</b><small>Сохранённые профили запуска</small></div><span className="bedrock-count">{profiles.length}</span></div>
      <div className="bedrock-create"><input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Например, Выживание" onKeyDown={e => { if (e.key === "Enter") void create(); }}/><button className="primary" onClick={() => void create()}><Plus size={14}/> Создать профиль</button></div>
      {profiles.length === 0 ? <p className="bedrock-empty">Пока нет профилей. Создай первый — он появится здесь.</p> : <div className="bedrock-profile-list">{profiles.map(profile => <div className="bedrock-profile" key={profile.id}><div className="bedrock-profile-icon"><Gamepad2 size={19}/></div><div className="bedrock-profile-copy"><b>{profile.name}</b><small>Bedrock · создан {new Date(profile.createdAt * 1000).toLocaleDateString("ru-RU")}</small></div><button className="primary" disabled={busy || !info?.installed} onClick={() => void launch(profile)}><Play size={14}/> Играть</button><button className="icon-button" title="Удалить профиль" onClick={() => void remove(profile)}><Trash2 size={15}/></button></div>)}</div>}
    </div>
    <div className="prototype-note"><ShieldCheck size={16}/> Сейчас профили сохраняются отдельно, но используют одну официальную установку Bedrock и общие миры, настройки и дополнения. Изоляция папок и переключение отдельных наборов аддонов будут следующим этапом. Установка Bedrock выполняется через Microsoft Store.</div>
    {error && <div className="bedrock-message error">{error}</div>}
    {notice && <div className="bedrock-message">{notice}</div>}
  </div>;
}
