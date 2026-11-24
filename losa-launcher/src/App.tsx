import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

const logoGlyphs = [
  "⚔", "⛏", "🛡", "💎", "🔥", "❄", "⚡",
  "♜", "♞", "♟", "◆", "◇", "✦", "✧",
  "☀", "☾", "☘", "♣", "♠", "♥", "♦",
  "⚒", "⚙", "⌘", "⌬", "✪", "✺", "✹",
  "▲", "▼", "◈", "⬟", "⬢", "✵", "✷",
  "☠", "☯", "♛", "♚", "⚑", "⚒", "⛨",
  "🌙", "🌿", "🪨", "🌀", "🌋", "🌊", "🌌"
];
const logoPalettes = [
  ["#293c4b", "#8dc8e8"], ["#49382a", "#e1b36b"], ["#35463d", "#a9d5b0"], ["#3e3454", "#c4a7f2"], ["#542f2a", "#ff9a69"], ["#294653", "#9de4ed"], ["#4b4325", "#f3d66f"],
  ["#303b58", "#a9b9f5"], ["#4b3c2d", "#e7bd86"], ["#444444", "#d6d6d6"], ["#4a3340", "#e8a8c4"], ["#29433e", "#9bd8c0"], ["#4a3d59", "#d0b7f2"], ["#3e4650", "#c6d6e8"]
];
const avatarData = (index: number) => {
  const glyph = logoGlyphs[index % logoGlyphs.length];
  const palette = logoPalettes[index % logoPalettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges"><rect width="64" height="64" rx="8" fill="${palette[0]}"/><path d="M8 8h48v48H8z" fill="none" stroke="${palette[1]}" stroke-width="3"/><path d="M13 13h38v38H13z" fill="none" stroke="${palette[1]}" stroke-opacity=".35" stroke-width="2"/><text x="32" y="43" text-anchor="middle" font-size="34" font-family="Segoe UI Symbol,Apple Symbols,sans-serif" fill="${palette[1]}">${glyph}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const asMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const dateLabel = (timestamp?: number | null) => timestamp
  ? new Date(timestamp * 1000).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })
  : "Ещё не запускалась";

