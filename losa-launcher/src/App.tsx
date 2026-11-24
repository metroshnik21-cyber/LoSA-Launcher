import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Home, Gamepad2, Users, Layers3, Server, Settings, Plus, Play, ChevronDown, Sparkles, ShieldCheck, CircleHelp, Trash2, Pencil, X, LoaderCircle } from "lucide-react";
import { getMinecraftVersions, type MinecraftVersion } from "./lib/minecraft";
import { invoke } from "@tauri-apps/api/core";

type Page = "Главная" | "Играть" | "Друзья" | "Моды и сборки" | "Серверы" | "Настройки";
type LauncherInstance = {
  id: string; name: string; versionId: string; loader: string;
  iconDataUrl?: string | null; createdAt: number; lastPlayedAt?: number | null;
};
const nav: { name: Page; icon: typeof Home }[] = [
  { name: "Главная", icon: Home }, { name: "Играть", icon: Gamepad2 }, { name: "Друзья", icon: Users },
  { name: "Моды и сборки", icon: Layers3 }, { name: "Серверы", icon: Server }, { name: "Настройки", icon: Settings }
];

const avatarPalettes = Array.from({ length: 49 }, (_, i) => ({
  skin: ["#e7b58a", "#c98b63", "#f0c9a0", "#9b654b", "#d9a078", "#f2d2b5", "#b97852"][i % 7],
  hair: ["#4b3027", "#302a25", "#8b512d", "#d8a34c", "#5b6570", "#25252b", "#a34e37"][Math.floor(i / 7)],
  shirt: ["#347c55", "#477da8", "#a64b49", "#8d65a6", "#d4a33d", "#4c555b", "#d5d8d2"][i % 7],
  bg: ["#b8a18c", "#d5bd83", "#8c9a9e", "#b77b75", "#6e8c63", "#c6c6b4", "#a9a1bd"][Math.floor(i / 7)]
}));
const avatarData = (index: number) => {
  const p = avatarPalettes[index % avatarPalettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" shape-rendering="crispEdges"><rect width="48" height="48" fill="${p.bg}"/><rect x="7" y="5" width="34" height="13" fill="${p.hair}"/><rect x="5" y="12" width="7" height="23" fill="${p.hair}"/><rect x="36" y="12" width="7" height="23" fill="${p.hair}"/><rect x="11" y="12" width="26" height="23" fill="${p.skin}"/><rect x="15" y="20" width="5" height="5" fill="#28282a"/><rect x="29" y="20" width="5" height="5" fill="#28282a"/><rect x="20" y="29" width="9" height="3" fill="#874d45"/><rect x="8" y="36" width="32" height="12" fill="${p.shirt}"/><rect x="5" y="43" width="38" height="5" fill="#25282b"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const asMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const dateLabel = (timestamp?: number | null) => timestamp
  ? new Date(timestamp * 1000).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })
  : "Ещё не запускалась";

