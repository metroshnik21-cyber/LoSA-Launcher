use serde::{Deserialize, Serialize};
use sha1::Digest;
use std::time::Duration;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceCodeInfo {
    device_code: String,
    user_code: String,
    verification_uri: String,
    message: String,
    interval: u64,
    expires_in: u64,
}

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    message: String,
    interval: Option<u64>,
    expires_in: u64,
}

#[derive(Deserialize)]
struct MicrosoftToken {
    access_token: String,
    #[allow(dead_code)]
    refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct XboxAuthResponse {
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: XboxDisplayClaims,
}

#[derive(Deserialize)]
struct XboxDisplayClaims {
    xui: Vec<XboxUserClaim>,
}

#[derive(Deserialize)]
struct XboxUserClaim {
    uhs: String,
}

#[derive(Deserialize)]
struct MinecraftLoginResponse {
    access_token: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MinecraftProfile {
    id: String,
    name: String,
}

#[derive(Clone)]
struct MinecraftAuthSession {
    access_token: String,
    profile: MinecraftProfile,
}

fn auth_error(message: impl Into<String>) -> String {
    message.into()
}

#[tauri::command]
async fn start_microsoft_login(client_id: String) -> Result<DeviceCodeInfo, String> {
    if client_id.trim().is_empty() {
        return Err("Сначала укажи Microsoft OAuth Client ID в настройках L.o.S.A.".into());
    }
    let client = reqwest::Client::new();
    let response = client
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
        .form(&[("client_id", client_id.trim()), ("scope", "XboxLive.signin offline_access")])
        .send().await.map_err(|e| auth_error(format!("Не удалось связаться с Microsoft: {e}")))?;
    if !response.status().is_success() {
        return Err(format!("Microsoft OAuth вернул HTTP {}", response.status()));
    }
    let data: DeviceCodeResponse = response.json().await
        .map_err(|e| auth_error(format!("Не удалось прочитать ответ Microsoft: {e}")))?;
    Ok(DeviceCodeInfo {
        device_code: data.device_code, user_code: data.user_code,
        verification_uri: data.verification_uri, message: data.message,
        interval: data.interval.unwrap_or(5), expires_in: data.expires_in,
    })
}

#[tauri::command]
async fn complete_microsoft_login(client_id: String, device_code: String, interval: u64, expires_in: u64, auth_state: tauri::State<'_, std::sync::Mutex<Option<MinecraftAuthSession>>>) -> Result<MinecraftProfile, String> {
    let client = reqwest::Client::new();
    let started = std::time::Instant::now();
    let mut delay = interval.max(5);
    let microsoft_token = loop {
        if started.elapsed().as_secs() >= expires_in {
            return Err("Время действия кода истекло. Начни вход заново.".into());
        }
        tokio::time::sleep(Duration::from_secs(delay)).await;
        let response = client.post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("client_id", client_id.trim()), ("device_code", device_code.as_str()),
            ])
            .send().await.map_err(|e| auth_error(format!("Ошибка ожидания входа Microsoft: {e}")))?;
        let status = response.status();
        let body: serde_json::Value = response.json().await
            .map_err(|e| auth_error(format!("Некорректный ответ Microsoft: {e}")))?;
        if status.is_success() {
            break serde_json::from_value::<MicrosoftToken>(body)
                .map_err(|e| auth_error(format!("В ответе Microsoft нет токена: {e}")))?;
        }
        match body.get("error").and_then(|v| v.as_str()).unwrap_or("") {
            "authorization_pending" => continue,
            "slow_down" => { delay += 5; continue; }
            "authorization_declined" => return Err("Вход был отменён в окне Microsoft.".into()),
            "expired_token" => return Err("Код входа истёк. Начни заново.".into()),
            other => return Err(format!("Microsoft OAuth: {}", if other.is_empty() { "неизвестная ошибка" } else { other })),
        }
    };
    let xbox = client.post("https://user.auth.xboxlive.com/user/authenticate")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "Properties": {"AuthMethod":"RPS","SiteName":"user.auth.xboxlive.com","RpsTicket":format!("d={}",microsoft_token.access_token)},
            "RelyingParty":"http://auth.xboxlive.com","TokenType":"JWT"
        }))
        .send().await.map_err(|e| auth_error(format!("Ошибка Xbox Live: {e}")))?;
    if !xbox.status().is_success() {
        return Err(format!("Xbox Live не принял авторизацию (HTTP {}). Проверь Xbox-профиль.", xbox.status()));
    }
    let xbox_data: XboxAuthResponse = xbox.json().await
        .map_err(|e| auth_error(format!("Не удалось прочитать ответ Xbox Live: {e}")))?;
    let user_hash = xbox_data.display_claims.xui.first()
        .ok_or_else(|| "Xbox Live не вернул идентификатор пользователя.".to_string())?.uhs.clone();
    let xsts = client.post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "Properties":{"SandboxId":"RETAIL","UserTokens":[xbox_data.token]},
            "RelyingParty":"rp://api.minecraftservices.com/","TokenType":"JWT"
        }))
        .send().await.map_err(|e| auth_error(format!("Ошибка Xbox XSTS: {e}")))?;
    if !xsts.status().is_success() {
        return Err(format!("Xbox XSTS отклонил вход (HTTP {}). Возможно, нужно настроить Xbox-профиль или семейные разрешения.", xsts.status()));
    }
    let xsts_data: XboxAuthResponse = xsts.json().await
        .map_err(|e| auth_error(format!("Не удалось прочитать ответ XSTS: {e}")))?;
    let minecraft = client.post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .header("Accept", "application/json")
        .json(&serde_json::json!({"identityToken":format!("XBL3.0 x={};{}",user_hash,xsts_data.token)}))
        .send().await.map_err(|e| auth_error(format!("Ошибка Minecraft Services: {e}")))?;
    if !minecraft.status().is_success() {
        return Err(format!("Minecraft Services отклонил вход (HTTP {}). Проверь лицензию Minecraft Java и доступ к Minecraft Services.", minecraft.status()));
    }
    let mc_token: MinecraftLoginResponse = minecraft.json().await
        .map_err(|e| auth_error(format!("Не удалось получить Minecraft-токен: {e}")))?;
    let profile = client.get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(mc_token.access_token.clone()).send().await
        .map_err(|e| auth_error(format!("Не удалось получить профиль Minecraft: {e}")))?;
    if !profile.status().is_success() {
        return Err(format!("Профиль Minecraft недоступен (HTTP {}). Возможно, у аккаунта нет профиля Java Edition.", profile.status()));
    }
    let profile = profile.json::<MinecraftProfile>().await
        .map_err(|e| auth_error(format!("Не удалось прочитать профиль Minecraft: {e}")))?;
    let session = MinecraftAuthSession { access_token: mc_token.access_token, profile: profile.clone() };
    *auth_state.lock().map_err(|_| "Не удалось сохранить текущую игровую сессию.".to_string())? = Some(session);
    Ok(profile)
}

