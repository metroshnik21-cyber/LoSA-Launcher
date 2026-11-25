import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Home, Gamepad2, Users, Layers3, Server, Settings, Plus, Play, ChevronDown, Sparkles, ShieldCheck, CircleHelp, Trash2, Pencil, X, LoaderCircle, MessageCircle, Store, Crown, Search, Send, Heart, Globe, Shield, Cpu, HardDrive, ArrowUpRight } from "lucide-react";
import { getMinecraftVersions, type MinecraftVersion } from "./lib/minecraft";
import { invoke } from "@tauri-apps/api/core";
import { checkModCompatibility, type ModrinthVersionInfo } from "./lib/mod-compatibility";
import { BedrockManager } from "./components/BedrockManager";

type Page = "Главная" | "Играть" | "Лобби" | "Друзья" | "Чат" | "Магазин" | "Моды и сборки" | "Серверы" | "Настройки";
type LauncherInstance = {
  id: string; name: string; versionId: string; loader: string;
  iconDataUrl?: string | null; createdAt: number; lastPlayedAt?: number | null;
};
const nav: { name: Page; icon: typeof Home }[] = [
  { name: "Главная", icon: Home }, { name: "Играть", icon: Gamepad2 }, { name: "Лобби", icon: Users },
  { name: "Серверы", icon: Server }, { name: "Чат", icon: MessageCircle }, { name: "Магазин", icon: Store },
 { name: "Друзья", icon: Users }, { name: "Моды и сборки", icon: Layers3 }, { name: "Настройки", icon: Settings }
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
const accentPresets = [
  { name: "Золото", color: "#d8bd64" },
  { name: "Океан", color: "#65a9d7" },
  { name: "Изумруд", color: "#68b88a" },
  { name: "Лаванда", color: "#a88ae8" },
  { name: "Роза", color: "#e58baa" },
  { name: "Коралл", color: "#e58a62" },
  { name: "Бирюза", color: "#63c7c8" }
];

const dateLabel = (timestamp?: number | null) => timestamp
  ? new Date(timestamp * 1000).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })
  : "Ещё не запускалась";


type ModrinthHit = { project_id: string; slug: string; title: string; description: string; author: string; downloads: number; icon_url?: string; categories: string[]; versions: string[]; project_type: string };