export default function App() {
  const [page, setPage] = useState<Page>("Главная");
  const [appBooting, setAppBooting] = useState(true);
  const startupStarted = useRef(false);
  const [startupStatus, setStartupStatus] = useState("Загружаем игровой центр…");
  const [buildPreparation, setBuildPreparation] = useState<Record<string, { status: "preparing" | "ready" | "error"; message: string }>>({});
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem("losa.accentColor") ?? "#d8bd64");
  const [theme, setTheme] = useState<"dark" | "light">(() => localStorage.getItem("losa.theme") === "light" ? "light" : "dark");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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
  useEffect(() => { localStorage.setItem("losa.theme", theme); }, [theme]);

  const loadInstances = async () => {
    setLoadingInstances(true);
    try { const loaded = await invoke<LauncherInstance[]>("list_instances"); setInstances(loaded); return loaded; }
    catch (e) { setError(asMessage(e)); return []; }
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

  useEffect(() => {
    if (startupStarted.current) return;
    startupStarted.current = true;
    const boot = async () => {
      const [savedInstances] = await Promise.all([loadInstances(), loadVersions()]);
      const uniqueVersions = [...new Map(savedInstances.map(instance => [instance.versionId, instance])).values()];
      for (let index = 0; index < uniqueVersions.length; index += 1) {
        const instance = uniqueVersions[index];
        const sameVersionIds = savedInstances.filter(item => item.versionId === instance.versionId).map(item => item.id);
        setStartupStatus(`Проверяем сборку ${index + 1} из ${uniqueVersions.length}: ${instance.name}`);
        setBuildPreparation(current => {
          const next = { ...current };
          sameVersionIds.forEach(id => { next[id] = { status: "preparing", message: "Проверяем файлы, библиотеки, ресурсы и Java…" }; });
          return next;
        });
        try {
          await invoke("prepare_instance", { instanceId: instance.id });
          setBuildPreparation(current => {
            const next = { ...current };
            sameVersionIds.forEach(id => { next[id] = { status: "ready", message: "Всё готово к запуску" }; });
            return next;
          });
        } catch (e) {
          const message = asMessage(e);
          setBuildPreparation(current => {
            const next = { ...current };
            sameVersionIds.forEach(id => { next[id] = { status: "error", message }; });
            return next;
          });
        }
      }
      setStartupStatus("Игровой центр готов");
      setAppBooting(false);
    };
    void boot().catch(e => { setError(asMessage(e)); setAppBooting(false); });
  }, []);

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
      setBuildPreparation(current => ({ ...current, [instance.id]: { status: "ready", message: "Всё готово к запуску" } }));
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
      const launch = () => invoke<number>("launch_minecraft", {
        versionId: instance.versionId, instanceId: instance.id, authMode: "offline", offlineName
      });
      let pid: number;
      try {
        // Обычный запуск не должен повторно сканировать и проверять все установленные файлы.
        // launch_minecraft сам проверяет Java и наличие обязательных компонентов.
        pid = await launch();
      } catch (firstError) {
        const message = asMessage(firstError);
        const recoverable = /не найдена библиотека|не найден native-файл|клиентский JAR|клиент Minecraft .* не установлен|сначала установи клиент/i.test(message);
        if (!recoverable) throw firstError;
        setNotice("Обнаружены недостающие файлы. Восстанавливаем сборку…");
        await invoke("prepare_instance", { instanceId: instance.id });
        pid = await launch();
      }
      setNotice("Minecraft запускается — загрузка игрового меню может занять некоторое время. PID: " + pid);
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

  const IconPicker = ({ selected, onSelect }: { selected: number | null; onSelect: (index: number) => void }) => <div className="avatar-picker" role="group" aria-label="Варианты логотипа сборки">{logoGlyphs.map((_, index) => <button type="button" key={index} className={selected === index ? "avatar-option selected" : "avatar-option"} onClick={() => onSelect(index)} aria-label={"Логотип " + (index + 1)} title={"Вариант " + (index + 1)}><img src={avatarData(index)} alt="" /></button>)}</div>;

  const BuildCard = ({ instance }: { instance: LauncherInstance }) => {
    const expanded = expandedId === instance.id;
    const preparation = buildPreparation[instance.id];
    return <article className="build-card">
      <div className="build-card-top" onClick={() => setExpandedId(expanded ? null : instance.id)} role="button" tabIndex={0}
        onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) setExpandedId(expanded ? null : instance.id); }}>
        <div className="build-logo">{instance.iconDataUrl ? <img src={instance.iconDataUrl} alt="" /> : <span>{instance.name.slice(0, 1).toUpperCase()}</span>}</div>
        <div className="build-summary"><b>{instance.name}</b><small>Minecraft {instance.versionId} · Java Edition · Vanilla</small>{preparation && <small className={"build-preparation " + preparation.status} title={preparation.message}>{preparation.status === "ready" ? "✓ " : preparation.status === "error" ? "! " : "◌ "}{preparation.message}</small>}</div>
        <span className="build-last-played">{dateLabel(instance.lastPlayedAt)}</span>
        <button className="primary build-play" disabled={busyId === instance.id} onClick={event => { event.stopPropagation(); void launchBuild(instance); }}>
          {busyId === instance.id ? <LoaderCircle size={15} className="spin" /> : <Play size={15} fill="currentColor" />} Играть
        </button>
        <ChevronDown size={17} className={expanded ? "build-chevron open" : "build-chevron"} />
      </div>
      <div className={expanded ? "build-details expanded" : "build-details"} aria-hidden={!expanded}>
        <div className="build-details-inner">
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
        </div>
      </div>
    </article>;
  };

  return <div className={"app-shell theme-" + theme} style={{ "--accent": accentColor } as CSSProperties}>
    {appBooting && <div className="startup-screen" role="status" aria-label="Загрузка L.o.S.A.">
      <img className="startup-logo" src="/losa-logo.png" alt="Логотип L.o.S.A." />
      <div className="startup-progress"><span /></div>
      <p>{startupStatus}</p>
    </div>}
    <aside className="sidebar">
      <div className="brand"><img src="/losa-logo.png" /><div><b>L.o.S.A.</b></div></div>
      <div className="profile-wrap" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProfileMenuOpen(false); }}>
        <button type="button" className="profile" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen(open => !open)}><div className="avatar">{(offlineName || "Г").slice(0, 1).toUpperCase()}</div><div className="profile-copy"><b>{offlineName || "Гость"}</b><span>Локальный Offline-профиль</span></div><ChevronDown size={15} className={profileMenuOpen ? "profile-chevron open" : "profile-chevron"} /></button>
        {profileMenuOpen && <div className="profile-menu" role="menu"><div className="profile-menu-heading"><b>{offlineName || "Гость"}</b><span>Локальный профиль</span></div><button type="button" role="menuitem" onClick={() => { setPage("Настройки"); setProfileMenuOpen(false); }}>Настройки профиля</button></div>}
      </div>
      <div className="nav-label">БИБЛИОТЕКА</div>
      <nav>{nav.map(({ name, icon: Icon }) => <button key={name} className={page === name ? "nav-item selected" : "nav-item"} onClick={() => setPage(name)}><Icon size={18} /><span>{name}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="status-dot" /> Offline-режим <span className="version">v0.10.3</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">L.o.S.A. <span>/</span> {page}</div><button className="icon-button" title="Справка" onClick={() => setNotice("L.o.S.A. 0.10.3 — улучшения интерфейса и запуска.")}><CircleHelp size={18} /></button></header>
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
        <div className="settings-card appearance-card"><div className="settings-heading"><div className="quick-icon"><Sparkles /></div><div><b>Внешний вид лаунчера</b><small>Тема и акцентный цвет сохраняются автоматически</small></div></div><label className="field-label">Тема интерфейса</label><div className="theme-options"><button type="button" className={theme === "dark" ? "theme-option active" : "theme-option"} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Тёмная</button><button type="button" className={theme === "light" ? "theme-option active" : "theme-option"} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Светлая</button></div><label className="field-label" htmlFor="losa-accent-color">Акцентный цвет</label><div className="accent-controls"><input id="losa-accent-color" className="accent-input" type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} /><span className="muted small">Цвет кнопок, выделений и значков.</span><button className="outline" onClick={() => setAccentColor("#d8bd64")}>Сбросить</button></div></div>
        <div className="settings-card offline-profile-card"><div className="settings-heading"><div className="quick-icon"><Gamepad2 /></div><div><b>Локальный профиль (Offline)</b><small>Вход по игровому нику для локального тестирования</small></div><span className={offlineName ? "connected" : "disconnected"}>{offlineName ? "Активен" : "Не выбран"}</span></div><label className="field-label" htmlFor="offline-player-name">Игровой ник</label><input id="offline-player-name" className="wide-input" value={offlineNameDraft} onChange={e => setOfflineNameDraft(e.target.value)} maxLength={16} placeholder="Например, Steve_123" /><p className="muted small">От 3 до 16 символов: латинские буквы, цифры и подчёркивание.</p><button className="primary" onClick={saveOfflineProfile}>Сохранить локальный профиль</button></div>
      </section>}
      {page !== "Главная" && page !== "Играть" && page !== "Настройки" && <section className="content empty-page"><div className="empty-icon">{page === "Друзья" ? <Users /> : page === "Моды и сборки" ? <Layers3 /> : <Server />}</div><div className="eyebrow">L.o.S.A. · В РАЗРАБОТКЕ</div><h1>{page}</h1><p>{page === "Друзья" ? "Здесь появятся список друзей, приглашения и совместные лобби." : page === "Моды и сборки" ? "Здесь появится каталог модов и управление ими." : "Здесь появятся избранные серверы и быстрые подключения."}</p><span className="coming">Этот раздел запланирован для следующих этапов</span></section>}
      {(error || notice) && <div className={error ? "toast error-toast" : "toast"} onClick={() => { setError(""); setNotice(""); }}>{error || notice}<button aria-label="Закрыть">×</button></div>}
      <footer><span>© 2026 L.o.S.A.</span></footer>
    </main>
  </div>;
}