#[tauri::command]
fn minecraft_auth_status(auth_state: tauri::State<'_, std::sync::Mutex<Option<MinecraftAuthSession>>>) -> Option<MinecraftProfile> {
    auth_state.lock().ok().and_then(|session| session.as_ref().map(|s| s.profile.clone()))
}

#[tauri::command]
fn logout_minecraft(auth_state: tauri::State<'_, std::sync::Mutex<Option<MinecraftAuthSession>>>) -> Result<(), String> {
    *auth_state.lock().map_err(|_| "Не удалось завершить игровую сессию.".to_string())? = None;
    Ok(())
}


#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledClientInfo {
    version_id: String,
    client_path: String,
    metadata_path: String,
    client_size: u64,
}

#[tauri::command]
async fn install_vanilla_client(version_id: String) -> Result<InstalledClientInfo, String> {
    let version_id = version_id.trim();
    if version_id.is_empty() || !version_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err("Некорректный идентификатор версии Minecraft.".into());
    }

    let client = reqwest::Client::new();
    let manifest_response = client
        .get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
        .send().await.map_err(|e| format!("Не удалось загрузить каталог Mojang: {e}"))?;
    if !manifest_response.status().is_success() {
        return Err(format!("Каталог Mojang вернул HTTP {}", manifest_response.status()));
    }
    let manifest: serde_json::Value = manifest_response.json().await
        .map_err(|e| format!("Некорректный каталог Mojang: {e}"))?;
    let entry = manifest.get("versions").and_then(|v| v.as_array())
        .and_then(|versions| versions.iter().find(|v| v.get("id").and_then(|x| x.as_str()) == Some(version_id)))
        .ok_or_else(|| format!("Версия Minecraft {version_id} отсутствует в официальном каталоге Mojang."))?;
    let metadata_url = entry.get("url").and_then(|v| v.as_str())
        .ok_or_else(|| "В каталоге отсутствует ссылка на метаданные версии.".to_string())?;
    let parsed_metadata_url = reqwest::Url::parse(metadata_url)
        .map_err(|_| "Mojang вернул некорректную ссылку на метаданные.".to_string())?;
    if parsed_metadata_url.scheme() != "https" || !(parsed_metadata_url.host_str().unwrap_or("") == "mojang.com" || parsed_metadata_url.host_str().unwrap_or("").ends_with(".mojang.com")) {
        return Err("Отклонена небезопасная ссылка на метаданные версии.".into());
    }

    let metadata_response = client.get(parsed_metadata_url).send().await
        .map_err(|e| format!("Не удалось загрузить метаданные версии: {e}"))?;
    if !metadata_response.status().is_success() {
        return Err(format!("Метаданные версии вернули HTTP {}", metadata_response.status()));
    }
    let metadata_bytes = metadata_response.bytes().await
        .map_err(|e| format!("Не удалось прочитать метаданные версии: {e}"))?;
    let metadata: serde_json::Value = serde_json::from_slice(&metadata_bytes)
        .map_err(|e| format!("Метаданные версии повреждены: {e}"))?;
    let download = metadata.get("downloads").and_then(|v| v.get("client"))
        .ok_or_else(|| "В метаданных этой версии нет клиентского файла.".to_string())?;
    let client_url = download.get("url").and_then(|v| v.as_str())
        .ok_or_else(|| "В метаданных отсутствует ссылка на клиент Minecraft.".to_string())?;
    let expected_sha1 = download.get("sha1").and_then(|v| v.as_str())
        .ok_or_else(|| "В метаданных отсутствует SHA-1 клиента.".to_string())?.to_ascii_lowercase();
    let parsed_client_url = reqwest::Url::parse(client_url)
        .map_err(|_| "Mojang вернул некорректную ссылку на клиент.".to_string())?;
    if parsed_client_url.scheme() != "https" || !(parsed_client_url.host_str().unwrap_or("") == "mojang.com" || parsed_client_url.host_str().unwrap_or("").ends_with(".mojang.com")) {
        return Err("Отклонена небезопасная ссылка на клиент Minecraft.".into());
    }

    let client_response = client.get(parsed_client_url).send().await
        .map_err(|e| format!("Не удалось скачать клиент Minecraft: {e}"))?;
    if !client_response.status().is_success() {
        return Err(format!("Сервер загрузки клиента вернул HTTP {}", client_response.status()));
    }
    let client_bytes = client_response.bytes().await
        .map_err(|e| format!("Ошибка чтения загруженного клиента: {e}"))?;
    let actual_sha1 = format!("{:x}", sha1::Sha1::digest(&client_bytes));
    if actual_sha1 != expected_sha1 {
        return Err("Проверка целостности не пройдена: SHA-1 клиента не совпадает с каталогом Mojang. Файл не установлен.".into());
    }

    let app_data = std::env::var_os("APPDATA")
        .map(std::path::PathBuf::from)
        .ok_or_else(|| "Не найдена папка APPDATA Windows.".to_string())?;
    let version_dir = app_data.join("L-o-S-A").join("versions").join(version_id);
    std::fs::create_dir_all(&version_dir)
        .map_err(|e| format!("Не удалось создать папку версии: {e}"))?;
    let client_path = version_dir.join(format!("{version_id}.jar"));
    let metadata_path = version_dir.join(format!("{version_id}.json"));
    let temp_client = version_dir.join(format!("{version_id}.jar.download"));
    std::fs::write(&temp_client, &client_bytes)
        .map_err(|e| format!("Не удалось сохранить клиент: {e}"))?;
    if client_path.exists() {
        std::fs::remove_file(&client_path)
            .map_err(|e| format!("Не удалось заменить предыдущий клиент: {e}"))?;
    }
    std::fs::rename(&temp_client, &client_path)
        .map_err(|e| format!("Не удалось завершить установку клиента: {e}"))?;
    std::fs::write(&metadata_path, &metadata_bytes)
        .map_err(|e| format!("Клиент скачан, но не удалось сохранить метаданные: {e}"))?;

    Ok(InstalledClientInfo {
        version_id: version_id.to_string(),
        client_path: client_path.to_string_lossy().to_string(),
        metadata_path: metadata_path.to_string_lossy().to_string(),
        client_size: client_bytes.len() as u64,
    })
}



