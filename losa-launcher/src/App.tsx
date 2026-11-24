import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Home, Gamepad2, Users, Layers3, Server, Settings, Plus, Play, ChevronDown, Sparkles, ShieldCheck, CircleHelp, Trash2, Pencil, X, LoaderCircle, MessageCircle, Store, Crown, Search, Send, Heart, Globe, Shield, Cpu, HardDrive, ArrowUpRight, Palette, ImagePlus, Copy, Save, Eye } from "lucide-react";
import { getMinecraftVersions, type MinecraftVersion } from "./lib/minecraft";
import { invoke } from "@tauri-apps/api/core";

type Page = "Главная" | "Играть" | "Лобби" | "Друзья" | "Чат" | "Магазин" | "Мастерская" | "Моды и сборки" | "Серверы" | "Настройки";
type LauncherInstance = {
  id: string; name: string; versionId: string; loader: string;
  iconDataUrl?: string | null; createdAt: number; lastPlayedAt?: number | null;
};
const nav: { name: Page; icon: typeof Home }[] = [
  { name: "Главная", icon: Home }, { name: "Играть", icon: Gamepad2 }, { name: "Лобби", icon: Users },
  { name: "Серверы", icon: Server }, { name: "Чат", icon: MessageCircle }, { name: "Магазин", icon: Store },
 { name: "Друзья", icon: Users }, { name: "Мастерская", icon: Palette }, { name: "Моды и сборки", icon: Layers3 }, { name: "Настройки", icon: Settings }
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


type CosmeticDraft = {
  id: string; name: string; description: string; category: string; rarity: string;
  price: string; glyph: string; image: string; updatedAt: number;
};
const cosmeticCategories = ["Головные уборы", "Питомцы", "Эмоции", "Накидки", "Ауры", "Рамки", "Титулы"];
const emptyCosmetic = (): CosmeticDraft => ({
  id: crypto.randomUUID(), name: "", description: "", category: "Головные уборы",
  rarity: "Обычная", price: "Бесплатно", glyph: "✦", image: "", updatedAt: Date.now()
});

function CosmeticWorkshop({ setNotice }: { setNotice: (message: string) => void }) {
  const [drafts, setDrafts] = useState<CosmeticDraft[]>(() => {
    try { return JSON.parse(localStorage.getItem("losa.cosmeticDrafts") ?? "[]") as CosmeticDraft[]; }
    catch { return []; }
  });
  const [item, setItem] = useState<CosmeticDraft>(() => emptyCosmetic());
  const [saved, setSaved] = useState(false);
  useEffect(() => { localStorage.setItem("losa.cosmeticDrafts", JSON.stringify(drafts)); }, [drafts]);
  const update = (patch: Partial<CosmeticDraft>) => { setItem(current => ({ ...current, ...patch, updatedAt: Date.now() })); setSaved(false); };
  const saveDraft = () => {
    if (!item.name.trim()) { setNotice("Укажи название предмета перед сохранением."); return; }
    setDrafts(old => old.some(d => d.id === item.id) ? old.map(d => d.id === item.id ? item : d) : [item, ...old]);
    setSaved(true); setNotice("Черновик косметики сохранён на этом компьютере.");
  };
  const loadDraft = (draft: CosmeticDraft) => { setItem({ ...draft }); setSaved(true); };
  const removeDraft = (id: string) => { setDrafts(old => old.filter(d => d.id !== id)); if (item.id === id) { setItem(emptyCosmetic()); setSaved(false); } };
  const duplicateDraft = (draft: CosmeticDraft) => { setItem({ ...draft, id: crypto.randomUUID(), name: draft.name + " — копия", updatedAt: Date.now() }); setSaved(false); };
  const readImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setNotice("Можно загрузить только файл изображения."); return; }
    if (file.size > 5 * 1024 * 1024) { setNotice("Изображение слишком большое. Максимальный размер — 5 МБ."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") update({ image: reader.result }); };
    reader.onerror = () => setNotice("Не удалось прочитать изображение.");
    reader.readAsDataURL(file);
  };
  return <section className="content workshop-content">
    <div className="page-title"><div className="eyebrow"><Palette size={13}/> L.o.S.A. CREATOR STUDIO</div><h1>Мастерская косметики</h1><p>Создавай предметы для витрины, настраивай внешний вид и сохраняй собственные черновики.</p></div>
    <div className="workshop-notice"><ShieldCheck size={16}/><span><b>Локальный режим редактора.</b> Черновики хранятся на этом компьютере. Публикация в общий магазин и проверка прав владельца появятся вместе с серверной системой аккаунтов.</span></div>
    <div className="workshop-layout">
      <div className="community-panel workshop-editor">
        <div className="panel-heading"><div><b>{drafts.some(d => d.id === item.id) ? "Редактирование предмета" : "Новый предмет"}</b><small>Основные свойства и внешний вид</small></div><button className="outline" onClick={() => { setItem(emptyCosmetic()); setSaved(false); }}> <Plus size={14}/> Новый</button></div>
        <label className="workshop-field">Название предмета<input value={item.name} maxLength={48} onChange={e => update({ name: e.target.value })} placeholder="Например, Корона полярной звезды"/></label>
        <label className="workshop-field">Описание<textarea value={item.description} maxLength={240} rows={3} onChange={e => update({ description: e.target.value })} placeholder="Коротко расскажи историю и особенности предмета…"/></label>
        <div className="workshop-fields-two">
          <label className="workshop-field">Категория<select value={item.category} onChange={e => update({ category: e.target.value })}>{cosmeticCategories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="workshop-field">Редкость<select value={item.rarity} onChange={e => update({ rarity: e.target.value })}>{["Обычная","Необычная","Редкая","Эпическая","Легендарная","Мифическая"].map(r => <option key={r}>{r}</option>)}</select></label>
        </div>
        <div className="workshop-fields-two">
          <label className="workshop-field">Стоимость / тип цены<input value={item.price} maxLength={32} onChange={e => update({ price: e.target.value })} placeholder="Бесплатно / 250 монет"/></label>
          <label className="workshop-field">Символ предпросмотра<input value={item.glyph} maxLength={4} onChange={e => update({ glyph: e.target.value })} placeholder="✦"/></label>
        </div>
        <div className="workshop-field"><span className="workshop-label">Изображение предмета</span><label className="workshop-upload"><ImagePlus size={18}/><span>{item.image ? "Заменить изображение" : "Загрузить изображение"}</span><small>PNG, JPG, WEBP · до 5 МБ</small><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => readImage(e.target.files?.[0])}/></label>{item.image && <button className="text-action" onClick={() => update({ image: "" })}>Удалить изображение</button>}</div>
        <div className="workshop-actions"><button className="primary" onClick={saveDraft}><Save size={14}/> Сохранить черновик</button><button className="outline" onClick={() => { setItem(emptyCosmetic()); setSaved(false); }}>Сбросить</button></div>
      </div>
      <div className="community-panel workshop-preview-panel">
        <div className="panel-heading"><div><b>Предпросмотр</b><small>Так будет выглядеть карточка предмета</small></div><Eye size={17}/></div>
        <article className="store-card workshop-preview-card"><div className="store-art workshop-preview-art"><span>{item.image ? <img src={item.image} alt="Предпросмотр косметики"/> : item.glyph || "✦"}</span><i>{item.rarity.toUpperCase()}</i></div><div className="store-item-info"><div><h3>{item.name || "Название предмета"}</h3><small>{item.category} · {item.price || "Без цены"}</small></div><span className="coming">Черновик</span></div><p className="workshop-preview-description">{item.description || "Здесь появится описание предмета."}</p></article>
        <div className="workshop-preview-meta"><span>Категория</span><b>{item.category}</b><span>Редкость</span><b>{item.rarity}</b></div>
        {saved && <div className="workshop-saved"><ShieldCheck size={14}/> Черновик сохранён</div>}
      </div>
    </div>
    <div className="section-head workshop-drafts-heading"><div><h2>Мои черновики</h2><p>{drafts.length} сохранено на этом устройстве</p></div></div>
    {drafts.length === 0 ? <div className="community-panel workshop-empty"><ImagePlus size={24}/><b>Пока нет черновиков</b><span>Создай первый предмет — он появится здесь.</span></div> : <div className="workshop-drafts">{drafts.map(d => <article className="workshop-draft-card" key={d.id}><button className="workshop-draft-open" onClick={() => loadDraft(d)}><span className="workshop-draft-art">{d.image ? <img src={d.image} alt=""/> : d.glyph}</span><span><b>{d.name}</b><small>{d.category} · {d.rarity}</small></span></button><div className="workshop-draft-actions"><button className="icon-button" title="Дублировать" onClick={() => duplicateDraft(d)}><Copy size={14}/></button><button className="icon-button danger-action" title="Удалить" onClick={() => removeDraft(d.id)}><Trash2 size={14}/></button></div></article>)}</div>}
    <div className="prototype-note"><ShieldCheck size={16}/> Сейчас редактор создаёт визуальные карточки и локальные черновики. Игровые 3D-модели, текстуры Minecraft, анимации питомцев и применение предметов на персонаже — отдельный следующий этап.</div>
  </section>;
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
      <div className="sidebar-bottom"><div className="status-dot" /> Offline-режим <span className="version">v0.10.7</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">L.o.S.A. <span>/</span> {page}</div><button className="icon-button" title="Справка" onClick={() => setNotice("L.o.S.A. 0.10.7 — приглашения, роли и мастерская косметики.")}><CircleHelp size={18} /></button></header>
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
          <div className="build-options-grid"><div><label className="field-label">Издание Minecraft</label><select className="wide-input" value={selectedEdition} onChange={e=>setSelectedEdition(e.target.value)}><option value="Java Edition">Java Edition</option><option value="Bedrock Edition" disabled>Bedrock Edition — скоро</option></select></div><div><label className="field-label">Загрузчик</label><select className="wide-input" value={selectedLoader} onChange={e=>setSelectedLoader(e.target.value)}><option value="vanilla">Vanilla</option><option value="fabric" disabled>Fabric — скоро</option><option value="forge" disabled>Forge — скоро</option><option value="neoforge" disabled>NeoForge — скоро</option><option value="quilt" disabled>Quilt — скоро</option></select></div></div>
          <label className="field-label">Логотип сборки</label><IconPicker selected={newIconIndex} onSelect={index => { setNewIconIndex(index); setNewIcon(null); }} />
          {(newIcon || newIconIndex !== null) && <img className="edit-preview" src={newIcon ?? avatarData(newIconIndex!)} alt="Предпросмотр логотипа" />}
          <p className="muted small">Сейчас создание работает для Java Edition и Vanilla. Bedrock и загрузчики Fabric, Forge, NeoForge и Quilt появятся после реализации их установщиков. Во время создания автоматически загружаются клиент, библиотеки, ресурсы и подходящая Java.</p>
          <button className="primary create-submit" disabled={creating || versionsLoading || versions.length === 0} onClick={() => void createBuild()}>{creating ? <><LoaderCircle size={15} className="spin" /> Подготавливаем сборку…</> : "Создать сборку"}</button>
        </div> : <button className="outline add-build" onClick={() => setShowCreate(true)}><Plus size={17} /> Создать сборку</button>}
        {loadingInstances && <p className="muted small">Загружаем сохранённые сборки…</p>}
      </section>}
      {page === "Настройки" && <section className="content narrow"><div className="page-title"><div className="eyebrow">АККАУНТ И ПРИЛОЖЕНИЕ</div><h1>Настройки</h1><p>Локальный профиль и внешний вид L.o.S.A.</p></div>
        <div className="settings-card appearance-card"><div className="settings-heading"><div className="quick-icon"><Sparkles /></div><div><b>Внешний вид лаунчера</b><small>Тема и акцентный цвет сохраняются автоматически</small></div></div><label className="field-label">Тема интерфейса</label><div className="theme-options"><button type="button" className={theme === "dark" ? "theme-option active" : "theme-option"} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Тёмная</button><button type="button" className={theme === "light" ? "theme-option active" : "theme-option"} aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Светлая</button></div><label className="field-label" htmlFor="losa-accent-color">Акцентный цвет</label><div className="accent-controls"><div className="accent-presets" role="group" aria-label="Готовые акцентные цвета">{accentPresets.map(preset => <button key={preset.color} type="button" className={accentColor.toLowerCase() === preset.color ? "accent-swatch selected" : "accent-swatch"} style={{ "--swatch": preset.color } as CSSProperties} onClick={() => setAccentColor(preset.color)} aria-label={preset.name} aria-pressed={accentColor.toLowerCase() === preset.color} title={preset.name} />)}</div><input id="losa-accent-color" className="accent-input" type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} aria-label="Выбрать произвольный акцентный цвет" /><span className="muted small">Готовые оттенки или любой свой цвет.</span><button className="outline" onClick={() => setAccentColor("#d8bd64")}>Сбросить</button></div></div>
        <div className="settings-card language-card"><div className="settings-heading"><div className="quick-icon"><Globe/></div><div><b>Язык интерфейса</b><small>Выбор сохраняется в настройках</small></div></div><label className="field-label" htmlFor="losa-language">Язык</label><select id="losa-language" className="wide-input" value={selectedLanguage} onChange={e=>{setSelectedLanguage(e.target.value);setNotice("Языковое предпочтение сохранено. Полные переводы подключим отдельным этапом локализации.");}}><option value="ru">Русский</option><option value="en">English</option><option value="de">Deutsch</option><option value="fr">Français</option><option value="es">Español</option><option value="zh-CN">简体中文</option><option value="be">Беларуская</option><option value="kk">Қазақша</option><option value="pt-BR">Português (Brasil)</option></select><p className="muted small">Сейчас интерфейс ещё отображается на русском. Смена языка сохранит предпочтение, а переводы будут включены после подготовки языковых пакетов.</p></div>
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
      {page === "Серверы" && <section className="content community-content">
        <div className="page-title"><div className="eyebrow"><Globe size={13}/> DISCOVER</div><h1>Список серверов</h1><p>Подбирай миры по стилю игры, версии и изданию Minecraft.</p></div>
        <div className="server-toolbar"><div className="search-field"><Search size={16}/><input value={serverQuery} onChange={e=>setServerQuery(e.target.value)} placeholder="Название сервера или режим…"/></div><div className="filter-pills">{(["Все","Java","Bedrock"] as const).map(v=><button key={v} className={serverEdition===v?"active":""} onClick={()=>setServerEdition(v)}>{v}</button>)}</div></div>
        <div className="server-feature"><div className="server-feature-art"><span>✦</span></div><div><span className="panel-kicker">ВЫБОР СООБЩЕСТВА</span><h2>Найди свой следующий мир</h2><p>Выживание, мини-игры, творчество и приключения — всё в одном месте.</p></div></div>
        <div className="server-results-head"><b>Популярные серверы</b><span>Примеры карточек · не реальные подключения</span></div>
        <div className="server-grid">{[
          {id:"block-haven",name:"Block Haven",mode:"Выживание",edition:"Java",version:"1.21.x",players:"248 / 500",tag:"Экономика",color:"blue"},
          {id:"pixel-garden",name:"Pixel Garden",mode:"Творчество",edition:"Java",version:"1.20.4",players:"86 / 200",tag:"Строительство",color:"green"},
          {id:"bedrock-world",name:"Bedrock World",mode:"Приключения",edition:"Bedrock",version:"1.21.x",players:"132 / 300",tag:"Кроссплей",color:"purple"},
          {id:"redstone-lab",name:"Redstone Lab",mode:"Технический",edition:"Java",version:"1.21.x",players:"41 / 120",tag:"Redstone",color:"orange"}
        ].filter(s=>(serverEdition==="Все"||s.edition===serverEdition)&&((s.name+" "+s.mode+" "+s.tag).toLowerCase().includes(serverQuery.toLowerCase()))).map(s=><article className="server-card" key={s.id}><div className={"server-card-art "+s.color}><span>{s.name.slice(0,1)}</span><button title="В избранное" className={favoriteServers.includes(s.id)?"favorite active":"favorite"} onClick={()=>setFavoriteServers(old=>old.includes(s.id)?old.filter(x=>x!==s.id):[...old,s.id])}><Heart size={16} fill={favoriteServers.includes(s.id)?"currentColor":"none"}/></button></div><div className="server-card-body"><div className="server-tags"><span>{s.edition}</span><span>{s.tag}</span></div><h3>{s.name}</h3><p>{s.mode} · Minecraft {s.version}</p><div className="server-card-foot"><span><i/> {s.players} игроков</span><button className="outline" onClick={()=>setNotice("Карточка сервера демонстрационная. Подключение станет доступно после каталога серверов.")}>Подробнее</button></div></div></article>)}</div>
        <div className="private-server-section"><div className="section-head"><div><h2>Приватные серверы</h2><p>Собственный мир — прямо во вкладке «Серверы»</p></div></div><div className="private-hero"><div><span className="panel-kicker">ТВОЙ МИР · ТВОИ ПРАВИЛА</span><h2>Сервер для своей компании</h2><p>Выбери объём ресурсов и создай отдельный мир для друзей.</p></div><div className="private-hero-icon"><Server size={48}/></div></div><div className="plan-grid"><article className="plan-card "><span className="plan-label">ПРИВАТНЫЙ МИР</span><h3>Mini</h3><p>2 ГБ RAM · До 5 игроков</p><div className="plan-spec"><span><Cpu/> 2 ГБ RAM</span><span><Users/> До 5 игроков</span><span><HardDrive/> NVMe-хранилище и резервные копии</span><span><Shield/> Закрытый доступ по приглашению</span></div><b className="plan-price">€2,99 / мес.</b><button className="outline" onClick={()=>setNotice("Тарифы пока демонстрационные. Реальный хостинг и оплата ещё не подключены.")}>Выбрать · скоро</button></article><article className="plan-card featured"><span className="plan-label">ПОПУЛЯРНЫЙ</span><h3>Friends</h3><p>4 ГБ RAM · До 10 игроков</p><div className="plan-spec"><span><Cpu/> 4 ГБ RAM</span><span><Users/> До 10 игроков</span><span><HardDrive/> NVMe-хранилище и резервные копии</span><span><Shield/> Закрытый доступ по приглашению</span></div><b className="plan-price">€5,99 / мес.</b><button className="primary" onClick={()=>setNotice("Тарифы пока демонстрационные. Реальный хостинг и оплата ещё не подключены.")}>Выбрать · скоро</button></article><article className="plan-card "><span className="plan-label">ПРИВАТНЫЙ МИР</span><h3>Community</h3><p>6 ГБ RAM · До 15 игроков</p><div className="plan-spec"><span><Cpu/> 6 ГБ RAM</span><span><Users/> До 15 игроков</span><span><HardDrive/> NVMe-хранилище и резервные копии</span><span><Shield/> Закрытый доступ по приглашению</span></div><b className="plan-price">€8,99 / мес.</b><button className="outline" onClick={()=>setNotice("Тарифы пока демонстрационные. Реальный хостинг и оплата ещё не подключены.")}>Выбрать · скоро</button></article><article className="plan-card "><span className="plan-label">ПРИВАТНЫЙ МИР</span><h3>Creator</h3><p>8 ГБ RAM · До 20 игроков</p><div className="plan-spec"><span><Cpu/> 8 ГБ RAM</span><span><Users/> До 20 игроков</span><span><HardDrive/> NVMe-хранилище и резервные копии</span><span><Shield/> Закрытый доступ по приглашению</span></div><b className="plan-price">€11,99 / мес.</b><button className="outline" onClick={()=>setNotice("Тарифы пока демонстрационные. Реальный хостинг и оплата ещё не подключены.")}>Выбрать · скоро</button></article><article className="plan-card "><span className="plan-label">ПРИВАТНЫЙ МИР</span><h3>Adventure</h3><p>12 ГБ RAM · До 30 игроков</p><div className="plan-spec"><span><Cpu/> 12 ГБ RAM</span><span><Users/> До 30 игроков</span><span><HardDrive/> NVMe-хранилище и резервные копии</span><span><Shield/> Закрытый доступ по приглашению</span></div><b className="plan-price">€17,99 / мес.</b><button className="outline" onClick={()=>setNotice("Тарифы пока демонстрационные. Реальный хостинг и оплата ещё не подключены.")}>Выбрать · скоро</button></article><article className="plan-card "><span className="plan-label">ПРИВАТНЫЙ МИР</span><h3>Legend</h3><p>16 ГБ RAM · До 40 игроков</p><div className="plan-spec"><span><Cpu/> 16 ГБ RAM</span><span><Users/> До 40 игроков</span><span><HardDrive/> NVMe-хранилище и резервные копии</span><span><Shield/> Закрытый доступ по приглашению</span></div><b className="plan-price">€23,99 / мес.</b><button className="outline" onClick={()=>setNotice("Тарифы пока демонстрационные. Реальный хостинг и оплата ещё не подключены.")}>Выбрать · скоро</button></article></div><div className="community-panel private-create" id="private-create"><div className="panel-heading"><div><b>Мои приватные серверы</b><small>Черновики конфигураций на этом устройстве</small></div><span className="coming">Демо</span></div><div className="private-create-row"><input value={privateServerName} onChange={e=>setPrivateServerName(e.target.value)} placeholder="Название будущего сервера" maxLength={32}/><button className="primary" disabled={!privateServerName.trim()} onClick={()=>{setPrivateServerDrafts(old=>[...old,privateServerName.trim()]);setPrivateServerName("");setNotice("Черновик сервера добавлен локально. Он ещё не запущен в сети.");}}><Plus size={15}/> Добавить черновик</button></div>{privateServerDrafts.map((name,i)=><div className="private-draft" key={i}><Server size={16}/><b>{name}</b><span>Черновик · не запущен</span></div>)}</div></div>
        <div className="prototype-note"><ShieldCheck size={16}/> Поиск, фильтр Java/Bedrock и избранное работают локально. Адреса и онлайн игроков пока демонстрационные.</div>
      </section>}
      {page === "Чат" && <section className="content community-content">
        <div className="page-title"><div className="eyebrow"><MessageCircle size={13}/> MESSAGES</div><h1>Сообщения</h1><p>Общие комнаты и личные разговоры — в одном окне.</p></div>
        <div className="chat-layout"><aside className="chat-sidebar"><div className="chat-side-title">КАНАЛЫ</div>{["Общий","Поиск команды","Обсуждение сборок"].map(ch=><button key={ch} className={chatChannel===ch?"chat-channel active":"chat-channel"} onClick={()=>setChatChannel(ch)}><MessageCircle size={15}/>{ch}{ch==="Общий"&&<i>3</i>}</button>)}<div className="chat-side-title direct-title">ЛИЧНЫЕ ЧАТЫ</div>{["Alex","Mira","Jamie"].map((n,i)=><button key={n} className="direct-chat" onClick={()=>{setChatChannel(n);setNotice("Личные переписки подключим вместе с аккаунтами L.o.S.A.");}}><span className={"direct-avatar d"+i}>{n[0]}</span>{n}<span className="presence-dot"/></button>)}</aside>
          <div className="chat-main"><div className="chat-head"><div><b># {chatChannel}</b><small>Демонстрационная комната</small></div><span><Users size={14}/> 24 участника</span></div><div className="chat-feed">{chatMessages.filter(m=>m.channel===chatChannel).map(m=><div className={m.own?"chat-message own":"chat-message"} key={m.id}><span className="chat-avatar">{m.author.slice(0,1)}</span><div><div className="chat-message-meta"><b>{m.author}</b><time>{m.time}</time></div><p>{m.text}</p></div></div>)}{chatMessages.filter(m=>m.channel===chatChannel).length===0&&<div className="chat-empty">Пока тихо. Начни разговор первым.</div>}</div><form className="chat-composer" onSubmit={e=>{e.preventDefault();if(!chatDraft.trim())return;setChatMessages(old=>[...old,{id:Date.now(),channel:chatChannel,author:offlineName||"Гость",text:chatDraft.trim(),time:new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),own:true}]);setChatDraft("");}}><input value={chatDraft} onChange={e=>setChatDraft(e.target.value)} placeholder="Написать сообщение…" aria-label="Сообщение"/><button className="primary" type="submit" disabled={!chatDraft.trim()}><Send size={15}/></button></form></div></div>
        <div className="prototype-note"><ShieldCheck size={16}/> Сообщения сейчас сохраняются только в состоянии этого окна и не отправляются другим игрокам.</div>
      </section>}
      {page === "Мастерская" && <CosmeticWorkshop setNotice={setNotice} />}
      {page === "Магазин" && <section className="content community-content">
        <div className="page-title"><div className="eyebrow"><Store size={13}/> L.o.S.A. STORE</div><h1>Магазин</h1><p>Косметика, которая помогает выразить свой стиль в игре и профиле.</p></div>
        <div className="store-hero"><div><span className="panel-kicker">ТВОЙ СТИЛЬ — ТВОИ ПРАВИЛА</span><h2>Сделай профиль<br/>узнаваемым</h2><p>Накидки, спутники, ауры, эмоции и оформление профиля.</p></div><div className="store-hero-gem">✧</div></div>
        <div className="store-toolbar">{["Все","Накидки","Головные уборы","Питомцы","Ауры","Эмоции","Рамки","Титулы"].map(c=><button key={c} className={storeCategory===c?"active":""} onClick={()=>setStoreCategory(c)}>{c}</button>)}</div>
        <div className="store-grid">{[
          {name:"Северное сияние",kind:"Накидки",price:"Косметика",glyph:"✦",tone:"aurora"},
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
        <div className="subscription-section"><div className="section-head"><div><h2>Подписки L.o.S.A.</h2><p>Косметика, титулы и оформление профиля</p></div></div><div className="plan-grid"><article className="plan-card"><span className="plan-label vip"><Crown size={12}/> VIP</span><h3>VIP</h3><p>Больше способов выразить свой стиль</p><div className="plan-spec"><span>Эксклюзивные косметические предметы</span><span>Набор титулов профиля</span><span>Особенная рамка профиля</span></div><b className="plan-price">€2,99 / мес.</b><button className="outline" onClick={()=>setNotice("Подписки пока концептуальные. Оплата и выдача предметов не подключены.")}>Скоро</button></article><article className="plan-card featured"><span className="plan-label vipplus"><Crown size={12}/> VIP+</span><h3>VIP+</h3><p>Расширенная косметическая коллекция</p><div className="plan-spec"><span>Все косметические наборы VIP</span><span>Дополнительные редкие титулы</span><span>Расширенная рамка и эффекты профиля</span></div><b className="plan-price">€5,99 / мес.</b><button className="primary" onClick={()=>setNotice("Подписки пока концептуальные. Оплата и выдача предметов не подключены.")}>Скоро</button></article></div></div>
        <div className="prototype-note"><ShieldCheck size={16}/> Витрина и категории готовы как интерфейс. Баланс, инвентарь и покупки пока отключены.</div>
      </section>}
      {page === "Друзья" && <section className="content community-content"><div className="page-title"><div className="eyebrow"><Users size={13}/> COMMUNITY</div><h1>Друзья</h1><p>Твой круг игроков в L.o.S.A. — независимо от издания Minecraft.</p></div><div className="community-panel"><div className="panel-heading"><div><b>Найти игроков</b><small>Поиск по нику — пока демонстрационный</small></div></div><div className="search-field friend-search"><Search size={16}/><input value={friendQuery} onChange={e=>setFriendQuery(e.target.value)} placeholder="Введи игровой ник…"/></div><div className="friend-results">{[{name:"Alex",title:"Исследователь",status:"В сети"},{name:"Mira",title:"Хранитель миров",status:"Недавно была"},{name:"Jamie",title:"Мастер редстоуна",status:"В сети"}].filter(f=>f.name.toLowerCase().includes(friendQuery.toLowerCase())||f.title.toLowerCase().includes(friendQuery.toLowerCase())).map(f=><div className="friend-result" key={f.name}><span className="direct-avatar">{f.name[0]}</span><div><b>{f.name}</b><small>{f.title}</small></div><span className="friend-presence">{f.status}</span><button className="outline" onClick={()=>setNotice("Заявки в друзья заработают после подключения аккаунтов L.o.S.A.")}>Добавить</button></div>)}</div></div><div className="referral-panel community-panel"><div className="referral-top"><div><span className="panel-kicker">ПРИГЛАШАЙ ДРУЗЕЙ</span><h2>Твой код приглашения</h2><p>Делись кодом L.o.S.A. и собирай свою команду</p></div><div className="referral-icon"><Users size={30}/></div></div><div className="referral-code"><div><small>ЛИЧНЫЙ КОД</small><b>Появится после запуска аккаунтов</b></div><span className="coming">Скоро</span></div><div className="referral-progress"><div className="referral-progress-head"><b>Путь к модератору</b><strong>0 из 5 друзей</strong></div><div className="referral-track"><span style={{width:"0%"}}/></div><p>Когда пять приглашённых пользователей зарегистрируются по твоему коду и подтвердят аккаунты, система автоматически назначит тебе роль модератора.</p></div><div className="role-ladder"><div className="role-row owner"><span className="role-symbol"><Crown size={16}/></span><div><b>Владелец</b><small>Ты — создатель L.o.S.A. Полный контроль над проектом.</small></div><span className="role-tag">Ты</span></div><div className="role-row deputy"><span className="role-symbol"><ShieldCheck size={16}/></span><div><b>Заместитель владельца</b><small>Выше администратора. Назначается и снимается только лично владельцем.</small></div><span className="role-tag">Личное назначение</span></div><div className="role-row trusted"><span className="role-symbol"><ShieldCheck size={16}/></span><div><b>Доверенный админ</b><small>Назначается лично владельцем за особое доверие. Получает расширенные полномочия в рамках поручений.</small></div><span className="role-tag">Личное назначение</span></div><div className="role-row admin"><span className="role-symbol"><Shield size={16}/></span><div><b>Администратор</b><small>Управление сообществом и модерацией в пределах выданных прав.</small></div></div><div className="role-row moderator"><span className="role-symbol"><Users size={16}/></span><div><b>Модератор</b><small>Автоматически за пять подтверждённых приглашений. Помогает поддерживать порядок.</small></div><span className="role-tag">5 приглашений</span></div><div className="role-row member"><span className="role-symbol"><Users size={16}/></span><div><b>Игрок</b><small>Стандартная роль участника сообщества.</small></div></div></div><p className="referral-safety"><ShieldCheck size={14}/> Приглашения должны подтверждаться сервером: один аккаунт — один учёт, собственные и повторные регистрации не засчитываются. Роль нельзя выдать изменением локальных файлов.</p></div>\n<div className="prototype-note"><ShieldCheck size={16}/> Пока используется локальный Offline-профиль. Общие друзья появятся после запуска аккаунтов.</div></section>}
      {page === "Моды и сборки" && <section className="content empty-page"><div className="empty-icon"><Layers3/></div><div className="eyebrow">L.o.S.A. · MODS</div><h1>Моды и сборки</h1><p>Каталог модов и управление зависимостями будут добавлены отдельным этапом.</p><span className="coming">Каталог готовится</span></section>}

      {(error || notice) && <div className={error ? "toast error-toast" : "toast"} onClick={() => { setError(""); setNotice(""); }}>{error || notice}<button aria-label="Закрыть">×</button></div>}
      <footer><span>© 2026 L.o.S.A.</span></footer>
    </main>
  </div>;
}