export default function App() {
  const [page, setPage] = useState<Page>("Главная");
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem("losa.accentColor") ?? "#d8bd64");
  const [offlineName, setOfflineName] = useState(() => localStorage.getItem("losa.offlineName") ?? "");
  const [offlineNameDraft, setOfflineNameDraft] = useState(() => localStorage.getItem("losa.offlineName") ?? "");
  const [instances, setInstances] = useState<LauncherInstance[]>([]);
  const [versions, setVersions] = useState<MinecraftVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState("1.21.4");
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [newIconIndex, setNewIconIndex] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [editIconIndex, setEditIconIndex] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { localStorage.setItem("losa.accentColor", accentColor); }, [accentColor]);

  const loadInstances = async () => {
    setLoadingInstances(true);
    try { setInstances(await invoke<LauncherInstance[]>("list_instances")); }
    catch (e) { setError(asMessage(e)); }
    finally { setLoadingInstances(false); }
  };

  const loadVersions = async () => {
    setVersionsLoading(true);
    try {
      const manifest = await getMinecraftVersions();
      const releases = manifest.versions.filter(v => v.type === "release").slice(0, 100);
      setVersions(releases);
      setSelectedVersion(current => releases.some(v => v.id === current) ? current : manifest.latest.release);
    } catch (e) { setError(asMessage(e)); }
    finally { setVersionsLoading(false); }
  };

  useEffect(() => { void loadInstances(); void loadVersions(); }, []);

  const recentInstances = useMemo(
    () => [...instances].sort((a, b) => (b.lastPlayedAt ?? b.createdAt) - (a.lastPlayedAt ?? a.createdAt)).slice(0, 5),
    [instances]
  );

  const saveOfflineProfile = () => {
    const name = offlineNameDraft.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      setError("Ник должен содержать 3–16 символов: латинские буквы, цифры или _.");
      return;
    }
    localStorage.setItem("losa.offlineName", name);
    setOfflineName(name);
    setNotice("Локальный профиль сохранён.");
  };

  const createBuild = async () => {
    if (!newName.trim()) { setError("Укажи название сборки."); return; }
    setCreating(true); setError("");
    try {
      const instance = await invoke<LauncherInstance>("create_instance", {
        name: newName.trim(), versionId: selectedVersion, loader: "vanilla", iconDataUrl: newIcon ?? (newIconIndex === null ? null : avatarData(newIconIndex))
      });
      setInstances(current => [instance, ...current]);
      setExpandedId(instance.id);
      setShowCreate(false);
      setNewName(""); setNewIcon(null); setNewIconIndex(null);
      setNotice("Сборка создана. LoSA автоматически подготавливает Minecraft, библиотеки, ресурсы и Java.");
      await invoke("prepare_instance", { instanceId: instance.id });
      setNotice("Сборка полностью подготовлена. Можно играть.");
      await loadInstances();
    } catch (e) {
      setError(asMessage(e));
      await loadInstances();
    } finally { setCreating(false); }
  };

  const launchBuild = async (instance: LauncherInstance) => {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(offlineName)) {
      setNotice("Сначала создай локальный профиль в настройках.");
      setPage("Настройки");
      return;
    }
    setBusyId(instance.id); setError("");
    try {
      // Восстановление выполняется автоматически только если проверка обнаружила недостающие файлы.
      await invoke("prepare_instance", { instanceId: instance.id });
      const pid = await invoke<number>("launch_minecraft", {
        versionId: instance.versionId, instanceId: instance.id, authMode: "offline", offlineName
      });
      setNotice("Minecraft запускается. PID процесса: " + pid);
      await loadInstances();
    } catch (e) { setError(asMessage(e)); }
    finally { setBusyId(null); }
  };

  const beginEdit = (instance: LauncherInstance) => {
    setEditingId(instance.id); setEditName(instance.name); setEditIcon(null); setEditIconIndex(null);
  };

  const saveEdit = async (instance: LauncherInstance) => {
    try {
      const updated = await invoke<LauncherInstance>("update_instance", {
        instanceId: instance.id, name: editName.trim(), iconDataUrl: editIcon
      });
      setInstances(current => current.map(item => item.id === updated.id ? updated : item));
      setEditingId(null);
      setNotice("Изменения сборки сохранены.");
    } catch (e) { setError(asMessage(e)); }
  };

  const removeBuild = async (instance: LauncherInstance) => {
    if (!window.confirm("Удалить сборку «" + instance.name + "» из списка? Игровые файлы и миры останутся на диске.")) return;
    try {
      await invoke("delete_instance", { instanceId: instance.id });
      setInstances(current => current.filter(item => item.id !== instance.id));
      if (expandedId === instance.id) setExpandedId(null);
      setNotice("Сборка удалена из списка. Игровые файлы сохранены.");
    } catch (e) { setError(asMessage(e)); }
  };

  const IconPicker = ({ selected, onSelect }: { selected: number | null; onSelect: (index: number) => void }) => <div className="avatar-picker" role="group" aria-label="Варианты логотипа сборки">{avatarPalettes.map((_, index) => <button type="button" key={index} className={selected === index ? "avatar-option selected" : "avatar-option"} onClick={() => onSelect(index)} aria-label={"Логотип " + (index + 1)} title={"Вариант " + (index + 1)}><img src={avatarData(index)} alt="" /></button>)}</div>;

  const BuildCard = ({ instance }: { instance: LauncherInstance }) => {
    const expanded = expandedId === instance.id;
    return <article className="build-card">
      <div className="build-card-top" onClick={() => setExpandedId(expanded ? null : instance.id)} role="button" tabIndex={0}
        onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) setExpandedId(expanded ? null : instance.id); }}>
        <div className="build-logo">{instance.iconDataUrl ? <img src={instance.iconDataUrl} alt="" /> : <span>{instance.name.slice(0, 1).toUpperCase()}</span>}</div>
        <div className="build-summary"><b>{instance.name}</b><small>Minecraft {instance.versionId} · Java Edition · Vanilla</small></div>
        <span className="build-last-played">{dateLabel(instance.lastPlayedAt)}</span>
        <button className="primary build-play" disabled={busyId === instance.id} onClick={event => { event.stopPropagation(); void launchBuild(instance); }}>
          {busyId === instance.id ? <LoaderCircle size={15} className="spin" /> : <Play size={15} fill="currentColor" />} Играть
        </button>
        <ChevronDown size={17} className={expanded ? "build-chevron open" : "build-chevron"} />
      </div>
      <div className={expanded ? "build-details expanded" : "build-details"} aria-hidden={!expanded} inert={!expanded}>
        {editingId === instance.id ? <div className="edit-build">
          <label>Название сборки<input value={editName} maxLength={40} onChange={e => setEditName(e.target.value)} /></label>
          <label className="field-label">Логотип сборки</label><IconPicker selected={editIconIndex} onSelect={index => { setEditIconIndex(index); setEditIcon(null); }} />
          {(editIcon || editIconIndex !== null) && <img className="edit-preview" src={editIcon ?? avatarData(editIconIndex!)} alt="Новый логотип" />}
          <div className="detail-actions"><button className="primary" onClick={() => void saveEdit(instance)}>Сохранить</button><button className="outline" onClick={() => setEditingId(null)}>Отмена</button></div>
        </div> : <>
          <div className="detail-grid"><div><small>Версия игры</small><b>{instance.versionId}</b></div><div><small>Платформа</small><b>Java Edition</b></div><div><small>Загрузчик</small><b>Vanilla</b></div><div><small>Последний запуск</small><b>{dateLabel(instance.lastPlayedAt)}</b></div></div>
          <p className="muted small">Папка миров и настроек этой сборки хранится отдельно. Клиент, библиотеки, ресурсы и Java подготавливаются автоматически.</p>
          <div className="detail-actions"><button className="outline" onClick={() => beginEdit(instance)}><Pencil size={14} /> Изменить</button><button className="outline danger-action" onClick={() => void removeBuild(instance)}><Trash2 size={14} /> Удалить</button></div>
        </>}
      </div>}
    </article>;
  };

  return <div className="app-shell" style={{ "--accent": accentColor } as CSSProperties}>
    <aside className="sidebar">
      <div className="brand"><img src="/losa-logo.png" /><div><b>L.o.S.A.</b><span>LAUNCHER OF SPARK ANVIL</span></div></div>
      <div className="profile"><div className="avatar">{(offlineName || "Г").slice(0, 1).toUpperCase()}</div><div className="profile-copy"><b>{offlineName || "Гость"}</b><span>Локальный Offline-профиль</span></div><ChevronDown size={15} /></div>
      <div className="nav-label">БИБЛИОТЕКА</div>
      <nav>{nav.map(({ name, icon: Icon }) => <button key={name} className={page === name ? "nav-item selected" : "nav-item"} onClick={() => setPage(name)}><Icon size={18} /><span>{name}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="status-dot" /> Offline-режим <span className="version">v0.10.0</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">L.o.S.A. <span>/</span> {page}</div><button className="icon-button" title="Справка" onClick={() => setNotice("L.o.S.A. 0.10.0 — обновлённый игровой центр и управление сборками.")}><CircleHelp size={18} /></button></header>
      {page === "Главная" && <section className="content">
        {instances.length === 0 ? <div className="hero"><div className="hero-copy"><div className="eyebrow"><Sparkles size={14} /> ВАШ MINECRAFT. ВАШИ ПРАВИЛА.</div><h1>Добро пожаловать<br /><em>в L.o.S.A.</em></h1><p>Создай первую сборку — LoSA сама подготовит игровые файлы и Java.</p><button className="primary" onClick={() => { setPage("Играть"); setShowCreate(true); }}><Plus size={16} /> Создать первую сборку</button></div><img className="hero-mark" src="/losa-logo.png" /></div>
        : <><div className="page-title"><div className="eyebrow">ТВОЙ ИГРОВОЙ ЦЕНТР</div><h1>С возвращением</h1><p>Недавно запускавшиеся сборки и быстрый переход к игре.</p></div><div className="section-head"><div><h2>Недавняя активность</h2><p>Сборки отсортированы по последнему запуску</p></div><button className="outline" onClick={() => { setPage("Играть"); setShowCreate(true); }}><Plus size={15} /> Новая сборка</button></div><div className="build-list">{recentInstances.map(instance => <BuildCard key={instance.id} instance={instance} />)}</div></>}
        <div className="quick-grid home-quick"><button className="quick-card" onClick={() => setPage("Играть")}><div className="quick-icon"><Layers3 /></div><b>Мои сборки</b><span>{instances.length} сохранено</span></button><button className="quick-card" onClick={() => setPage("Друзья")}><div className="quick-icon"><Users /></div><b>Друзья</b><span>Раздел готовится</span></button><button className="quick-card" onClick={() => setPage("Серверы")}><div className="quick-icon"><Server /></div><b>Серверы</b><span>Раздел готовится</span></button></div>
        <div className="notice"><ShieldCheck size={18} /><span><b>Локальные данные</b><br />Сборки сохраняются на этом компьютере. История миров и серверов появится после реализации соответствующих игровых разделов.</span></div>
      </section>}
      {page === "Играть" && <section className="content narrow">
        <div className="page-title"><div className="eyebrow">ИГРОВОЙ ЦЕНТР</div><h1>Мои сборки</h1><p>Каждая сборка хранит собственное имя, логотип, версию и папку игровых данных.</p></div>
        {instances.length > 0 && <div className="build-list">{instances.map(instance => <BuildCard key={instance.id} instance={instance} />)}</div>}
        {showCreate ? <div className="settings-card create-build-panel">
          <div className="settings-heading"><div className="quick-icon"><Plus /></div><div><b>Новая сборка</b><small>Выбери название, логотип и версию — остальное сделает LoSA</small></div><button className="icon-button" onClick={() => setShowCreate(false)}><X size={18} /></button></div>
          <label className="field-label">Название сборки</label><input className="wide-input" value={newName} maxLength={40} onChange={e => setNewName(e.target.value)} placeholder="Например, Выживание с друзьями" />
          <label className="field-label">Версия Minecraft</label><select className="wide-input" value={selectedVersion} onChange={e => setSelectedVersion(e.target.value)}>{versions.map(v => <option key={v.id} value={v.id}>{v.id}</option>)}</select>
          <label className="field-label">Логотип сборки</label><IconPicker selected={newIconIndex} onSelect={index => { setNewIconIndex(index); setNewIcon(null); }} />
          {(newIcon || newIconIndex !== null) && <img className="edit-preview" src={newIcon ?? avatarData(newIconIndex!)} alt="Предпросмотр логотипа" />}
          <p className="muted small">Сейчас доступны Java Edition и Vanilla. Загрузчики модов будут подключены отдельным этапом. Во время создания автоматически загружаются клиент, библиотеки, ресурсы и подходящая Java.</p>
          <button className="primary create-submit" disabled={creating || versionsLoading || versions.length === 0} onClick={() => void createBuild()}>{creating ? <><LoaderCircle size={15} className="spin" /> Подготавливаем сборку…</> : "Создать сборку"}</button>
        </div> : <button className="outline add-build" onClick={() => setShowCreate(true)}><Plus size={17} /> Создать сборку</button>}
        {loadingInstances && <p className="muted small">Загружаем сохранённые сборки…</p>}
      </section>}
      {page === "Настройки" && <section className="content narrow"><div className="page-title"><div className="eyebrow">АККАУНТ И ПРИЛОЖЕНИЕ</div><h1>Настройки</h1><p>Локальный профиль и внешний вид L.o.S.A.</p></div>
        <div className="settings-card appearance-card"><div className="settings-heading"><div className="quick-icon"><Sparkles /></div><div><b>Внешний вид лаунчера</b><small>Акцентный цвет применяется сразу и сохраняется</small></div></div><label className="field-label" htmlFor="losa-accent-color">Акцентный цвет</label><div className="accent-controls"><input id="losa-accent-color" className="accent-input" type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} /><span className="muted small">Цвет кнопок, выделений и значков.</span><button className="outline" onClick={() => setAccentColor("#d8bd64")}>Сбросить</button></div></div>
        <div className="settings-card offline-profile-card"><div className="settings-heading"><div className="quick-icon"><Gamepad2 /></div><div><b>Локальный профиль (Offline)</b><small>Вход по игровому нику для локального тестирования</small></div><span className={offlineName ? "connected" : "disconnected"}>{offlineName ? "Активен" : "Не выбран"}</span></div><label className="field-label" htmlFor="offline-player-name">Игровой ник</label><input id="offline-player-name" className="wide-input" value={offlineNameDraft} onChange={e => setOfflineNameDraft(e.target.value)} maxLength={16} placeholder="Например, Steve_123" /><p className="muted small">От 3 до 16 символов: латинские буквы, цифры и подчёркивание.</p><button className="primary" onClick={saveOfflineProfile}>Сохранить локальный профиль</button></div>
      </section>}
      {page !== "Главная" && page !== "Играть" && page !== "Настройки" && <section className="content empty-page"><div className="empty-icon">{page === "Друзья" ? <Users /> : page === "Моды и сборки" ? <Layers3 /> : <Server />}</div><div className="eyebrow">L.o.S.A. · В РАЗРАБОТКЕ</div><h1>{page}</h1><p>{page === "Друзья" ? "Здесь появятся список друзей, приглашения и совместные лобби." : page === "Моды и сборки" ? "Здесь появится каталог модов и управление ими." : "Здесь появятся избранные серверы и быстрые подключения."}</p><span className="coming">Этот раздел запланирован для следующих этапов</span></section>}
      {(error || notice) && <div className={error ? "toast error-toast" : "toast"} onClick={() => { setError(""); setNotice(""); }}>{error || notice}<button aria-label="Закрыть">×</button></div>}
      <footer><span>© 2026 L.o.S.A. · Launcher of Spark Anvil</span><span>Сделано Spark_Anvil</span></footer>
    </main>
  </div>;
}