#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DependencyInstallReport {
    version_id: String,
    libraries_downloaded: usize,
    assets_downloaded: usize,
    assets_total: usize,
    bytes_downloaded: u64,
    library_dir: String,
    assets_dir: String,
}

fn trusted_download_url(raw: &str, allowed_hosts: &[&str]) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "В метаданных обнаружена некорректная ссылка.".to_string())?;
    let host = url.host_str().unwrap_or("");
    if url.scheme() != "https" || !allowed_hosts.iter().any(|allowed| host == *allowed || host.strip_suffix(*allowed).is_some_and(|prefix| prefix.ends_with('.'))) {
        return Err(format!("Отклонена небезопасная ссылка загрузки: {host}"));
    }
    Ok(url)
}

fn safe_relative_path(raw: &str) -> Result<std::path::PathBuf, String> {
    let path = std::path::Path::new(raw);
    if raw.is_empty() || path.is_absolute() || path.components().any(|c| !matches!(c, std::path::Component::Normal(_))) {
        return Err("Метаданные содержат небезопасный путь файла.".into());
    }
    Ok(path.to_path_buf())
}

async fn download_verified_file(
    client: &reqwest::Client,
    url: &str,
    destination: &std::path::Path,
    expected_sha1: Option<&str>,
) -> Result<u64, String> {
    if destination.is_file() {
        if let Some(expected) = expected_sha1 {
            let existing = std::fs::read(destination).map_err(|e| format!("Не удалось проверить файл: {e}"))?;
            if format!("{:x}", sha1::Sha1::digest(&existing)) == expected.to_ascii_lowercase() {
                return Ok(0);
            }
        } else {
            return Ok(0);
        }
    }
    let response = client.get(url).send().await.map_err(|e| format!("Ошибка загрузки файла: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Сервер загрузки вернул HTTP {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(|e| format!("Не удалось прочитать файл: {e}"))?;
    if let Some(expected) = expected_sha1 {
        let actual = format!("{:x}", sha1::Sha1::digest(&bytes));
        if actual != expected.to_ascii_lowercase() {
            return Err("SHA-1 загруженного файла не совпадает с официальными метаданными.".into());
        }
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Не удалось создать папку загрузки: {e}"))?;
    }
    let temp = destination.with_extension("losa-download");
    std::fs::write(&temp, &bytes).map_err(|e| format!("Не удалось сохранить временный файл: {e}"))?;
    if destination.exists() {
        std::fs::remove_file(destination).map_err(|e| format!("Не удалось заменить старый файл: {e}"))?;
    }
    std::fs::rename(&temp, destination).map_err(|e| format!("Не удалось завершить сохранение файла: {e}"))?;
    Ok(bytes.len() as u64)
}

#[tauri::command]
async fn install_minecraft_dependencies(version_id: String) -> Result<DependencyInstallReport, String> {
    let version_id = version_id.trim();
    if version_id.is_empty() || !version_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err("Некорректный идентификатор версии Minecraft.".into());
    }
    let app_data = std::env::var_os("APPDATA").map(std::path::PathBuf::from)
        .ok_or_else(|| "Не найдена папка APPDATA Windows.".to_string())?;
    let root = app_data.join("L-o-S-A");
    let version_dir = root.join("versions").join(version_id);
    let metadata_path = version_dir.join(format!("{version_id}.json"));
    let metadata_bytes = std::fs::read(&metadata_path)
        .map_err(|_| format!("Сначала установи клиент Minecraft {version_id}."))?;
    let metadata: serde_json::Value = serde_json::from_slice(&metadata_bytes)
        .map_err(|e| format!("Не удалось прочитать метаданные версии: {e}"))?;
    let client = reqwest::Client::builder().user_agent("L.o.S.A. Launcher/0.7").build()
        .map_err(|e| format!("Не удалось подготовить загрузчик: {e}"))?;
    let library_dir = root.join("libraries");
    let assets_dir = root.join("assets");

    let mut library_jobs = Vec::new();
    if let Some(libraries) = metadata.get("libraries").and_then(|v| v.as_array()) {
        for library in libraries {
            let Some(artifact) = library.get("downloads").and_then(|v| v.get("artifact")) else { continue };
            let (Some(url), Some(path)) = (artifact.get("url").and_then(|v| v.as_str()), artifact.get("path").and_then(|v| v.as_str())) else { continue };
            let url = trusted_download_url(url, &["libraries.minecraft.net", "repo.maven.apache.org", "repo1.maven.org"])?;
            let relative = safe_relative_path(path)?;
            let destination = library_dir.join(relative);
            let sha = artifact.get("sha1").and_then(|v| v.as_str()).map(str::to_string);
            library_jobs.push((url.to_string(), destination, sha));
        }
    }
    let mut bytes_downloaded = 0u64;
    let mut libraries_downloaded = 0usize;
    for batch in library_jobs.chunks(12) {
        let jobs = batch.iter().cloned().map(|(url, path, sha)| {
            let client = client.clone();
            async move { download_verified_file(&client, &url, &path, sha.as_deref()).await }
        });
        let results = futures_util::future::join_all(jobs).await;
        for result in results {
            let bytes = result?;
            if bytes > 0 { libraries_downloaded += 1; bytes_downloaded += bytes; }
        }
    }

    let asset_index = metadata.get("assetIndex").ok_or_else(|| "В метаданных версии нет assetIndex.".to_string())?;
    let index_id = asset_index.get("id").and_then(|v| v.as_str()).ok_or_else(|| "Не найден идентификатор индекса ресурсов.".to_string())?;
    let index_url = asset_index.get("url").and_then(|v| v.as_str()).ok_or_else(|| "Не найдена ссылка на индекс ресурсов.".to_string())?;
    let index_url = trusted_download_url(index_url, &["piston-meta.mojang.com", "launcher.mojang.com"])?;
    let index_path = assets_dir.join("indexes").join(format!("{index_id}.json"));
    bytes_downloaded += download_verified_file(&client, index_url.as_str(), &index_path, asset_index.get("sha1").and_then(|v| v.as_str())).await?;
    let index_bytes = std::fs::read(&index_path).map_err(|e| format!("Не удалось прочитать индекс ресурсов: {e}"))?;
    let index: serde_json::Value = serde_json::from_slice(&index_bytes).map_err(|e| format!("Индекс ресурсов повреждён: {e}"))?;
    let objects = index.get("objects").and_then(|v| v.as_object()).ok_or_else(|| "В индексе ресурсов нет списка файлов.".to_string())?;
    let mut asset_jobs = Vec::new();
    for object in objects.values() {
        let hash = object.get("hash").and_then(|v| v.as_str()).ok_or_else(|| "В индексе найден ресурс без хеша.".to_string())?;
        if hash.len() != 40 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err("Индекс ресурсов содержит некорректный SHA-1.".into());
        }
        let prefix = &hash[..2];
        let url = format!("https://resources.download.minecraft.net/{prefix}/{hash}");
        let destination = assets_dir.join("objects").join(prefix).join(hash);
        asset_jobs.push((url, destination, hash.to_string()));
    }
    let assets_total = asset_jobs.len();
    let mut assets_downloaded = 0usize;
    for batch in asset_jobs.chunks(12) {
        let jobs = batch.iter().cloned().map(|(url, path, sha)| {
            let client = client.clone();
            async move { download_verified_file(&client, &url, &path, Some(&sha)).await }
        });
        let results = futures_util::future::join_all(jobs).await;
        for result in results {
            let bytes = result?;
            if bytes > 0 { assets_downloaded += 1; bytes_downloaded += bytes; }
        }
    }

    Ok(DependencyInstallReport {
        version_id: version_id.to_string(),
        libraries_downloaded,
        assets_downloaded,
        assets_total,
        bytes_downloaded,
        library_dir: library_dir.to_string_lossy().to_string(),
        assets_dir: assets_dir.to_string_lossy().to_string(),
    })
}


