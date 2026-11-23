import { useEffect, useState } from "react";
import { Home, Gamepad2, Users, Layers3, Server, Settings, Plus, Play, ChevronDown, Sparkles, ShieldCheck, CircleHelp, RefreshCw, MonitorDown } from "lucide-react";
import { getMinecraftVersions, type MinecraftVersion } from "./lib/minecraft";
import { invoke } from "@tauri-apps/api/core";

type Page = "Главная" | "Играть" | "Друзья" | "Моды и сборки" | "Серверы" | "Настройки";
const nav: { name: Page; icon: typeof Home }[] = [
  { name: "Главная", icon: Home }, { name: "Играть", icon: Gamepad2 }, { name: "Друзья", icon: Users },
  { name: "Моды и сборки", icon: Layers3 }, { name: "Серверы", icon: Server }, { name: "Настройки", icon: Settings }
];
export default function App() {
  const [page, setPage] = useState<Page>("Главная");
  const [edition, setEdition] = useState<"Java Edition" | "Bedrock Edition">("Java Edition");
  const [version, setVersion] = useState("1.21.4");
  const [notice, setNotice] = useState("");
  const [instances, setInstances] = useState(["Выживание 1.21.4"]);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [versions, setVersions] = useState<MinecraftVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState("");
  const [javaInfo, setJavaInfo] = useState("Проверка Java...");
  const [javaChecking, setJavaChecking] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [installedClient, setInstalledClient] = useState<{versionId:string;clientPath:string;metadataPath:string;clientSize:number}|null>(null);
  const [dependenciesBusy, setDependenciesBusy] = useState(false);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [dependencyReport, setDependencyReport] = useState<{versionId:string;librariesDownloaded:number;librariesTotal:number;assetsDownloaded:number;assetsTotal:number;bytesDownloaded:number;libraryDir:string;assetsDir:string}|null>(null);
  const [microsoftConfigured, setMicrosoftConfigured] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [deviceCode, setDeviceCode] = useState<{deviceCode:string;userCode:string;verificationUri:string;interval:number;expiresIn:number}|null>(null);
  const [minecraftUser, setMinecraftUser] = useState<{id:string;name:string}|null>(null);
  const [loginError, setLoginError] = useState("");
  const [authMode, setAuthMode] = useState<"offline" | "microsoft">("offline");
  const [offlineName, setOfflineName] = useState(() => localStorage.getItem("losa.offlineName") ?? "");
  const [offlineNameDraft, setOfflineNameDraft] = useState(() => localStorage.getItem("losa.offlineName") ?? "");
  const saveOfflineProfile = () => {
    const name = offlineNameDraft.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      setNotice("Ник должен содержать 3–16 символов: латинские буквы, цифры или _.");
      return;
    }
    localStorage.setItem("losa.offlineName", name);
    localStorage.setItem("losa.authMode", "offline");
    setOfflineName(name);
    setAuthMode("offline");
    setNotice("Локальный профиль " + name + " выбран.");
  };

  const loadVersions = async () => {
    setVersionsLoading(true); setVersionsError("");
    try {
      const manifest = await getMinecraftVersions();
      setVersions(manifest.versions.filter(v => v.type === "release").slice(0, 80));
      setVersion(manifest.latest.release);
    } catch (error) {
      setVersionsError(error instanceof Error ? error.message : "Ошибка загрузки списка версий");
    } finally { setVersionsLoading(false); }
  };
  const checkJava = async () => {
    setJavaChecking(true);
    try {
      const result = await invoke<string>("detect_java");
      setJavaInfo(result);
    } catch {
      setJavaInfo("Проверка Java доступна только в установленном приложении L.o.S.A.");
    } finally { setJavaChecking(false); }
  };
  useEffect(() => { void loadVersions(); void checkJava(); void invoke<boolean>("microsoft_auth_configured").then(setMicrosoftConfigured).catch(() => setMicrosoftConfigured(false)); }, []);
  useEffect(() => {
    let active = true;
    invoke<any>("get_minecraft_installation_status", { versionId: version })
      .then(status => {
        if (!active) return;
        setInstalledClient(status.installedClient ?? null);
        setDependencyReport(status.dependencyReport ?? null);
      })
      .catch(() => {
        if (!active) return;
        setInstalledClient(null);
        setDependencyReport(null);
      });
    return () => { active = false; };
  }, [version]);
  const active = instances[0] ?? "Нет выбранной сборки";
  const runAction = async () => {
    if (edition !== "Java Edition") { setNotice("Bedrock Edition пока не поддерживается запуском из L.o.S.A."); return; }
    if (authMode === "offline" && !/^[A-Za-z0-9_]{3,16}$/.test(offlineName)) {
      setNotice("Сначала создай локальный профиль в разделе «Настройки».");
      setPage("Настройки");
      return;
    }
    if (authMode === "microsoft" && !minecraftUser) {
      setNotice("Сначала войди через Microsoft в разделе «Настройки».");
      setPage("Настройки");
      return;
    }
    setLaunchBusy(true); setVersionsError("");
    try {
      const pid = await invoke<number>("launch_minecraft", {
        versionId: version,
        authMode,
        offlineName: authMode === "offline" ? offlineName : null
      });
      setNotice(`Minecraft ${version} запущен. PID процесса: ${pid}.`);
    } catch (error) {
      setVersionsError(String(error));
    } finally { setLaunchBusy(false); }
  };
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img src="/losa-logo.png" /><div><b>L.o.S.A.</b><span>LAUNCHER OF SPARK ANVIL</span></div></div>
      <div className="profile"><div className="avatar">{(authMode === "microsoft" ? minecraftUser?.name : offlineName || "Г").slice(0,1).toUpperCase()}</div><div className="profile-copy"><b>{authMode === "microsoft" ? minecraftUser?.name ?? "Microsoft" : offlineName || "Гость"}</b><span>{authMode === "microsoft" ? "Microsoft · лицензия" : "Локальный Offline-профиль"}</span></div><ChevronDown size={15}/></div>
      <div className="nav-label">БИБЛИОТЕКА</div>
      <nav>{nav.map(({name,icon:Icon}) => <button key={name} className={page===name?"nav-item selected":"nav-item"} onClick={()=>setPage(name)}><Icon size={18}/><span>{name}</span>{name==="Друзья" && <i>0</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="status-dot"/> {authMode === "microsoft" ? "Microsoft" : "Offline-режим"} <span className="version">v0.9.2</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">L.o.S.A. <span>/</span> {page}</div><button className="icon-button" title="Справка" onClick={()=>setNotice("L.o.S.A. — ранняя версия лаунчера. Некоторые разделы пока являются демонстрационными.")}><CircleHelp size={18}/></button></header>
      {page==="Главная" && <section className="content">
        <div className="hero"><div className="hero-copy"><div className="eyebrow"><Sparkles size={14}/> ВАШ MINECRAFT. ВАШИ ПРАВИЛА.</div><h1>Добро пожаловать<br/><em>в L.o.S.A.</em></h1><p>Твоя точка входа в Minecraft — сборки, друзья и приключения в одном месте.</p><button className="primary" onClick={()=>setPage("Играть")}><Play size={16} fill="currentColor"/> Перейти к игре</button></div><img className="hero-mark" src="/losa-logo.png"/></div>
        <div className="section-head"><div><h2>Быстрый доступ</h2><p>Продолжи с того места, где остановился</p></div></div>
        <div className="quick-grid"><button className="quick-card" onClick={()=>setPage("Играть")}><div className="quick-icon"><Gamepad2/></div><b>Мои сборки</b><span>{instances.length} локальная сборка</span></button><button className="quick-card" onClick={()=>setPage("Друзья")}><div className="quick-icon"><Users/></div><b>Друзья</b><span>Социальные функции — впереди</span></button><button className="quick-card" onClick={()=>setPage("Серверы")}><div className="quick-icon"><Server/></div><b>Серверы</b><span>Твой список серверов</span></button></div>
        <div className="notice"><ShieldCheck size={18}/><span><b>Ранняя версия</b><br/>Это ранняя версия. Запуск Minecraft Java уже подключается, а моды, сетевые функции и часть разделов ещё разрабатываются.</span></div>
      </section>}
      {page==="Играть" && <section className="content narrow"><div className="page-title"><div className="eyebrow">ИГРОВОЙ ЦЕНТР</div><h1>Мои сборки</h1><p>Управляй игровыми профилями и версиями Minecraft.</p></div><div className="instance-card"><div className="instance-art"><img src="/losa-logo.png"/></div><div className="instance-info"><span className="tag">ЛОКАЛЬНЫЙ ПРОФИЛЬ</span><h2>{active}</h2><p>{edition} · Minecraft {version}</p><div className="instance-controls"><select value={edition} onChange={e=>setEdition(e.target.value as typeof edition)}><option>Java Edition</option><option>Bedrock Edition</option></select><select value={version} onChange={e=>setVersion(e.target.value)}>{versions.length ? versions.map(v=><option key={v.id} value={v.id}>{v.id}</option>) : <option>1.21.4</option>}</select></div></div><button className="primary launch" onClick={runAction} disabled={launchBusy||edition!=="Java Edition"}><Play size={16} fill="currentColor"/> {launchBusy?"Запуск…":"Играть"}</button></div><div className="install-panel"><div><b>Файлы Minecraft {version}</b><small>{installedClient?.versionId===version ? `Клиент проверен и сохранён · ${(installedClient.clientSize/1024/1024).toFixed(1)} МБ` : "Скачать официальный клиент и проверить SHA-1"}</small>{installedClient?.versionId===version&&<small className="muted">{installedClient.clientPath}</small>}</div><button className="primary" disabled={installBusy||edition!=="Java Edition"||versions.length===0} onClick={async()=>{setInstallBusy(true);setVersionsError("");try{const result=await invoke<any>("install_vanilla_client",{versionId:version});setInstalledClient(result);setNotice(`Клиент Minecraft ${result.versionId} скачан и проверен.`);}catch(error){setVersionsError(String(error));}finally{setInstallBusy(false);}}}>{installBusy?"Загрузка…":installedClient?.versionId===version?"Переустановить клиент":"Установить клиент"}</button></div><div className="install-panel"><div><b>Библиотеки и ресурсы Minecraft {version}</b><small>{dependencyReport?.versionId===version ? `Готово · ${dependencyReport.librariesTotal} библиотек · ${dependencyReport.assetsTotal.toLocaleString("ru-RU")} ресурсов · ${(dependencyReport.bytesDownloaded/1024/1024).toFixed(1)} МБ загружено сейчас` : "Загрузить библиотеки и игровые ресурсы по официальным метаданным"}</small></div><button className="primary" disabled={dependenciesBusy||installedClient?.versionId!==version} onClick={async()=>{setDependenciesBusy(true);setVersionsError("");try{const result=await invoke<any>("install_minecraft_dependencies",{versionId:version});setDependencyReport(result);setNotice(`Подготовка Minecraft ${result.versionId} завершена: библиотеки и ресурсы загружены.`);}catch(error){setVersionsError(String(error));}finally{setDependenciesBusy(false);}}}>{dependenciesBusy?"Загрузка файлов…":dependencyReport?.versionId===version?"Проверить файлы":"Загрузить файлы"}</button></div>{versionsError&&<p className="error small">{versionsError}</p>}<p className="muted small">Клиентский JAR, библиотеки и игровые ресурсы устанавливаются отдельно. Для запуска нужны клиент, библиотеки, ресурсы и совместимая Java. Можно играть с локальным Offline-профилем или через Microsoft.</p><button className="outline add" onClick={()=>setShowCreate(!showCreate)}><Plus size={17}/> Добавить сборку</button>{showCreate&&<div className="create-row"><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Название сборки"/><button className="primary" onClick={()=>{if(newName.trim()){setInstances(v=>[newName.trim(),...v]);setNewName("");setShowCreate(false);setNotice("Локальная запись сборки добавлена.");}}}>Создать</button></div>}<div className="runtime-panel"><div><MonitorDown size={17}/><span><b>Java Runtime</b><small>{javaInfo}</small></span></div><button className="outline" onClick={checkJava} disabled={javaChecking}><RefreshCw size={14}/> Проверить</button></div>{versionsError&&<p className="error small">{versionsError}</p>}<div className="manifest-line"><span>{versionsLoading?"Загружаем официальный каталог Minecraft…":`Официальный каталог Mojang · ${versions.length} релизов`}</span><button onClick={loadVersions} disabled={versionsLoading}>Обновить список</button></div><p className="muted small">L.o.S.A. получает список релизов из официального каталога Mojang. Клиент, библиотеки и ресурсы загружаются отдельно. Для запуска требуется вход через Microsoft и совместимая Java.</p></section>}
      {page==="Настройки"&&<section className="content narrow"><div className="page-title"><div className="eyebrow">АККАУНТ И ПРИЛОЖЕНИЕ</div><h1>Настройки</h1><p>Подключение Microsoft и параметры L.o.S.A.</p></div><div className="settings-card offline-profile-card"><div className="settings-heading"><div className="quick-icon"><Gamepad2/></div><div><b>Локальный профиль (Offline)</b><small>Быстрый вход по игровому нику — без почты, пароля и Azure</small></div><span className={authMode === "offline" && offlineName ? "connected" : "disconnected"}>{authMode === "offline" && offlineName ? "Активен" : "Не выбран"}</span></div><label className="field-label" htmlFor="offline-player-name">Игровой ник</label><input id="offline-player-name" className="wide-input" value={offlineNameDraft} onChange={e=>setOfflineNameDraft(e.target.value)} maxLength={16} placeholder="Например, Steve_123"/><p className="muted small">От 3 до 16 символов: латинские буквы, цифры и подчёркивание. Профиль хранится на этом компьютере и не подтверждает владение Minecraft.</p><button className="primary" onClick={saveOfflineProfile}>{authMode === "offline" ? "Сохранить локальный профиль" : "Играть с этим ником"}</button></div><div className="settings-card"><div className="settings-heading"><div className="quick-icon"><ShieldCheck/></div><div><b>Microsoft Account</b><small>Безопасный вход через официальный Device Code Flow</small></div><span className={minecraftUser?"connected":"disconnected"}>{minecraftUser?"Подключено":"Не подключено"}</span></div>{minecraftUser?<div className="account-row"><div className="avatar">{minecraftUser.name.slice(0,1).toUpperCase()}</div><div><b>{minecraftUser.name}</b><small>Профиль Minecraft Java · {minecraftUser.id}</small></div><>{authMode !== "microsoft" && <button className="outline" onClick={()=>{setAuthMode("microsoft");setNotice("Для запуска будет использоваться Microsoft-профиль.");}}>Использовать Microsoft</button>}<button className="outline" onClick={async()=>{try{await invoke("logout_minecraft");setMinecraftUser(null);setDeviceCode(null);if(offlineName){setAuthMode("offline");localStorage.setItem("losa.authMode","offline");}setNotice("Игровая сессия завершена.");}catch(error){setNotice("Не удалось завершить сессию: "+String(error));}}}>Выйти</button></>}</div>:<><p className="muted small">Для подключения Minecraft откроется официальная страница Microsoft. Пароль вводится только на сайте Microsoft — L.o.S.A. его не видит.</p>{!microsoftConfigured&&<p className="error small">Подключение Microsoft пока не настроено в этой сборке. Это настройка разработчика; игрокам не нужно создавать приложение или вводить Client ID.</p>}<button className="primary" disabled={loginBusy||!microsoftConfigured} onClick={async()=>{setLoginBusy(true);setLoginError("");try{const code=await invoke<any>("start_microsoft_login");setDeviceCode(code);}catch(e){setLoginError(String(e));}finally{setLoginBusy(false);}}}><ShieldCheck size={16}/> {loginBusy?"Подключение…":"Войти через Microsoft"}</button>{deviceCode&&<div className="device-box"><b>Введи этот код на сайте Microsoft</b><strong>{deviceCode.userCode}</strong><a href={deviceCode.verificationUri} target="_blank" rel="noreferrer">{deviceCode.verificationUri}</a><small>После подтверждения нажми кнопку ниже. Код действует ограниченное время.</small><button className="primary" disabled={loginBusy} onClick={async()=>{setLoginBusy(true);setLoginError("");try{const profile=await invoke<any>("complete_microsoft_login",{deviceCode:deviceCode.deviceCode,interval:deviceCode.interval,expiresIn:deviceCode.expiresIn});setMinecraftUser(profile);setAuthMode("microsoft");setDeviceCode(null);setNotice("Успешный вход: "+profile.name);}catch(e){setLoginError(String(e));}finally{setLoginBusy(false);}}}>{loginBusy?"Ожидаем подтверждение…":"Я подтвердил вход — продолжить"}</button></div>}{loginError&&<p className="error small">{loginError}</p>}</>}</div><div className="notice"><ShieldCheck size={18}/><span><b>Безопасность</b><br/>L.o.S.A. не просит и не получает твой пароль Microsoft. На этом этапе токены используются только в текущем сеансе и не сохраняются на диск.</span></div></section>}
      {page!=="Главная"&&page!=="Играть"&&page!=="Настройки"&&<section className="content empty-page"><div className="empty-icon">{page==="Друзья"?<Users/>:page==="Моды и сборки"?<Layers3/>:<Server/>}</div><div className="eyebrow">L.o.S.A. · В РАЗРАБОТКЕ</div><h1>{page}</h1><p>{page==="Друзья"?"Здесь появятся список друзей, приглашения и совместные лобби.":page==="Моды и сборки"?"Здесь появится поиск модов и управление сборками.":"Здесь появятся избранные серверы и быстрые подключения."}</p><span className="coming">Этот раздел запланирован для следующих этапов</span></section>}
      {notice&&<div className="toast" onClick={()=>setNotice("")}>{notice}<button aria-label="Закрыть">×</button></div>}
      <footer><span>© 2026 L.o.S.A. · Launcher of Spark Anvil</span><span>Сделано Spark_Anvil</span></footer>
    </main>
  </div>;
}