function ModsAndPacks() {
  const [section, setSection] = useState<"mods" | "packs">("mods");
  const [query, setQuery] = useState("");
  const [loader, setLoader] = useState("fabric");
  const [gameVersion, setGameVersion] = useState("1.21.4");
  const [hits, setHits] = useState<ModrinthHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ModrinthHit | null>(null);
  const [versionInfo, setVersionInfo] = useState<ModrinthVersionInfo[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [compatibility, setCompatibility] = useState<ReturnType<typeof checkModCompatibility> | null>(null);
  const search = async () => {
    setLoading(true); setError(""); setSelected(null);
    try {
      const type = section === "packs" ? "modpack" : "mod";
      const facets = JSON.stringify([[ "project_type:" + type ], [ "versions:" + gameVersion ], ...(section === "mods" && loader !== "any" ? [[ "categories:" + loader ]] : [])]);
      const url = "https://api.modrinth.com/v2/search?query=" + encodeURIComponent(query.trim()) + "&facets=" + encodeURIComponent(facets) + "&limit=24&index=relevance";
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Modrinth ответил с ошибкой " + response.status);
      const data = await response.json() as { hits: ModrinthHit[] };
      setHits(data.hits ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void search(); }, [section, gameVersion, loader]);
  useEffect(() => {
    if (!selected) { setVersionInfo([]); setCompatibility(null); return; }
    let active = true;
    setVersionLoading(true);
    const params = new URLSearchParams({ game_versions: JSON.stringify([gameVersion]), loaders: JSON.stringify(loader === "any" ? [] : [loader]) });
    fetch("https://api.modrinth.com/v2/project/" + selected.project_id + "/version?" + params.toString(), { headers: { Accept: "application/json" } })
      .then(response => { if (!response.ok) throw new Error("Не удалось получить версии проекта (" + response.status + ")"); return response.json() as Promise<ModrinthVersionInfo[]>; })
      .then(versions => {
        if (!active) return;
        setVersionInfo(versions);
        const latest = versions[0];
        setCompatibility(latest ? checkModCompatibility(latest, gameVersion, loader, []) : null);
      })
      .catch(() => { if (active) { setVersionInfo([]); setCompatibility(null); } })
      .finally(() => { if (active) setVersionLoading(false); });
    return () => { active = false; };
  }, [selected, gameVersion, loader, section]);
  const formatDownloads = (value: number) => new Intl.NumberFormat("ru-RU", { notation: "compact" }).format(value);
  return <section className="content mods-content">
    <div className="page-title"><div className="eyebrow"><Layers3 size={13}/> L.o.S.A. MOD CENTER</div><h1>Моды и сборки</h1><p>Ищи отдельные моды и готовые наборы. Для каждого проекта можно проверить версию игры и загрузчик.</p></div>
    <div className="mods-switcher">
      <button className={section === "mods" ? "active" : ""} onClick={() => setSection("mods")}>Моды</button>
      <button className={section === "packs" ? "active" : ""} onClick={() => setSection("packs")}>Сборки</button>
    </div>
    <>
      <div className="mods-filters">
        
        <label>Версия Minecraft<select value={gameVersion} onChange={e => setGameVersion(e.target.value)}>{["1.21.11","1.21.10","1.21.9","1.21.8","1.21.7","1.21.6","1.21.5","1.21.4","1.21.3","1.21.1","1.20.6","1.20.4","1.20.1","1.19.4"].map(v => <option key={v}>{v}</option>)}</select></label>
        {section === "mods" && <label>Загрузчик<select value={loader} onChange={e => setLoader(e.target.value)}><option value="fabric">Fabric</option><option value="forge">Forge</option><option value="neoforge">NeoForge</option><option value="quilt">Quilt</option><option value="any">Любой</option></select></label>}
      </div>
      <form className="mods-search" onSubmit={e => { e.preventDefault(); void search(); }}><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={section === "packs" ? "Найти сборку…" : "Найти мод…"} /><button className="primary" type="submit" disabled={loading}>{loading ? "Поиск…" : "Найти"}</button></form>
      {error && <div className="mods-error">{error}</div>}
      {loading ? <div className="mods-empty"><LoaderCircle className="spin"/> Загружаем каталог Modrinth…</div> : hits.length === 0 ? <div className="mods-empty">Ничего не найдено. Попробуй изменить запрос или фильтры.</div> : <div className="mods-grid">{hits.map(hit => <article className="mod-card" key={hit.project_id}>
        <div className="mod-card-head">{hit.icon_url ? <img src={hit.icon_url} alt="" /> : <span><Layers3/></span>}<div><b>{hit.title}</b><small>от {hit.author}</small></div></div>
        <p>{hit.description}</p><div className="mod-meta"><span>{formatDownloads(hit.downloads)} загрузок</span><span>{hit.versions.length} версий</span></div>
        <button className="outline" onClick={() => setSelected(hit)}>Подробнее</button>
      </article>)}</div>}
      {selected && <div className="mod-detail">
        <button className="icon-button" onClick={() => setSelected(null)}><X size={17}/></button><h2>{selected.title}</h2><p>{selected.description}</p>
        <div className="mod-meta"><span>Автор: {selected.author}</span><span>Поддерживаемые версии: {selected.versions.slice(0,8).join(", ")}</span></div>
        <div className="compatibility-result"><b>Проверка совместимости</b>{versionLoading ? <span>Проверяем версии и загрузчик…</span> : compatibility ? <><span className={compatibility.compatible ? "compat-ok" : "compat-bad"}>{compatibility.compatible ? "Подходит для выбранной версии" : "Есть несовместимость"}</span><small>Игра: {compatibility.gameSupported ? "поддерживается" : "не поддерживается"} · Загрузчик: {compatibility.loaderSupported ? "поддерживается" : "не поддерживается"}</small>{compatibility.missingRequired.length > 0 && <small>Обязательные зависимости для установки: {compatibility.missingRequired.map(d => d.project_id).join(", ")}</small>}{compatibility.conflicts.length > 0 && <small>Конфликтующие проекты: {compatibility.conflicts.map(d => d.project_id).join(", ")}</small>}</> : <span>Нет опубликованной версии для выбранных условий.</span>}{versionInfo[0] && <small>Версия проекта: {versionInfo[0].version_number}</small>}</div>
        <a className="outline" href={"https://modrinth.com/" + (section === "packs" ? "modpack/" : "mod/") + selected.slug} target="_blank" rel="noreferrer">Открыть страницу и версии на Modrinth <ArrowUpRight size={14}/></a>
        <p className="mods-footnote">Пока доступен поиск и просмотр каталога. Установка файла в выбранную сборку и автоматическая проверка зависимостей будут подключены следующим техническим шагом — кнопка установки не имитируется.</p>
      </div>}
      <p className="mods-footnote">Источник каталога: Modrinth API. Загрузка и установка отдельных файлов в папку сборки пока не включены.</p>
    </>
  </section>;
}


type SavedServer = { id: string; name: string; address: string; edition: "Java" | "Bedrock"; favorite: boolean };
function ServersPage() {
 const [servers,setServers]=useState<SavedServer[]>(()=>{try{return JSON.parse(localStorage.getItem("losa.customServers")??"[]");}catch{return[];}});
 const [name,setName]=useState(""); const [address,setAddress]=useState(""); const [edition,setEdition]=useState<"Java"|"Bedrock">("Java"); const [query,setQuery]=useState(""); const [filter,setFilter]=useState("Все"); const [formError,setFormError]=useState("");
 useEffect(()=>{localStorage.setItem("losa.customServers",JSON.stringify(servers));},[servers]);
 const addServer=(event:React.FormEvent)=>{event.preventDefault();const n=name.trim();const a=address.trim();if(!n){setFormError("Укажи название сервера.");return;}if(!a||/\s/.test(a)||!/^[a-zA-Z0-9.:-]+$/.test(a)){setFormError("Укажи адрес вида play.example.net или play.example.net:25565.");return;}if(servers.some(s=>s.address.toLowerCase()===a.toLowerCase()&&s.edition===edition)){setFormError("Этот адрес уже добавлен.");return;}setServers(old=>[{id:crypto.randomUUID(),name:n,address:a,edition,favorite:false},...old]);setName("");setAddress("");setFormError("");};
 const visible=servers.filter(s=>(filter==="Все"||(filter==="Избранное"?s.favorite:s.edition===filter))&&(s.name+" "+s.address).toLowerCase().includes(query.toLowerCase()));
 return <section className="content community-content"><div className="page-title"><div className="eyebrow"><Globe size={13}/> SERVER DIRECTORY</div><h1>Серверы</h1><p>Официальные серверы L.o.S.A. появятся в общем каталоге. Свои серверы можно сохранить уже сейчас.</p></div>
 <div className="community-panel server-add-panel"><div className="panel-heading"><div><b>Добавить свой сервер</b><small>Список хранится на этом компьютере</small></div><span className="coming">Локально</span></div><form className="server-add-form" onSubmit={addServer}><label>Название<input value={name} onChange={e=>setName(e.target.value)} placeholder="Сервер друзей" maxLength={40}/></label><label>Адрес<input value={address} onChange={e=>setAddress(e.target.value)} placeholder="play.example.net:25565" maxLength={253}/></label><label>Издание<select value={edition} onChange={e=>setEdition(e.target.value as "Java"|"Bedrock")}><option value="Java">Java Edition</option><option value="Bedrock">Bedrock Edition</option></select></label><button className="primary" type="submit"><Plus size={15}/> Добавить сервер</button></form>{formError&&<p className="server-form-error">{formError}</p>}</div>
 <div className="server-toolbar"><div className="search-field"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по названию или адресу…"/></div><div className="filter-pills">{["Все","Java","Bedrock","Избранное"].map(v=><button key={v} className={filter===v?"active":""} onClick={()=>setFilter(v)}>{v}</button>)}</div></div>
 <div className="server-results-head"><b>Мои серверы</b><span>{servers.length} сохранено</span></div>
 {visible.length?<div className="server-grid">{visible.map(s=><article className="server-card" key={s.id}><div className={"server-card-art "+(s.edition==="Java"?"blue":"purple")}><span>{s.edition==="Java"?"J":"B"}</span><button title="Избранное" className={s.favorite?"favorite active":"favorite"} onClick={()=>setServers(old=>old.map(x=>x.id===s.id?{...x,favorite:!x.favorite}:x))}><Heart size={16} fill={s.favorite?"currentColor":"none"}/></button></div><div className="server-card-body"><div className="server-tags"><span>{s.edition}</span><span>Пользовательский</span></div><h3>{s.name}</h3><p className="server-address">{s.address}</p><div className="server-card-foot"><span className="server-unknown-status">Статус не проверен</span><button className="outline" onClick={()=>navigator.clipboard.writeText(s.address).then(()=>alert("Адрес скопирован")).catch(()=>alert("Адрес сервера: "+s.address))}>Скопировать адрес</button></div><button className="server-remove" onClick={()=>setServers(old=>old.filter(x=>x.id!==s.id))}>Удалить из списка</button></div></article>)}</div>:<div className="community-panel server-empty"><Server size={28}/><b>{servers.length?"Ничего не найдено":"Пока нет сохранённых серверов"}</b><p>{servers.length?"Измени запрос или фильтр.":"Добавь адрес сервера выше."}</p></div>}
 <div className="prototype-note"><ShieldCheck size={16}/> Добавление, удаление, избранное, поиск и сохранение списка работают локально. Проверка онлайна и подключение из карточки будут следующим этапом.</div></section>;
}
function FriendsPage() {
 const [friendId,setFriendId]=useState("");
 return <section className="content community-content"><div className="page-title"><div className="eyebrow"><Users size={13}/> L.o.S.A. SOCIAL</div><h1>Друзья</h1><p>Добавляй игроков по уникальному L.o.S.A. ID, а не только по нику.</p></div>
 <div className="community-panel"><div className="panel-heading"><div><b>Твой аккаунт L.o.S.A.</b><small>Текущий профиль лаунчера</small></div><span className="coming">Offline-профиль</span></div><div className="friends-id-state"><ShieldCheck size={22}/><div><b>Сетевой ID пока не создан</b><p>Локальный игровой ник не является сетевым аккаунтом. Сначала нужно подключить регистрацию и сервер сессий L.o.S.A.</p></div></div></div>
 <div className="community-panel"><div className="panel-heading"><div><b>Добавить друга</b><small>По уникальному идентификатору</small></div></div><form className="friend-id-form" onSubmit={e=>e.preventDefault()}><input value={friendId} onChange={e=>setFriendId(e.target.value)} placeholder="LOSA-7F3A-91C2" disabled/><button className="primary" disabled><Plus size={15}/> Отправить заявку</button></form><p className="friends-backend-note">Заявки пока отключены: без серверных аккаунтов нельзя определить игрока, доставить запрос или синхронизировать друзей. Демонстрационные профили и фальшивые статусы удалены.</p></div>
 <div className="community-panel friends-next-panel"><b>После подключения аккаунтов появятся</b><ul><li>Поиск по уникальному L.o.S.A. ID и точному нику</li><li>Заявки с принятием и отклонением</li><li>Статусы онлайн, офлайн и «не беспокоить»</li><li>Приглашения присоединиться к серверу</li><li>Удаление из друзей и блокировка</li></ul></div>
 <div className="prototype-note"><ShieldCheck size={16}/> Данные друзей не подменяются демонстрационными записями. Для совместного теста с другом следующим этапом подключим API аккаунтов и друзей.</div></section>;
}

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
  const [microsoftProfile, setMicrosoftProfile] = useState<{ id: string; name: string } | null>(null);
  const [microsoftAccounts, setMicrosoftAccounts] = useState<{ id: string; name: string }[]>([]);
  const [microsoftConfigured, setMicrosoftConfigured] = useState(false);
  const [microsoftBusy, setMicrosoftBusy] = useState(false);
  const [microsoftRegistrationBlocked, setMicrosoftRegistrationBlocked] = useState(false);
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
  const [serverQuery, setServerQuery] = useState("");
  const [serverEdition, setServerEdition] = useState<"Все" | "Java" | "Bedrock">("Все");
  const [favoriteServers, setFavoriteServers] = useState<string[]>(["block-haven"]);
  const [chatChannel, setChatChannel] = useState("Общий");
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { id: 1, channel: "Общий", author: "Alex", text: "Всем привет! Кто сегодня играет?", time: "12:42", own: false },
    { id: 2, channel: "Общий", author: "Mira", text: "Я буду вечером, можем зайти на выживание", time: "12:44", own: false },
    { id: 3, channel: "Общий", author: "Steve", text: "Отлично, соберёмся в лобби 🙂", time: "12:47", own: false }
  ]);
  const [privateServerName, setPrivateServerName] = useState("");
  const [privateServerDrafts, setPrivateServerDrafts] = useState<string[]>([]);
  const [storeCategory, setStoreCategory] = useState("Все");
  const [friendQuery, setFriendQuery] = useState("");
  const [selectedEdition, setSelectedEdition] = useState("Java Edition");
  const [selectedLoader, setSelectedLoader] = useState("vanilla");
  const [selectedLanguage, setSelectedLanguage] = useState(() => localStorage.getItem("losa.language") ?? "ru");


  useEffect(() => { localStorage.setItem("losa.accentColor", accentColor); }, [accentColor]);
  useEffect(() => { localStorage.setItem("losa.theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("losa.language", selectedLanguage); }, [selectedLanguage]);

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

  const refreshMicrosoftAccounts = async () => {
    const status = await invoke<{ accounts: { id: string; name: string }[]; activeProfileId: string | null }>("minecraft_auth_status");
    setMicrosoftAccounts(status.accounts);
    setMicrosoftProfile(status.accounts.find(account => account.id === status.activeProfileId) ?? null);
  };

  useEffect(() => {
    void invoke<boolean>("microsoft_auth_configured").then(setMicrosoftConfigured).catch(() => setMicrosoftConfigured(false));
    void refreshMicrosoftAccounts().catch(() => { setMicrosoftAccounts([]); setMicrosoftProfile(null); });
  }, []);

  const beginMicrosoftLogin = async () => {
    setMicrosoftBusy(true); setError("");
    try {
      const profile = await invoke<{ id: string; name: string }>("login_microsoft_browser");
      await refreshMicrosoftAccounts();
      setNotice("Аккаунт Microsoft добавлен: " + profile.name);
    } catch (e) {
      const message = asMessage(e);
      const registrationBlocked = message.toLowerCase().includes("invalid app registration") || message.toLowerCase().includes("client id приложения l.o.s.a.");
      setMicrosoftRegistrationBlocked(registrationBlocked);
      setError(registrationBlocked ? "Minecraft Services пока не разрешает Client ID L.o.S.A. Это ограничение регистрации приложения, а не отсутствие лицензии Java/Bedrock. Нужна официальная регистрация Client ID." : message);
    }
    finally { setMicrosoftBusy(false); }
  };

  const switchMicrosoftAccount = async (profileId: string) => {
    try {
      await invoke("switch_minecraft_account", { profileId });
      await refreshMicrosoftAccounts();
      setNotice("Активный Minecraft-аккаунт переключён.");
    } catch (e) { setError(asMessage(e)); }
  };

  const logoutMicrosoft = async () => {
    if (!microsoftProfile) return;
    try {
      await invoke("logout_minecraft", { profileId: microsoftProfile.id });
      await refreshMicrosoftAccounts();
      setNotice("Microsoft-аккаунт удалён из списка L.o.S.A.");
    } catch (e) { setError(asMessage(e)); }
  };

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
        name: newName.trim(), versionId: selectedVersion, loader: selectedLoader, iconDataUrl: newIcon ?? (newIconIndex === null ? null : avatarData(newIconIndex))
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
    if (!microsoftProfile && !/^[A-Za-z0-9_]{3,16}$/.test(offlineName)) {
      setNotice("Сначала создай локальный профиль в настройках.");
      setPage("Настройки");
      return;
    }
    setBusyId(instance.id); setError("");
    try {
      const launch = () => invoke<number>("launch_minecraft", {
        versionId: instance.versionId, instanceId: instance.id, authMode: microsoftProfile ? "microsoft" : "offline", offlineName
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
      <div className="sidebar-bottom"><div className="status-dot" /> Offline-режим <span className="version">v0.10.21</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">L.o.S.A. <span>/</span> {page}</div><button className="icon-button" title="Справка" onClick={() => setNotice("L.o.S.A. 0.10.20 — справка и поддержка.")}><CircleHelp size={18} /></button></header>
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
          <div className="build-options-grid"><div><label className="field-label">Издание Minecraft</label><select className="wide-input" value={selectedEdition} onChange={e=>setSelectedEdition(e.target.value)}><option value="Java Edition">Java Edition</option><option value="Bedrock Edition">Bedrock Edition</option></select></div>{selectedEdition === "Java Edition" && <div><label className="field-label">Загрузчик</label><select className="wide-input" value={selectedLoader} onChange={e=>setSelectedLoader(e.target.value)}><option value="vanilla">Vanilla</option><option value="fabric" disabled>Fabric — скоро</option><option value="forge" disabled>Forge — скоро</option><option value="neoforge" disabled>NeoForge — скоро</option><option value="quilt" disabled>Quilt — скоро</option></select></div>}</div>
          {selectedEdition === "Bedrock Edition" ? <BedrockManager /> : <>
            <label className="field-label">Версия Minecraft</label><select className="wide-input" value={selectedVersion} onChange={e => setSelectedVersion(e.target.value)}>{versions.map(v => <option key={v.id} value={v.id}>{v.id}</option>)}</select>
            <label className="field-label">Логотип сборки</label><IconPicker selected={newIconIndex} onSelect={index => { setNewIconIndex(index); setNewIcon(null); }} />
            {(newIcon || newIconIndex !== null) && <img className="edit-preview" src={newIcon ?? avatarData(newIconIndex!)} alt="Предпросмотр логотипа" />}
            <p className="muted small">Java Edition: клиент, библиотеки, ресурсы и подходящая Java подготавливаются автоматически.</p>
            <button className="primary create-submit" disabled={creating || versionsLoading || versions.length === 0} onClick={() => void createBuild()}>{creating ? <><LoaderCircle size={15} className="spin" /> Подготавливаем сборку…</> : "Создать сборку"}</button>
          </>}
        </div> : <button className="outline add-build" onClick={() => setShowCreate(true)}><Plus size={17} /> Создать сборку</button>}
        {loadingInstances && <p className="muted small">Загружаем сохранённые сборки…</p>}
      </section>}
      {page === "Настройки" && <section className="content narrow"><div className="page-title"><div className="eyebrow">АККАУНТ И ПРИЛОЖЕНИЕ</div><h1>Настройки</h1><p>Локальный профиль и внешний вид L.o.S.A.</p></div>
        <div className="settings-card appearance-card"><div className="settings-heading"><div className="quick-icon"><Sparkles /></div><div><b>Внешний вид лаунчера</b><small>Тема и акцентный цвет сохраняются автоматически</small></div></div><label className="field-label">Тема интерфейса</label><div className="theme-options"><button type="button" className={theme === "dark" ? "theme-option active" : "theme-option"} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Тёмная</button><button type="button" className={theme === "light" ? "theme-option active" : "theme-option"} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Светлая</button></div><label className="field-label" htmlFor="losa-accent-color">Акцентный цвет</label><div className="accent-controls"><div className="accent-presets" role="group" aria-label="Готовые акцентные цвета">{accentPresets.map(preset => <button key={preset.color} type="button" className={accentColor.toLowerCase() === preset.color ? "accent-swatch selected" : "accent-swatch"} style={{ "--swatch": preset.color } as CSSProperties} onClick={() => setAccentColor(preset.color)} aria-label={preset.name} aria-pressed={accentColor.toLowerCase() === preset.color} title={preset.name} />)}</div><input id="losa-accent-color" className="accent-input" type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} aria-label="Выбрать произвольный акцентный цвет" /><span className="muted small">Готовые оттенки или любой свой цвет.</span><button className="outline" onClick={() => setAccentColor("#d8bd64")}>Сбросить</button></div></div>
        <div className="settings-card language-card"><div className="settings-heading"><div className="quick-icon"><Globe/></div><div><b>Язык интерфейса</b><small>Выбор сохраняется в настройках</small></div></div><label className="field-label" htmlFor="losa-language">Язык</label><select id="losa-language" className="wide-input" value={selectedLanguage} onChange={e=>{setSelectedLanguage(e.target.value);setNotice("Языковое предпочтение сохранено. Полные переводы подключим отдельным этапом локализации.");}}><option value="ru">Русский</option><option value="en">English</option><option value="de">Deutsch</option><option value="fr">Français</option><option value="es">Español</option><option value="zh-CN">简体中文</option><option value="be">Беларуская</option><option value="kk">Қазақша</option><option value="pt-BR">Português (Brasil)</option></select><p className="muted small">Сейчас интерфейс ещё отображается на русском. Смена языка сохранит предпочтение, а переводы будут включены после подготовки языковых пакетов.</p></div>
        <div className="settings-card offline-profile-card">
          <div className="settings-heading"><div className="quick-icon"><ShieldCheck /></div><div><b>Аккаунт Microsoft</b><small>Вход через официальный код Microsoft — пароль лаунчеру не передаётся</small></div><span className={microsoftProfile ? "connected" : "disconnected"}>{microsoftProfile ? "Подключён" : "Не подключён"}</span></div>
          {microsoftRegistrationBlocked && <p className="auth-registration-help">Minecraft Services отклонил Client ID приложения. Это ограничение на стороне Minecraft, а не проверка покупки игры. <a href="https://help.minecraft.net/hc/en-us/articles/16254801392141" target="_blank" rel="noreferrer">Официальная инструкция Minecraft по регистрации приложения</a>.</p>}
          {!microsoftConfigured && <p className="muted small">Microsoft-вход не настроен в сборке. Проверь Client ID в настройках сборки GitHub Actions.</p>}
          {microsoftAccounts.length > 0 && <>
            <p className="muted small">Подключено аккаунтов: {microsoftAccounts.length}. Выбери профиль, с которого запускать Minecraft Java.</p>
            <label className="field-label" htmlFor="microsoft-account-select">Активный аккаунт</label>
            <select id="microsoft-account-select" className="wide-input" value={microsoftProfile?.id ?? ""} onChange={e => void switchMicrosoftAccount(e.target.value)}>
              {microsoftAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            {microsoftProfile && <p className="muted small">Активен: <b>{microsoftProfile.name}</b></p>}
            <button className="outline" onClick={() => void logoutMicrosoft()}>Удалить активный аккаунт</button>
          </>}
          <button className="primary" disabled={!microsoftConfigured || microsoftBusy} onClick={() => void beginMicrosoftLogin()}>{microsoftBusy ? "Ожидаем вход в браузере…" : microsoftAccounts.length ? "Добавить другой Microsoft-аккаунт" : "Войти через Microsoft"}</button>
        </div>
        <div className="settings-card offline-profile-card"><div className="settings-heading"><div className="quick-icon"><Gamepad2 /></div><div><b>Локальный профиль (Offline)</b><small>Вход по игровому нику для локального тестирования</small></div><span className={offlineName ? "connected" : "disconnected"}>{offlineName ? "Активен" : "Не выбран"}</span></div><label className="field-label" htmlFor="offline-player-name">Игровой ник</label><input id="offline-player-name" className="wide-input" value={offlineNameDraft} onChange={e => setOfflineNameDraft(e.target.value)} maxLength={16} placeholder="Например, Steve_123" /><p className="muted small">От 3 до 16 символов: латинские буквы, цифры и подчёркивание.</p><button className="primary" onClick={saveOfflineProfile}>Сохранить локальный профиль</button></div>
      </section>}

      {page === "Лобби" && <section className="content community-content">
        <div className="page-title"><div className="eyebrow"><Users size={13}/> L.o.S.A. COMMUNITY</div><h1>Общее лобби</h1><p>Место, где игроки встречаются, общаются и собираются в совместные игровые сессии.</p></div>
        <div className="lobby-grid">
          <div className="community-panel lobby-welcome"><div className="lobby-orbit"><Users size={34}/></div><div><span className="panel-kicker">СООБЩЕСТВО L.o.S.A.</span><h2>Играй вместе</h2><p>Находи друзей, создавай компании и переходи к любимым серверам.</p><button className="primary" onClick={() => setPage("Чат")}><MessageCircle size={15}/> Открыть чат</button></div></div>
          <div className="community-panel online-panel"><div className="panel-heading"><div><b>Сейчас в L.o.S.A.</b><small>Демонстрационные профили</small></div><span className="online-indicator">● Онлайн</span></div><div className="online-count"><strong>128</strong><span>игроков в сети</span></div><div className="mini-avatars"><span>A</span><span>M</span><span>S</span><span>J</span><span>+124</span></div></div>
          <div className="community-panel"><div className="panel-heading"><div><b>Быстрый старт</b><small>Выбери, куда отправиться</small></div></div><div className="lobby-actions"><button onClick={() => setPage("Серверы")}><Globe/><span><b>Найти сервер</b><small>Открой список сообществ</small></span><ArrowUpRight/></button><button onClick={() => setPage("Друзья")}><Users/><span><b>Мои друзья</b><small>Собери свою компанию</small></span><ArrowUpRight/></button><button onClick={() => setPage("Серверы")}><Crown/><span><b>Свой сервер</b><small>Создай отдельный мир</small></span><ArrowUpRight/></button></div></div>
          <div className="community-panel activity-panel"><div className="panel-heading"><div><b>Активность сообщества</b><small>Пример ленты событий</small></div></div><div className="activity-row"><span className="activity-avatar">M</span><p><b>Mira</b> добавила сервер <strong>Cozy Survival</strong><small>8 минут назад</small></p></div><div className="activity-row"><span className="activity-avatar violet">A</span><p><b>Alex</b> создал новое лобби <strong>Вечернее выживание</strong><small>21 минуту назад</small></p></div><div className="activity-row"><span className="activity-avatar green">J</span><p><b>Jamie</b> поделился сборкой <strong>Vanilla Plus</strong><small>1 час назад</small></p></div></div>
        </div><div className="prototype-note"><ShieldCheck size={16}/> Это макет сообщества: цифры и события демонстрационные. Онлайн-статусы появятся после подключения серверной части.</div>
      </section>}
      {page === "Серверы" && <ServersPage />}
      {page === "Чат" && <section className="content community-content">
        <div className="page-title"><div className="eyebrow"><MessageCircle size={13}/> MESSAGES</div><h1>Сообщения</h1><p>Общие комнаты и личные разговоры — в одном окне.</p></div>
        <div className="chat-layout"><aside className="chat-sidebar"><div className="chat-side-title">КАНАЛЫ</div>{["Общий","Поиск команды","Обсуждение сборок"].map(ch=><button key={ch} className={chatChannel===ch?"chat-channel active":"chat-channel"} onClick={()=>setChatChannel(ch)}><MessageCircle size={15}/>{ch}{ch==="Общий"&&<i>3</i>}</button>)}<div className="chat-side-title direct-title">ЛИЧНЫЕ ЧАТЫ</div>{["Alex","Mira","Jamie"].map((n,i)=><button key={n} className="direct-chat" onClick={()=>{setChatChannel(n);setNotice("Личные переписки подключим вместе с аккаунтами L.o.S.A.");}}><span className={"direct-avatar d"+i}>{n[0]}</span>{n}<span className="presence-dot"/></button>)}</aside>
          <div className="chat-main"><div className="chat-head"><div><b># {chatChannel}</b><small>Демонстрационная комната</small></div><span><Users size={14}/> 24 участника</span></div><div className="chat-feed">{chatMessages.filter(m=>m.channel===chatChannel).map(m=><div className={m.own?"chat-message own":"chat-message"} key={m.id}><span className="chat-avatar">{m.author.slice(0,1)}</span><div><div className="chat-message-meta"><b>{m.author}</b><time>{m.time}</time></div><p>{m.text}</p></div></div>)}{chatMessages.filter(m=>m.channel===chatChannel).length===0&&<div className="chat-empty">Пока тихо. Начни разговор первым.</div>}</div><form className="chat-composer" onSubmit={e=>{e.preventDefault();if(!chatDraft.trim())return;setChatMessages(old=>[...old,{id:Date.now(),channel:chatChannel,author:offlineName||"Гость",text:chatDraft.trim(),time:new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),own:true}]);setChatDraft("");}}><input value={chatDraft} onChange={e=>setChatDraft(e.target.value)} placeholder="Написать сообщение…" aria-label="Сообщение"/><button className="primary" type="submit" disabled={!chatDraft.trim()}><Send size={15}/></button></form></div></div>
        <div className="prototype-note"><ShieldCheck size={16}/> Сообщения сейчас сохраняются только в состоянии этого окна и не отправляются другим игрокам.</div>
      </section>}
      
      {page === "Магазин" && <section className="content community-content">
        <div className="page-title"><div className="eyebrow"><Store size={13}/> L.o.S.A. STORE</div><h1>Магазин</h1><p>Косметика, которая помогает выразить свой стиль в игре и профиле.</p></div>
        <div className="store-hero"><div><span className="panel-kicker">ТВОЙ СТИЛЬ — ТВОИ ПРАВИЛА</span><h2>Сделай профиль<br/>узнаваемым</h2><p>Плащи, спутники, ауры, эмоции и оформление профиля.</p></div><div className="store-hero-gem">✧</div></div>
        <div className="store-toolbar">{["Все","Плащи","Головные уборы","Питомцы","Ауры","Эмоции","Рамки","Титулы"].map(c=><button key={c} className={storeCategory===c?"active":""} onClick={()=>setStoreCategory(c)}>{c}</button>)}</div>
        <div className="store-grid">{[
          {name:"Звёздная аура",kind:"Ауры",price:"Косметика",glyph:"✧",tone:"star"},
          {name:"Рамка созвездия",kind:"Рамки",price:"Профиль",glyph:"◇",tone:"frame"},
          {name:"Лунный след",kind:"Ауры",price:"Эффект",glyph:"☾",tone:"moon"},
          {name:"Первопроходец",kind:"Титулы",price:"Титул профиля",glyph:"✦",tone:"star"},
          {name:"Повелитель глубин",kind:"Титулы",price:"Титул профиля",glyph:"♜",tone:"moon"},

          {name:"Корона полярной звезды",kind:"Головные уборы",price:"Косметика",glyph:"♛",tone:"hat-polar"},
          {name:"Капюшон сумеречного леса",kind:"Головные уборы",price:"Косметика",glyph:"♧",tone:"hat-forest"},
          {name:"Шахтёрская каска «Искра»",kind:"Головные уборы",price:"Косметика",glyph:"⛏",tone:"hat-miner"},
          {name:"Шляпа звёздного картографа",kind:"Головные уборы",price:"Косметика",glyph:"✧",tone:"hat-mage"},
          {name:"Венец драконьих рогов",kind:"Головные уборы",price:"Косметика",glyph:"♜",tone:"hat-dragon"},
          {name:"Неоновая гарнитура",kind:"Головные уборы",price:"Косметика",glyph:"♫",tone:"hat-neon"},
          {name:"Венок летнего рассвета",kind:"Головные уборы",price:"Косметика",glyph:"❀",tone:"hat-bloom"},
          {name:"Маска песчаного стража",kind:"Головные уборы",price:"Косметика",glyph:"◈",tone:"hat-dune"},
          {name:"Шлем глубинного исследователя",kind:"Головные уборы",price:"Косметика",glyph:"◉",tone:"hat-deep"},

          {name:"Лис-компаньон «Рыжик»",kind:"Питомцы",price:"Питомец",glyph:"🦊",tone:"pet-fox"},
          {name:"Дракончик угольного пламени",kind:"Питомцы",price:"Питомец",glyph:"🐉",tone:"pet-drake"},
          {name:"Полярная сова",kind:"Питомцы",price:"Питомец",glyph:"🦉",tone:"pet-owl"},
          {name:"Аксолотль-исследователь",kind:"Питомцы",price:"Питомец",glyph:"🦎",tone:"pet-axo"},
          {name:"Малый каменный голем",kind:"Питомцы",price:"Питомец",glyph:"🪨",tone:"pet-golem"},
          {name:"Светлячок-комета",kind:"Питомцы",price:"Питомец",glyph:"✹",tone:"pet-firefly"},
          {name:"Черепашонок с рюкзаком",kind:"Питомцы",price:"Питомец",glyph:"🐢",tone:"pet-turtle"},
          {name:"Ворон-хранитель",kind:"Питомцы",price:"Питомец",glyph:"🐦‍⬛",tone:"pet-raven"},
          {name:"Слизень-мимик",kind:"Питомцы",price:"Питомец",glyph:"◉",tone:"pet-slime"},

          {name:"Танец победителя",kind:"Эмоции",price:"Анимация",glyph:"★",tone:"emote-dance"},
          {name:"Салют команде",kind:"Эмоции",price:"Анимация",glyph:"⚑",tone:"emote-salute"},
          {name:"Заразительный смех",kind:"Эмоции",price:"Анимация",glyph:"☺",tone:"emote-laugh"},
          {name:"Ну и ну!",kind:"Эмоции",price:"Анимация",glyph:"!? ",tone:"emote-wow"},
          {name:"Воздушное сердце",kind:"Эмоции",price:"Анимация",glyph:"♥",tone:"emote-heart"},
          {name:"Приветствие путешественника",kind:"Эмоции",price:"Анимация",glyph:"✋",tone:"emote-wave"},
          {name:"Неловкое пожатие плечами",kind:"Эмоции",price:"Анимация",glyph:"〰",tone:"emote-shrug"},
          {name:"Сон на ходу",kind:"Эмоции",price:"Анимация",glyph:"☾",tone:"emote-sleep"},
          {name:"Фирменный жест L.o.S.A.",kind:"Эмоции",price:"Анимация",glyph:"✦",tone:"emote-losa"}
        ].filter(x=>storeCategory==="Все"||x.kind===storeCategory).map(x=><article className="store-card" key={x.name}><div className={"store-art "+x.tone}><span>{x.glyph}</span><i>КОНЦЕПТ</i></div><div className="store-item-info"><div><h3>{x.name}</h3><small>{x.kind} · {x.price}</small></div><button className="outline" onClick={()=>setNotice("Витрина пока демонстрационная. Реальные покупки и инвентарь появятся после подключения магазина.")}>Скоро</button></div></article>)}</div>
        {storeCategory === "Плащи" && <div className="cape-empty-state"><b>Твои плащи ещё не подключены</b><p>Здесь будут отдельные предметы с твоими исходными текстурами. Демонстрационные изображения вместо них показывать не будем.</p></div>}
        <div className="subscription-section"><div className="section-head"><div><h2>Подписки L.o.S.A.</h2><p>Косметика, титулы и оформление профиля</p></div></div><div className="plan-grid"><article className="plan-card"><span className="plan-label vip"><Crown size={12}/> VIP</span><h3>VIP</h3><p>Больше способов выразить свой стиль</p><div className="plan-spec"><span>Эксклюзивные косметические предметы</span><span>Набор титулов профиля</span><span>Особенная рамка профиля</span></div><b className="plan-price">€2,99 / мес.</b><button className="outline" onClick={()=>setNotice("Подписки пока концептуальные. Оплата и выдача предметов не подключены.")}>Скоро</button></article><article className="plan-card featured"><span className="plan-label vipplus"><Crown size={12}/> VIP+</span><h3>VIP+</h3><p>Расширенная косметическая коллекция</p><div className="plan-spec"><span>Все косметические наборы VIP</span><span>Дополнительные редкие титулы</span><span>Расширенная рамка и эффекты профиля</span></div><b className="plan-price">€5,99 / мес.</b><button className="primary" onClick={()=>setNotice("Подписки пока концептуальные. Оплата и выдача предметов не подключены.")}>Скоро</button></article></div></div>
        <div className="prototype-note"><ShieldCheck size={16}/> Витрина и категории готовы как интерфейс. Баланс, инвентарь и покупки пока отключены.</div>
      </section>}
      {page === "Друзья" && <FriendsPage />}
      {page === "Моды и сборки" && <ModsAndPacks />}

      {(error || notice) && <div className={error ? "toast error-toast" : "toast"} onClick={() => { setError(""); setNotice(""); }}>{error || notice}<button aria-label="Закрыть">×</button></div>}
      <footer><span>© 2026 L.o.S.A.</span></footer>
    </main>
  </div>;
}