fn library_rule_allows(library: &serde_json::Value) -> bool {
    let Some(rules) = library.get("rules").and_then(|v| v.as_array()) else { return true };
    let mut allowed = false;
    for rule in rules {
        let os_matches = rule.get("os").and_then(|v| v.get("name")).and_then(|v| v.as_str())
            .map(|name| name == "windows").unwrap_or(true);
        if os_matches { allowed = rule.get("action").and_then(|v| v.as_str()) == Some("allow"); }
    }
    allowed
}
fn expand_game_argument(raw: &str, values: &std::collections::HashMap<String, String>) -> String {
    let mut result = raw.to_string();
    for (key, value) in values { result = result.replace(&format!("\${{{key}}}"), value); }
    result
}
fn append_metadata_arguments(target: &mut Vec<String>, source: Option<&serde_json::Value>, values: &std::collections::HashMap<String, String>) {
    let Some(items) = source.and_then(|v| v.as_array()) else { return };
    for item in items {
        let (allowed, raw_values) = if let Some(text) = item.as_str() { (true, vec![text.to_string()]) }
        else if let Some(object) = item.as_object() {
            let mut allowed = true;
            if let Some(rules) = object.get("rules").and_then(|v| v.as_array()) {
                allowed = false;
                for rule in rules {
                    let os_ok = rule.get("os").and_then(|v| v.get("name")).and_then(|v| v.as_str()).map(|name| name == "windows").unwrap_or(true);
                    if os_ok { allowed = rule.get("action").and_then(|v| v.as_str()) == Some("allow"); }
                }
            }
            let vals = match object.get("value") {
                Some(serde_json::Value::String(s)) => vec![s.clone()],
                Some(serde_json::Value::Array(a)) => a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect(),
                _ => Vec::new(),
            };
            (allowed, vals)
        } else { (false, Vec::new()) };
        if allowed { target.extend(raw_values.iter().map(|v| expand_game_argument(v, values))); }
    }
}
#[tauri::command]
async fn launch_minecraft(version_id: String, auth_state: tauri::State<'_, std::sync::Mutex<Option<MinecraftAuthSession>>>) -> Result<u32, String> {
    let version_id = version_id.trim();
    if version_id.is_empty() || !version_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') { return Err("Некорректный идентификатор версии Minecraft.".into()); }
    let session = auth_state.lock().map_err(|_| "Не удалось проверить игровую сессию.".to_string())?.clone()
        .ok_or_else(|| "Сначала войди через Microsoft в разделе «Настройки».".to_string())?;
    let app_data = std::env::var_os("APPDATA").map(std::path::PathBuf::from).ok_or_else(|| "Не найдена папка APPDATA Windows.".to_string())?;
    let root = app_data.join("L-o-S-A");
    let version_dir = root.join("versions").join(version_id);
    let metadata_path = version_dir.join(format!("{version_id}.json"));
    let metadata_bytes = std::fs::read(&metadata_path).map_err(|_| format!("Клиент Minecraft {version_id} не установлен. Сначала скачай клиент."))?;
    let metadata: serde_json::Value = serde_json::from_slice(&metadata_bytes).map_err(|e| format!("Метаданные Minecraft повреждены: {e}"))?;
    let client_jar = version_dir.join(format!("{version_id}.jar"));
    if !client_jar.is_file() { return Err("Не найден клиентский JAR. Повтори установку клиента.".into()); }
    #[cfg(target_os = "windows")]
    let lookup = std::process::Command::new("where.exe").arg("java.exe").output();
    #[cfg(not(target_os = "windows"))]
    let lookup = std::process::Command::new("which").arg("java").output();
    let java = lookup.ok().filter(|o| o.status.success()).and_then(|o| String::from_utf8_lossy(&o.stdout).lines().next().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string))
        .ok_or_else(|| "Java не найдена. Установи совместимую Java и добавь её в PATH.".to_string())?;
    let java_output = std::process::Command::new(&java).arg("-version").output().map_err(|e| format!("Не удалось запустить Java ({java}): {e}"))?;
    let java_text = format!("{}\n{}", String::from_utf8_lossy(&java_output.stdout), String::from_utf8_lossy(&java_output.stderr));
    let java_major = parse_java_major(&java_text).ok_or_else(|| "Не удалось определить версию Java.".to_string())?;
    let required_java = metadata.get("javaVersion").and_then(|v| v.get("majorVersion")).and_then(|v| v.as_u64()).map(|v| v as u32).unwrap_or_else(|| {
        let parts: Vec<u32> = version_id.split('.').filter_map(|p| p.parse().ok()).collect();
        if parts.first() == Some(&1) && parts.get(1).copied().unwrap_or(0) <= 16 { 8 } else if parts.first() == Some(&1) && parts.get(1) == Some(&17) { 16 } else { 17 }
    });
    if java_major < required_java { return Err(format!("Для Minecraft {version_id} нужна Java {required_java} или новее. Найдена Java {java_major}.")); }
    let libraries_root = root.join("libraries");
    let natives_dir = root.join("natives").join(format!("{version_id}-{}", std::process::id()));
    std::fs::create_dir_all(&natives_dir).map_err(|e| format!("Не удалось создать папку natives: {e}"))?;
    let mut classpath = Vec::<String>::new();
    let libraries = metadata.get("libraries").and_then(|v| v.as_array()).ok_or_else(|| "В метаданных Minecraft отсутствует список библиотек.".to_string())?;
    for library in libraries {
        if !library_rule_allows(library) { continue; }
        if let Some(artifact) = library.get("downloads").and_then(|v| v.get("artifact")) {
            if let Some(path) = artifact.get("path").and_then(|v| v.as_str()) {
                let file = libraries_root.join(safe_relative_path(path)?);
                if file.is_file() { classpath.push(file.to_string_lossy().to_string()); }
                else { return Err(format!("Не найдена библиотека {}. Нажми «Загрузить файлы» ещё раз.", path)); }
            }
        }
        if let Some(native_key) = library.get("natives").and_then(|v| v.get("windows")).and_then(|v| v.as_str()) {
            let arch = if std::mem::size_of::<usize>() == 8 { "64" } else { "32" };
            let classifier = native_key.replace("\${arch}", arch);
            if let Some(native) = library.get("downloads").and_then(|v| v.get("classifiers")).and_then(|v| v.get(&classifier)) {
                if let Some(path) = native.get("path").and_then(|v| v.as_str()) {
                    let archive_path = libraries_root.join(safe_relative_path(path)?);
                    if !archive_path.is_file() { return Err(format!("Не найден native-файл {}. Повтори загрузку библиотек.", path)); }
                    let archive_file = std::fs::File::open(&archive_path).map_err(|e| format!("Не удалось открыть natives: {e}"))?;
                    let mut archive = zip::ZipArchive::new(archive_file).map_err(|e| format!("Повреждён архив natives: {e}"))?;
                    for index in 0..archive.len() {
                        let mut entry = archive.by_index(index).map_err(|e| format!("Ошибка чтения natives: {e}"))?;
                        let Some(relative) = entry.enclosed_name().map(|p| p.to_path_buf()) else { continue };
                        if relative.to_string_lossy().starts_with("META-INF/") { continue; }
                        let destination = natives_dir.join(relative);
                        if let Some(parent) = destination.parent() { std::fs::create_dir_all(parent).map_err(|e| format!("Не удалось создать папку native-библиотеки: {e}"))?; }
                        let mut output = std::fs::File::create(&destination).map_err(|e| format!("Не удалось распаковать native-библиотеку: {e}"))?;
                        std::io::copy(&mut entry, &mut output).map_err(|e| format!("Ошибка распаковки native-библиотеки: {e}"))?;
                    }
                }
            }
        }
    }
    classpath.push(client_jar.to_string_lossy().to_string());
    let game_dir = root.join("game");
    std::fs::create_dir_all(&game_dir).map_err(|e| format!("Не удалось создать игровую папку: {e}"))?;
    let assets_root = root.join("assets");
    let asset_index = metadata.get("assetIndex").and_then(|v| v.get("id")).and_then(|v| v.as_str()).unwrap_or(version_id);
    let mut values = std::collections::HashMap::new();
    values.insert("natives_directory".into(), natives_dir.to_string_lossy().to_string());
    values.insert("launcher_name".into(), "L.o.S.A.".into()); values.insert("launcher_version".into(), "0.8.0".into());
    values.insert("classpath".into(), classpath.join(if cfg!(windows) { ";" } else { ":" }));
    values.insert("classpath_separator".into(), if cfg!(windows) { ";".into() } else { ":".into() });
    values.insert("auth_player_name".into(), session.profile.name.clone()); values.insert("version_name".into(), version_id.to_string());
    values.insert("game_directory".into(), game_dir.to_string_lossy().to_string()); values.insert("assets_root".into(), assets_root.to_string_lossy().to_string());
    values.insert("assets_index_name".into(), asset_index.to_string()); values.insert("auth_uuid".into(), session.profile.id.clone());
    values.insert("auth_access_token".into(), session.access_token.clone()); values.insert("user_type".into(), "msa".into());
    values.insert("version_type".into(), metadata.get("type").and_then(|v| v.as_str()).unwrap_or("release").to_string());
    values.insert("user_properties".into(), "{}".into()); values.insert("clientid".into(), String::new()); values.insert("auth_xuid".into(), String::new());
    let mut jvm_args = Vec::new(); let mut game_args = Vec::new();
    append_metadata_arguments(&mut jvm_args, metadata.get("arguments").and_then(|v| v.get("jvm")), &values);
    append_metadata_arguments(&mut game_args, metadata.get("arguments").and_then(|v| v.get("game")), &values);
    if jvm_args.is_empty() { jvm_args.extend(["-Xmx2G".into(), "-Djava.library.path=\${natives_directory}".into(), "-cp".into(), "\${classpath}".into()].iter().map(|v| expand_game_argument(v, &values))); }
    let main_class = metadata.get("mainClass").and_then(|v| v.as_str()).ok_or_else(|| "В метаданных отсутствует mainClass.".to_string())?;
    if metadata.get("arguments").and_then(|v| v.get("game")).is_none() {
        if let Some(legacy) = metadata.get("minecraftArguments").and_then(|v| v.as_str()) { game_args.extend(legacy.split_whitespace().map(|v| expand_game_argument(v, &values))); }
        else { return Err("Не удалось прочитать параметры запуска этой версии Minecraft.".into()); }
    }
    let mut command = std::process::Command::new(&java);
    command.args(&jvm_args).arg(main_class).args(&game_args).current_dir(&game_dir);
    let child = command.spawn().map_err(|e| format!("Minecraft не удалось запустить через Java: {e}"))?;
    Ok(child.id())
}

fn parse_java_major(output: &str) -> Option<u32> {
    let version = output.split('"').nth(1).unwrap_or(output);
    let first = version.split_whitespace().next()?;
    let normalized = first.strip_prefix("1.").unwrap_or(first);
    normalized.split(['.', '-', '+']).next()?.parse().ok()
}

#[tauri::command]
fn detect_java() -> String {
    #[cfg(target_os = "windows")]
    let lookup = std::process::Command::new("where.exe").arg("java.exe").output();
    #[cfg(not(target_os = "windows"))]
    let lookup = std::process::Command::new("which").arg("java").output();

    let executable = match lookup {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .lines().next().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string),
        _ => None,
    };
    let Some(executable) = executable else {
        return "Java не найдена в PATH. Следующим шагом добавим установку подходящей Java прямо из L.o.S.A.".into();
    };
    let output = match std::process::Command::new(&executable).arg("-version").output() {
        Ok(output) => output,
        Err(error) => return format!("Java найдена по пути {executable}, но не запускается: {error}"),
    };
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let text = if stderr.trim().is_empty() { String::from_utf8_lossy(&output.stdout).to_string() } else { stderr };
    let version_line = text.lines().next().unwrap_or("Версия Java не определена").trim();
    match parse_java_major(&text) {
        Some(major) => format!("Найдена Java {major}: {version_line} · {executable}"),
        None => format!("Java найдена, но версию определить не удалось: {version_line} · {executable}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(std::sync::Mutex::new(None::<MinecraftAuthSession>))
        .invoke_handler(tauri::generate_handler![detect_java, start_microsoft_login, complete_microsoft_login, minecraft_auth_status, logout_minecraft, install_vanilla_client, install_minecraft_dependencies, launch_minecraft])
        .run(tauri::generate_context!())
        .expect("error while running L.o.S.A.");
}
