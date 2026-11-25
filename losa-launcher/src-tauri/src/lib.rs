mod bedrock;
mod server_directory;
use server_directory::search_public_servers;
use bedrock::{detect_bedrock_installation, list_bedrock_instances, create_bedrock_instance, delete_bedrock_instance, launch_bedrock};
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
    #[serde(rename = "Token")]
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

#[derive(Default)]
struct MinecraftAuthState {
    accounts: Vec<MinecraftAuthSession>,
    active_profile_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MinecraftAuthStatus {
    accounts: Vec<MinecraftProfile>,
    active_profile_id: Option<String>,
}

fn auth_error(message: impl Into<String>) -> String {
    message.into()
}

fn decode_auth_json<T: serde::de::DeserializeOwned>(
    body: &str,
    stage: &str,
    status: reqwest::StatusCode,
) -> Result<T, String> {
    serde_json::from_str(body).map_err(|error| {
        let excerpt: String = body.chars().take(700).collect();
        format!("{stage}: не удалось разобрать ответ (HTTP {status}): {error}. Ответ сервера: {excerpt}")
    })
}

fn is_valid_offline_name(name: &str) -> bool {
    (3..=16).contains(&name.len())
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn offline_uuid(name: &str) -> String {
    let digest = md5::compute(format!("OfflinePlayer:{name}"));
    let mut bytes = digest.0;
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5],
        bytes[6], bytes[7], bytes[8], bytes[9], bytes[10], bytes[11],
        bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

fn is_client_id_format(value: &str) -> bool {
    let parts: Vec<&str> = value.split('-').collect();
    parts.len() == 5
        && [8, 4, 4, 4, 12].iter().zip(parts.iter())
            .all(|(expected, part)| part.len() == *expected && part.chars().all(|c| c.is_ascii_hexdigit()))
}

fn microsoft_client_id() -> Result<&'static str, String> {
    option_env!("LOSA_MICROSOFT_CLIENT_ID")
        .map(str::trim)
        .filter(|value| is_client_id_format(value))
        .ok_or_else(|| "Microsoft-вход ещё не настроен: разработчику нужно указать настоящий Client ID приложения L.o.S.A.".to_string())
}

#[tauri::command]
fn microsoft_auth_configured() -> bool {
    microsoft_client_id().is_ok()
}

#[tauri::command]
async fn login_microsoft_browser(auth_state: tauri::State<'_, std::sync::Mutex<MinecraftAuthState>>) -> Result<MinecraftProfile, String> {
    use base64::Engine;
    use rand::RngCore;
    use std::io::{Read, Write};

    let client_id = microsoft_client_id()?;
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| auth_error(format!("Не удалось открыть локальный адрес возврата Microsoft: {e}")))?;
    let port = listener.local_addr().map_err(|e| auth_error(format!("Не удалось определить порт возврата: {e}")))?.port();
    let redirect_uri = format!("http://localhost:{port}");
    let mut verifier_bytes = [0u8; 32];
    let mut state_bytes = [0u8; 24];
    rand::rngs::OsRng.fill_bytes(&mut verifier_bytes);
    rand::rngs::OsRng.fill_bytes(&mut state_bytes);
    let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(verifier_bytes);
    let state = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(state_bytes);
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sha2::Sha256::digest(verifier.as_bytes()));

    let mut authorize = reqwest::Url::parse("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize")
        .map_err(|e| auth_error(format!("Не удалось подготовить страницу Microsoft: {e}")))?;
    authorize.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_mode", "query")
        .append_pair("scope", "XboxLive.signin offline_access")
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");

    #[cfg(target_os = "windows")]
    let browser = std::process::Command::new("rundll32.exe").args(["url.dll,FileProtocolHandler", authorize.as_str()]).spawn();
    #[cfg(target_os = "macos")]
    let browser = std::process::Command::new("open").arg(authorize.as_str()).spawn();
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let browser = std::process::Command::new("xdg-open").arg(authorize.as_str()).spawn();
    browser.map_err(|e| auth_error(format!("Не удалось открыть браузер для входа Microsoft: {e}")))?;

    let (code, returned_state) = tokio::task::spawn_blocking(move || -> Result<(String, String), String> {
        listener.set_nonblocking(true).map_err(|e| format!("Ошибка локального сервера авторизации: {e}"))?;
        let started = std::time::Instant::now();
        let (mut stream, _) = loop {
            match listener.accept() {
                Ok(pair) => break pair,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock && started.elapsed() < Duration::from_secs(180) => std::thread::sleep(Duration::from_millis(150)),
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => return Err("Время ожидания входа Microsoft истекло. Попробуй ещё раз.".into()),
                Err(e) => return Err(format!("Не удалось принять возврат Microsoft: {e}")),
            }
        };
        let mut request = [0u8; 8192];
        let size = stream.read(&mut request).map_err(|e| format!("Не удалось прочитать ответ Microsoft: {e}"))?;
        let first_line = String::from_utf8_lossy(&request[..size]).lines().next().unwrap_or("").to_string();
        let target = first_line.split_whitespace().nth(1).unwrap_or("/");
        let callback = reqwest::Url::parse(&format!("http://localhost{target}")).map_err(|e| format!("Некорректный ответ Microsoft: {e}"))?;
        let params: std::collections::HashMap<String, String> = callback.query_pairs().map(|(k,v)|(k.into_owned(),v.into_owned())).collect();
        let page = if params.contains_key("code") { "Вход подтверждён. Можно вернуться в L.o.S.A." } else { "Microsoft не завершил вход. Вернись в L.o.S.A. и попробуй снова." };
        let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<html><meta charset=\"utf-8\"><title>L.o.S.A.</title><body style=\"font-family:Segoe UI;text-align:center;padding:48px;background:#111;color:#eee\"><h2>{page}</h2></body></html>");
        let _ = stream.write_all(response.as_bytes());
        let code = params.get("code").cloned().ok_or_else(|| params.get("error_description").cloned().unwrap_or_else(|| "Microsoft отклонил вход.".into()))?;
        let returned_state = params.get("state").cloned().unwrap_or_default();
        Ok((code, returned_state))
    }).await.map_err(|e| auth_error(format!("Ошибка ожидания возврата Microsoft: {e}")))??;
    if returned_state != state { return Err("Проверка безопасности Microsoft не пройдена (state не совпадает).".into()); }

    let client = reqwest::Client::new();
    let response = client.post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
        .form(&[
            ("client_id", client_id), ("grant_type", "authorization_code"),
            ("code", code.as_str()), ("redirect_uri", redirect_uri.as_str()),
            ("code_verifier", verifier.as_str()), ("scope", "XboxLive.signin offline_access"),
        ])
        .send().await.map_err(|e| auth_error(format!("Не удалось обменять код Microsoft: {e}")))?;
    let status = response.status();
    let body_text = response.text().await.map_err(|e| auth_error(format!("Не удалось прочитать ответ Microsoft: {e}")))?;
    let body: serde_json::Value = decode_auth_json(&body_text, "Microsoft OAuth", status)?;
    if !status.is_success() {
        let code = body.get("error").and_then(|v| v.as_str()).unwrap_or("oauth_error");
        let description = body.get("error_description").and_then(|v| v.as_str()).unwrap_or("Microsoft не сообщил подробности.");
        return Err(format!("Microsoft OAuth ({code}): {description}"));
    }
    let microsoft_token: MicrosoftToken = serde_json::from_value(body).map_err(|e| auth_error(format!("В ответе Microsoft нет токена: {e}")))?;
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
    let xbox_status = xbox.status();
    let xbox_body = xbox.text().await.map_err(|e| auth_error(format!("Не удалось получить тело ответа Xbox Live: {e}")))?;
    let xbox_data: XboxAuthResponse = decode_auth_json(&xbox_body, "Xbox Live", xbox_status)?;
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
    let xsts_status = xsts.status();
    let xsts_body = xsts.text().await.map_err(|e| auth_error(format!("Не удалось получить тело ответа XSTS: {e}")))?;
    let xsts_data: XboxAuthResponse = decode_auth_json(&xsts_body, "Xbox XSTS", xsts_status)?;
    let minecraft = client.post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .header("Accept", "application/json")
        .json(&serde_json::json!({"identityToken":format!("XBL3.0 x={};{}",user_hash,xsts_data.token)}))
        .send().await.map_err(|e| auth_error(format!("Ошибка Minecraft Services: {e}")))?;
    let minecraft_status = minecraft.status();
    let minecraft_body = minecraft.text().await.map_err(|e| auth_error(format!("Не удалось получить тело ответа Minecraft Services: {e}")))?;
    if !minecraft_status.is_success() {
        let details: serde_json::Value = serde_json::from_str(&minecraft_body).unwrap_or(serde_json::Value::Null);
        let service_error = details.get("error").and_then(|v| v.as_str()).unwrap_or("unknown_error");
        let error_message = details.get("errorMessage").and_then(|v| v.as_str()).unwrap_or("");
        let developer_message = details.get("developerMessage").and_then(|v| v.as_str()).unwrap_or("");
        let path = details.get("path").and_then(|v| v.as_str()).unwrap_or("/authentication/login_with_xbox");
        let detail = [error_message, developer_message].into_iter().filter(|v| !v.is_empty()).collect::<Vec<_>>().join(" ");
        if minecraft_body.contains("Invalid app registration") {
            return Err("Minecraft Services отклонил Client ID приложения L.o.S.A. (Invalid app registration). Это не связано с лицензией или Xbox-профилем аккаунта: требуется официальное одобрение регистрации приложения Minecraft. Открой раздел «Настройки» L.o.S.A. и перейди по ссылке на инструкцию Minecraft.".into());
        }
        return Err(format!("Minecraft Services: HTTP {} ({service_error}) на {path}. {} Проверь настройки Xbox-профиля.", minecraft_status, detail));
    }
    let mc_token: MinecraftLoginResponse = decode_auth_json(&minecraft_body, "Minecraft Services login", minecraft_status)?;
    let profile = client.get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(mc_token.access_token.clone()).send().await
        .map_err(|e| auth_error(format!("Не удалось получить профиль Minecraft: {e}")))?;
    if !profile.status().is_success() {
        return Err(format!("Профиль Minecraft недоступен (HTTP {}). Возможно, у аккаунта нет профиля Java Edition.", profile.status()));
    }
    let profile_status = profile.status();
    let profile_body = profile.text().await.map_err(|e| auth_error(format!("Не удалось получить тело профиля Minecraft: {e}")))?;
    let profile: MinecraftProfile = decode_auth_json(&profile_body, "Профиль Minecraft", profile_status)?;
    let session = MinecraftAuthSession { access_token: mc_token.access_token, profile: profile.clone() };
    let mut state = auth_state.lock().map_err(|_| "Не удалось сохранить текущую игровую сессию.".to_string())?;
    if let Some(existing) = state.accounts.iter_mut().find(|item| item.profile.id == profile.id) {
        *existing = session;
    } else {
        state.accounts.push(session);
    }
    state.active_profile_id = Some(profile.id.clone());
    Ok(profile)
}

#[tauri::command]
fn minecraft_auth_status(auth_state: tauri::State<'_, std::sync::Mutex<MinecraftAuthState>>) -> Result<MinecraftAuthStatus, String> {
    let state = auth_state.lock().map_err(|_| "Не удалось прочитать список Microsoft-аккаунтов.".to_string())?;
    Ok(MinecraftAuthStatus {
        accounts: state.accounts.iter().map(|item| item.profile.clone()).collect(),
        active_profile_id: state.active_profile_id.clone(),
    })
}

#[tauri::command]
fn switch_minecraft_account(profile_id: String, auth_state: tauri::State<'_, std::sync::Mutex<MinecraftAuthState>>) -> Result<MinecraftAuthStatus, String> {
    let mut state = auth_state.lock().map_err(|_| "Не удалось переключить Microsoft-аккаунт.".to_string())?;
    if !state.accounts.iter().any(|item| item.profile.id == profile_id) {
        return Err("Этот Microsoft-аккаунт не найден в списке L.o.S.A.".into());
    }
    state.active_profile_id = Some(profile_id);
    Ok(MinecraftAuthStatus {
        accounts: state.accounts.iter().map(|item| item.profile.clone()).collect(),
        active_profile_id: state.active_profile_id.clone(),
    })
}

#[tauri::command]
fn logout_minecraft(profile_id: String, auth_state: tauri::State<'_, std::sync::Mutex<MinecraftAuthState>>) -> Result<MinecraftAuthStatus, String> {
    let mut state = auth_state.lock().map_err(|_| "Не удалось завершить Microsoft-сеанс.".to_string())?;
    let previous_active = state.active_profile_id.clone();
    state.accounts.retain(|item| item.profile.id != profile_id);
    if previous_active.as_deref() == Some(profile_id.as_str()) {
        state.active_profile_id = state.accounts.last().map(|item| item.profile.id.clone());
    }
    Ok(MinecraftAuthStatus {
        accounts: state.accounts.iter().map(|item| item.profile.clone()).collect(),
        active_profile_id: state.active_profile_id.clone(),
    })
}


#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LauncherInstance {
    id: String,
    name: String,
    version_id: String,
    loader: String,
    icon_data_url: Option<String>,
    created_at: u64,
    last_played_at: Option<u64>,
}

fn launcher_root() -> Result<std::path::PathBuf, String> {
    let app_data = std::env::var_os("APPDATA").map(std::path::PathBuf::from)
        .ok_or_else(|| "Не найдена папка APPDATA Windows.".to_string())?;
    Ok(app_data.join("L-o-S-A"))
}

fn instances_file(root: &std::path::Path) -> std::path::PathBuf {
    root.join("instances.json")
}

fn read_instances(root: &std::path::Path) -> Result<Vec<LauncherInstance>, String> {
    let path = instances_file(root);
    if !path.is_file() { return Ok(Vec::new()); }
    let bytes = std::fs::read(path).map_err(|e| format!("Не удалось прочитать список сборок: {e}"))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("Список сборок повреждён: {e}"))
}

fn write_instances(root: &std::path::Path, instances: &[LauncherInstance]) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|e| format!("Не удалось подготовить папку LoSA: {e}"))?;
    let bytes = serde_json::to_vec_pretty(instances).map_err(|e| format!("Не удалось сохранить список сборок: {e}"))?;
    let path = instances_file(root);
    let temp = root.join("instances.json.tmp");
    std::fs::write(&temp, bytes).map_err(|e| format!("Не удалось записать список сборок: {e}"))?;
    if path.exists() { std::fs::remove_file(&path).map_err(|e| format!("Не удалось обновить список сборок: {e}"))?; }
    std::fs::rename(temp, path).map_err(|e| format!("Не удалось завершить сохранение сборок: {e}"))
}

fn valid_instance_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 80 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[tauri::command]
fn list_instances() -> Result<Vec<LauncherInstance>, String> {
    read_instances(&launcher_root()?)
}

#[tauri::command]
fn create_instance(name: String, version_id: String, loader: String, icon_data_url: Option<String>) -> Result<LauncherInstance, String> {
    let name = name.trim();
    let version_id = version_id.trim();
    if name.is_empty() || name.chars().count() > 40 {
        return Err("Название сборки должно содержать от 1 до 40 символов.".into());
    }
    if version_id.is_empty() || !version_id.chars().next().is_some_and(|c| c.is_ascii_digit())
        || !version_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err("Некорректная версия Minecraft.".into());
    }
    if loader != "vanilla" {
        return Err("На этом этапе доступен только чистый Minecraft. Поддержку загрузчиков добавим отдельно.".into());
    }
    if let Some(icon) = icon_data_url.as_deref() {
        if !icon.starts_with("data:image/") || icon.len() > 2_000_000 {
            return Err("Логотип должен быть изображением размером не более 1,5 МБ.".into());
        }
    }
    let root = launcher_root()?;
    let mut instances = read_instances(&root)?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default().as_secs();
    let unique = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default().as_nanos();
    let id = format!("instance-{unique}");
    let instance = LauncherInstance {
        id, name: name.to_string(), version_id: version_id.to_string(), loader,
        icon_data_url, created_at: now, last_played_at: None,
    };
    // Preserve the previous launcher's shared worlds folder when creating the first real build.
    if instances.is_empty() {
        let legacy_game_dir = root.join("game");
        let instance_game_dir = root.join("instances").join(&instance.id).join("game");
        if legacy_game_dir.is_dir() && !instance_game_dir.exists() {
            if let Some(parent) = instance_game_dir.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Не удалось подготовить папку сборки: {e}"))?;
            }
            std::fs::rename(&legacy_game_dir, &instance_game_dir)
                .map_err(|e| format!("Не удалось перенести существующие миры в новую сборку: {e}"))?;
        }
    }
    instances.insert(0, instance.clone());
    write_instances(&root, &instances)?;
    Ok(instance)
}

#[tauri::command]
fn update_instance(instance_id: String, name: String, icon_data_url: Option<String>) -> Result<LauncherInstance, String> {
    if !valid_instance_id(&instance_id) { return Err("Некорректный идентификатор сборки.".into()); }
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 40 {
        return Err("Название сборки должно содержать от 1 до 40 символов.".into());
    }
    if let Some(icon) = icon_data_url.as_deref() {
        if !icon.starts_with("data:image/") || icon.len() > 2_000_000 {
            return Err("Логотип должен быть изображением размером не более 1,5 МБ.".into());
        }
    }
    let root = launcher_root()?;
    let mut instances = read_instances(&root)?;
    let instance = instances.iter_mut().find(|item| item.id == instance_id)
        .ok_or_else(|| "Сборка не найдена.".to_string())?;
    instance.name = name.to_string();
    if icon_data_url.is_some() { instance.icon_data_url = icon_data_url; }
    let updated = instance.clone();
    write_instances(&root, &instances)?;
    Ok(updated)
}

#[tauri::command]
fn delete_instance(instance_id: String) -> Result<(), String> {
    if !valid_instance_id(&instance_id) { return Err("Некорректный идентификатор сборки.".into()); }
    let root = launcher_root()?;
    let mut instances = read_instances(&root)?;
    let before = instances.len();
    instances.retain(|instance| instance.id != instance_id);
    if instances.len() == before { return Err("Сборка не найдена.".into()); }
    write_instances(&root, &instances)
}

#[tauri::command]
async fn prepare_instance(instance_id: String) -> Result<MinecraftInstallationStatus, String> {
    if !valid_instance_id(&instance_id) { return Err("Некорректный идентификатор сборки.".into()); }
    let root = launcher_root()?;
    let instance = read_instances(&root)?.into_iter().find(|item| item.id == instance_id)
        .ok_or_else(|| "Сборка не найдена.".to_string())?;
    let current_status = get_minecraft_installation_status(instance.version_id.clone())?;
    if current_status.installed_client.is_none() {
        install_vanilla_client(instance.version_id.clone()).await?;
    }
    if current_status.dependency_report.is_none() {
        install_minecraft_dependencies(instance.version_id.clone()).await?;
    }
    let metadata_path = root.join("versions").join(&instance.version_id).join(format!("{}.json", instance.version_id));
    let metadata_bytes = std::fs::read(&metadata_path).map_err(|e| format!("Не удалось проверить метаданные версии: {e}"))?;
    let metadata: serde_json::Value = serde_json::from_slice(&metadata_bytes).map_err(|e| format!("Метаданные Minecraft повреждены: {e}"))?;
    let required_java = metadata.get("javaVersion").and_then(|v| v.get("majorVersion")).and_then(|v| v.as_u64()).map(|v| v as u32).unwrap_or(17);
    ensure_java_runtime(required_java, &root).await?;
    get_minecraft_installation_status(instance.version_id)
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
    if version_id.is_empty() || !version_id.chars().next().is_some_and(|c| c.is_ascii_digit()) || !version_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
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



#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DependencyInstallReport {
    version_id: String,
    libraries_downloaded: usize,
    libraries_total: usize,
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
    if version_id.is_empty() || !version_id.chars().next().is_some_and(|c| c.is_ascii_digit()) || !version_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
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
    let client = reqwest::Client::builder().user_agent("L.o.S.A. Launcher/0.10.3").build()
        .map_err(|e| format!("Не удалось подготовить загрузчик: {e}"))?;
    let library_dir = root.join("libraries");
    let assets_dir = root.join("assets");

    let mut library_jobs = Vec::new();
    if let Some(libraries) = metadata.get("libraries").and_then(|v| v.as_array()) {
        for library in libraries {
            if !library_rule_allows(library) { continue; }
            if let Some(artifact) = library.get("downloads").and_then(|v| v.get("artifact")) {
                if let (Some(url), Some(path)) = (artifact.get("url").and_then(|v| v.as_str()), artifact.get("path").and_then(|v| v.as_str())) {
                    let url = trusted_download_url(url, &["libraries.minecraft.net", "repo.maven.apache.org", "repo1.maven.org"])?;
                    let destination = library_dir.join(safe_relative_path(path)?);
                    let sha = artifact.get("sha1").and_then(|v| v.as_str()).map(str::to_string);
                    library_jobs.push((url.to_string(), destination, sha));
                }
            }
            if let Some(native_key) = library.get("natives").and_then(|v| v.get("windows")).and_then(|v| v.as_str()) {
                let arch = if std::mem::size_of::<usize>() == 8 { "64" } else { "32" };
                let classifier = native_key.replace("${arch}", arch);
                if let Some(native) = library.get("downloads").and_then(|v| v.get("classifiers")).and_then(|v| v.get(&classifier)) {
                    if let (Some(url), Some(path)) = (native.get("url").and_then(|v| v.as_str()), native.get("path").and_then(|v| v.as_str())) {
                        let url = trusted_download_url(url, &["libraries.minecraft.net", "repo.maven.apache.org", "repo1.maven.org"])?;
                        let destination = library_dir.join(safe_relative_path(path)?);
                        let sha = native.get("sha1").and_then(|v| v.as_str()).map(str::to_string);
                        library_jobs.push((url.to_string(), destination, sha));
                    }
                }
            }
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

    let mut required_files = Vec::with_capacity(library_jobs.len() + asset_jobs.len());
    let index_relative = index_path.strip_prefix(&root)
        .map_err(|_| "Не удалось подготовить путь индекса ресурсов.".to_string())?;
    required_files.push(index_relative.to_string_lossy().to_string());
    for (_, path, _) in library_jobs.iter() {
        let relative = path.strip_prefix(&root)
            .map_err(|_| "Не удалось подготовить список установленных файлов.".to_string())?;
        required_files.push(relative.to_string_lossy().to_string());
    }
    for (_, path, _) in asset_jobs.iter() {
        let relative = path.strip_prefix(&root)
            .map_err(|_| "Не удалось подготовить список установленных файлов.".to_string())?;
        required_files.push(relative.to_string_lossy().to_string());
    }

    let report = DependencyInstallReport {
        version_id: version_id.to_string(),
        libraries_downloaded,
        libraries_total: library_jobs.len(),
        assets_downloaded,
        assets_total,
        bytes_downloaded,
        library_dir: library_dir.to_string_lossy().to_string(),
        assets_dir: assets_dir.to_string_lossy().to_string(),
    };
    let manifest = DependencyInstallManifest { report: report.clone(), files: required_files };
    let manifest_path = version_dir.join("losa-dependencies.json");
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| format!("Не удалось подготовить отметку установки: {e}"))?;
    std::fs::write(&manifest_path, manifest_bytes)
        .map_err(|e| format!("Не удалось сохранить состояние установки: {e}"))?;

    Ok(report)
}


#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DependencyInstallManifest {
    report: DependencyInstallReport,
    files: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MinecraftInstallationStatus {
    installed_client: Option<InstalledClientInfo>,
    dependency_report: Option<DependencyInstallReport>,
}

#[tauri::command]
fn get_minecraft_installation_status(version_id: String) -> Result<MinecraftInstallationStatus, String> {
    let version_id = version_id.trim();
    if version_id.is_empty() || !version_id.chars().next().is_some_and(|c| c.is_ascii_digit())
        || !version_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err("Некорректный идентификатор версии Minecraft.".into());
    }

    let app_data = std::env::var_os("APPDATA").map(std::path::PathBuf::from)
        .ok_or_else(|| "Не найдена папка APPDATA Windows.".to_string())?;
    let root = app_data.join("L-o-S-A");
    let version_dir = root.join("versions").join(version_id);
    let metadata_path = version_dir.join(format!("{version_id}.json"));
    let client_path = version_dir.join(format!("{version_id}.jar"));

    let installed_client = if metadata_path.is_file() && client_path.is_file() {
        let metadata_bytes = std::fs::read(&metadata_path)
            .map_err(|e| format!("Не удалось проверить метаданные клиента: {e}"))?;
        let metadata: serde_json::Value = serde_json::from_slice(&metadata_bytes)
            .map_err(|e| format!("Метаданные Minecraft повреждены: {e}"))?;
        let expected_sha1 = metadata.get("downloads").and_then(|v| v.get("client"))
            .and_then(|v| v.get("sha1")).and_then(|v| v.as_str());
        let client_bytes = std::fs::read(&client_path)
            .map_err(|e| format!("Не удалось проверить клиентский файл: {e}"))?;
        let checksum_valid = expected_sha1.map(|expected| {
            format!("{:x}", sha1::Sha1::digest(&client_bytes)) == expected.to_ascii_lowercase()
        }).unwrap_or(false);
        if checksum_valid {
            Some(InstalledClientInfo {
                version_id: version_id.to_string(),
                client_path: client_path.to_string_lossy().to_string(),
                metadata_path: metadata_path.to_string_lossy().to_string(),
                client_size: client_bytes.len() as u64,
            })
        } else {
            None
        }
    } else {
        None
    };

    let manifest_path = version_dir.join("losa-dependencies.json");
    let dependency_report = if manifest_path.is_file() {
        std::fs::read(&manifest_path).ok()
            .and_then(|bytes| serde_json::from_slice::<DependencyInstallManifest>(&bytes).ok())
            .and_then(|manifest| {
                let all_files_present = manifest.report.version_id == version_id && manifest.files.iter().all(|relative| {
                    safe_relative_path(relative).map(|path| root.join(path).is_file()).unwrap_or(false)
                });
                if all_files_present { Some(manifest.report) } else { None }
            })
    } else {
        None
    };

    Ok(MinecraftInstallationStatus { installed_client, dependency_report })
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

#[cfg(target_os = "windows")]
fn suppress_console_window(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
}

#[cfg(not(target_os = "windows"))]
fn suppress_console_window(_command: &mut std::process::Command) {}

fn java_major_at(path: &std::path::Path) -> Option<u32> {
    let mut command = std::process::Command::new(path);
    suppress_console_window(&mut command);
    let output = command.arg("-version").output().ok()?;
    let text = format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
    parse_java_major(&text)
}

fn find_java_executable(directory: &std::path::Path) -> Option<std::path::PathBuf> {
    let direct = directory.join("bin").join("java.exe");
    if direct.is_file() { return Some(direct); }
    let entries = std::fs::read_dir(directory).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_java_executable(&path) { return Some(found); }
        }
    }
    None
}

async fn ensure_java_runtime(required_major: u32, root: &std::path::Path) -> Result<std::path::PathBuf, String> {
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("where.exe");
    suppress_console_window(&mut command);
    let lookup = command.arg("java.exe").output();
    #[cfg(not(target_os = "windows"))]
    let mut command = std::process::Command::new("which");
    let lookup = command.arg("java").output();

    if let Some(system_java) = lookup.ok().filter(|o| o.status.success())
        .and_then(|o| String::from_utf8_lossy(&o.stdout).lines().next().map(str::trim).filter(|s| !s.is_empty()).map(std::path::PathBuf::from)) {
        if java_major_at(&system_java).is_some_and(|major| major >= required_major) {
            return Ok(system_java);
        }
    }

    let runtime_major = if required_major == 16 { 17 } else { required_major };
    let runtime_dir = root.join("runtime").join(format!("java-{runtime_major}"));
    if let Some(java) = find_java_executable(&runtime_dir) {
        if java_major_at(&java).is_some_and(|major| major >= required_major) { return Ok(java); }
    }

    let url = format!("https://api.adoptium.net/v3/binary/latest/{runtime_major}/ga/windows/x64/jre/hotspot/normal/eclipse");
    let client = reqwest::Client::builder().user_agent("L.o.S.A. Launcher").build()
        .map_err(|e| format!("Не удалось подготовить загрузку Java: {e}"))?;
    let response = client.get(&url).send().await
        .map_err(|e| format!("Не удалось скачать Java {runtime_major}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Сервис Java вернул HTTP {} для версии {runtime_major}.", response.status()));
    }
    let archive_bytes = response.bytes().await
        .map_err(|e| format!("Не удалось прочитать архив Java: {e}"))?;
    if archive_bytes.len() > 300 * 1024 * 1024 {
        return Err("Архив Java неожиданно большой; установка остановлена.".into());
    }

    let runtime_parent = root.join("runtime");
    std::fs::create_dir_all(&runtime_parent).map_err(|e| format!("Не удалось создать папку Java: {e}"))?;
    let temp_dir = runtime_parent.join(format!("java-{runtime_major}.installing"));
    if temp_dir.exists() { std::fs::remove_dir_all(&temp_dir).map_err(|e| format!("Не удалось очистить временную папку Java: {e}"))?; }
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Не удалось подготовить установку Java: {e}"))?;
    let extraction = (|| -> Result<(), String> {
        let cursor = std::io::Cursor::new(archive_bytes);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("Архив Java повреждён: {e}"))?;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|e| format!("Не удалось прочитать архив Java: {e}"))?;
            let Some(relative) = entry.enclosed_name().map(|p| p.to_path_buf()) else { continue };
            if entry.unix_mode().is_some_and(|mode| mode & 0o170000 == 0o120000) { continue; }
            let destination = temp_dir.join(relative);
            if entry.is_dir() {
                std::fs::create_dir_all(&destination).map_err(|e| format!("Не удалось создать папку Java: {e}"))?;
            } else {
                if let Some(parent) = destination.parent() { std::fs::create_dir_all(parent).map_err(|e| format!("Не удалось создать папку Java: {e}"))?; }
                let mut output = std::fs::File::create(&destination).map_err(|e| format!("Не удалось сохранить файл Java: {e}"))?;
                std::io::copy(&mut entry, &mut output).map_err(|e| format!("Не удалось распаковать Java: {e}"))?;
            }
        }
        Ok(())
    })();
    if let Err(error) = extraction {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(error);
    }
    let java = find_java_executable(&temp_dir)
        .ok_or_else(|| "В архиве Java не найден java.exe.".to_string())?;
    if !java_major_at(&java).is_some_and(|major| major >= required_major) {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err("Загруженная Java не прошла проверку версии.".into());
    }
    if runtime_dir.exists() { std::fs::remove_dir_all(&runtime_dir).map_err(|e| format!("Не удалось заменить старую Java: {e}"))?; }
    std::fs::rename(&temp_dir, &runtime_dir).map_err(|e| format!("Не удалось завершить установку Java: {e}"))?;
    find_java_executable(&runtime_dir).ok_or_else(|| "Java установлена, но java.exe не найден.".into())
}

fn expand_game_argument(raw: &str, values: &std::collections::HashMap<String, String>) -> String {
    let mut result = raw.to_string();
    for (key, value) in values { result = result.replace(&format!("${{{key}}}"), value); }
    result
}
fn argument_rule_matches(rule: &serde_json::Value, features: &std::collections::HashMap<String, bool>) -> bool {
    let os_matches = rule.get("os").and_then(|v| v.get("name")).and_then(|v| v.as_str())
        .map(|name| name == "windows").unwrap_or(true);
    if !os_matches { return false; }

    if let Some(required_features) = rule.get("features").and_then(|v| v.as_object()) {
        for (name, expected) in required_features {
            let expected = expected.as_bool().unwrap_or(false);
            let actual = features.get(name).copied().unwrap_or(false);
            if actual != expected { return false; }
        }
    }
    true
}

fn append_metadata_arguments(
    target: &mut Vec<String>,
    source: Option<&serde_json::Value>,
    values: &std::collections::HashMap<String, String>,
    features: &std::collections::HashMap<String, bool>,
) {
    let Some(items) = source.and_then(|v| v.as_array()) else { return };
    for item in items {
        let (allowed, raw_values) = if let Some(text) = item.as_str() {
            (true, vec![text.to_string()])
        } else if let Some(object) = item.as_object() {
            let mut allowed = true;
            if let Some(rules) = object.get("rules").and_then(|v| v.as_array()) {
                allowed = false;
                for rule in rules {
                    if argument_rule_matches(rule, features) {
                        allowed = rule.get("action").and_then(|v| v.as_str()) == Some("allow");
                    }
                }
            }
            let vals = match object.get("value") {
                Some(serde_json::Value::String(s)) => vec![s.clone()],
                Some(serde_json::Value::Array(a)) => a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect(),
                _ => Vec::new(),
            };
            (allowed, vals)
        } else {
            (false, Vec::new())
        };
        if allowed {
            target.extend(raw_values.iter().map(|v| expand_game_argument(v, values)));
        }
    }
}
#[tauri::command]
async fn launch_minecraft(version_id: String, auth_mode: String, offline_name: Option<String>, instance_id: Option<String>, auth_state: tauri::State<'_, std::sync::Mutex<MinecraftAuthState>>) -> Result<u32, String> {
    let mut version_id = version_id.trim().to_string();
    let mut instance_game_dir = None;
    if let Some(id) = instance_id.as_deref() {
        if !valid_instance_id(id) { return Err("Некорректный идентификатор сборки.".into()); }
        let root = launcher_root()?;
        let instance = read_instances(&root)?.into_iter().find(|item| item.id == id)
            .ok_or_else(|| "Сборка не найдена.".to_string())?;
        version_id = instance.version_id.clone();
        instance_game_dir = Some(root.join("instances").join(id).join("game"));
    }
    if version_id.is_empty() || !version_id.chars().next().is_some_and(|c| c.is_ascii_digit()) || !version_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') { return Err("Некорректный идентификатор версии Minecraft.".into()); }
    let version_id = version_id.as_str();
    let (profile, access_token, user_type) = match auth_mode.as_str() {
        "microsoft" => {
            let state = auth_state.lock().map_err(|_| "Не удалось проверить игровую сессию.".to_string())?;
            let active_id = state.active_profile_id.as_deref()
                .ok_or_else(|| "Сначала выбери Microsoft-аккаунт в разделе «Настройки».".to_string())?;
            let session = state.accounts.iter().find(|item| item.profile.id == active_id)
                .ok_or_else(|| "Активный Microsoft-аккаунт не найден. Выбери его заново в настройках.".to_string())?;
            (session.profile.clone(), session.access_token.clone(), "msa".to_string())
        }
        "offline" => {
            let name = offline_name.unwrap_or_default().trim().to_string();
            if !is_valid_offline_name(&name) {
                return Err("Некорректный ник Offline-профиля: нужно 3–16 символов (A–Z, a–z, 0–9, _).".into());
            }
            let profile = MinecraftProfile { id: offline_uuid(&name), name };
            (profile, "0".to_string(), "legacy".to_string())
        }
        _ => return Err("Неизвестный способ авторизации Minecraft.".into()),
    };
    let app_data = std::env::var_os("APPDATA").map(std::path::PathBuf::from).ok_or_else(|| "Не найдена папка APPDATA Windows.".to_string())?;
    let root = app_data.join("L-o-S-A");
    let version_dir = root.join("versions").join(version_id);
    let metadata_path = version_dir.join(format!("{version_id}.json"));
    let metadata_bytes = std::fs::read(&metadata_path).map_err(|_| format!("Клиент Minecraft {version_id} не установлен. Сначала скачай клиент."))?;
    let metadata: serde_json::Value = serde_json::from_slice(&metadata_bytes).map_err(|e| format!("Метаданные Minecraft повреждены: {e}"))?;
    let client_jar = version_dir.join(format!("{version_id}.jar"));
    if !client_jar.is_file() { return Err("Не найден клиентский JAR. Повтори установку клиента.".into()); }
    let required_java = metadata.get("javaVersion").and_then(|v| v.get("majorVersion")).and_then(|v| v.as_u64()).map(|v| v as u32).unwrap_or_else(|| {
        let parts: Vec<u32> = version_id.split('.').filter_map(|p| p.parse().ok()).collect();
        if parts.first() == Some(&1) && parts.get(1).copied().unwrap_or(0) <= 16 { 8 } else if parts.first() == Some(&1) && parts.get(1) == Some(&17) { 16 } else { 17 }
    });
    let java = ensure_java_runtime(required_java, &root).await?;
    let java_major = java_major_at(&java).ok_or_else(|| "Не удалось проверить установленную Java.".to_string())?;
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
            let classifier = native_key.replace("${arch}", arch);
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
    let game_dir = instance_game_dir.unwrap_or_else(|| root.join("game"));
    std::fs::create_dir_all(&game_dir).map_err(|e| format!("Не удалось создать игровую папку: {e}"))?;
    let assets_root = root.join("assets");
    let asset_index = metadata.get("assetIndex").and_then(|v| v.get("id")).and_then(|v| v.as_str()).unwrap_or(version_id);
    let mut values = std::collections::HashMap::new();
    values.insert("natives_directory".into(), natives_dir.to_string_lossy().to_string());
    values.insert("launcher_name".into(), "L.o.S.A.".into()); values.insert("launcher_version".into(), "0.10.3".into());
    values.insert("classpath".into(), classpath.join(if cfg!(windows) { ";" } else { ":" }));
    values.insert("classpath_separator".into(), if cfg!(windows) { ";".into() } else { ":".into() });
    values.insert("auth_player_name".into(), profile.name.clone()); values.insert("version_name".into(), version_id.to_string());
    values.insert("game_directory".into(), game_dir.to_string_lossy().to_string()); values.insert("assets_root".into(), assets_root.to_string_lossy().to_string());
    values.insert("assets_index_name".into(), asset_index.to_string());
    values.insert("game_assets".into(), assets_root.join("virtual").join(asset_index).to_string_lossy().to_string());
    values.insert("auth_uuid".into(), profile.id.clone());
    values.insert("auth_access_token".into(), access_token); values.insert("user_type".into(), user_type);
    values.insert("resolution_width".into(), "854".into()); values.insert("resolution_height".into(), "480".into());
    values.insert("quickPlayPath".into(), String::new()); values.insert("quickPlaySingleplayer".into(), String::new());
    values.insert("quickPlayMultiplayer".into(), String::new()); values.insert("quickPlayRealms".into(), String::new());
    values.insert("version_type".into(), metadata.get("type").and_then(|v| v.as_str()).unwrap_or("release").to_string());
    values.insert("user_properties".into(), "{}".into()); values.insert("clientid".into(), String::new()); values.insert("auth_xuid".into(), String::new());
    // Quick Play не запускается из интерфейса LoSA: соответствующие варианты должны оставаться выключенными.
    // Метаданные Mojang используют эти feature-флаги, чтобы не передавать несколько вариантов одновременно.
    let mut features = std::collections::HashMap::new();
    features.insert("is_demo_user".to_string(), false);
    features.insert("has_custom_resolution".to_string(), true);
    features.insert("is_quick_play_singleplayer".to_string(), false);
    features.insert("is_quick_play_multiplayer".to_string(), false);
    features.insert("is_quick_play_realms".to_string(), false);

    let mut jvm_args = Vec::new(); let mut game_args = Vec::new();
    append_metadata_arguments(&mut jvm_args, metadata.get("arguments").and_then(|v| v.get("jvm")), &values, &features);
    append_metadata_arguments(&mut game_args, metadata.get("arguments").and_then(|v| v.get("game")), &values, &features);
    if jvm_args.is_empty() {
        let defaults = ["-Xmx2G", "-Djava.library.path=${natives_directory}", "-cp", "${classpath}"];
        jvm_args.extend(defaults.iter().map(|v| expand_game_argument(v, &values)));
    }
    let main_class = metadata.get("mainClass").and_then(|v| v.as_str()).ok_or_else(|| "В метаданных отсутствует mainClass.".to_string())?;
    if metadata.get("arguments").and_then(|v| v.get("game")).is_none() {
        if let Some(legacy) = metadata.get("minecraftArguments").and_then(|v| v.as_str()) { game_args.extend(legacy.split_whitespace().map(|v| expand_game_argument(v, &values))); }
        else { return Err("Не удалось прочитать параметры запуска этой версии Minecraft.".into()); }
    }
    let logs_dir = root.join("logs");
    std::fs::create_dir_all(&logs_dir).map_err(|e| format!("Не удалось создать папку журналов: {e}"))?;
    let log_name = instance_id.as_deref()
        .map(|id| format!("minecraft-{version_id}-{id}-launch.log"))
        .unwrap_or_else(|| format!("minecraft-{version_id}-launch.log"));
    let log_path = logs_dir.join(log_name);
    let log_file = std::fs::File::create(&log_path).map_err(|e| format!("Не удалось создать журнал запуска: {e}"))?;
    let stderr_file = log_file.try_clone().map_err(|e| format!("Не удалось подготовить журнал ошибок: {e}"))?;
    let mut command = std::process::Command::new(&java);
    command.args(&jvm_args).arg(main_class).args(&game_args).current_dir(&game_dir)
        .stdout(std::process::Stdio::from(log_file))
        .stderr(std::process::Stdio::from(stderr_file));
    // Do not open a separate black console window for the Java child process on Windows.
    // Minecraft output is already captured in the launch log above.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command.spawn().map_err(|e| format!("Minecraft не удалось запустить через Java: {e}. Журнал: {}", log_path.display()))?;
    let pid = child.id();
    // Не сообщаем об успешном запуске, пока не убедились, что Java не завершилась мгновенно.
    tokio::time::sleep(Duration::from_secs(2)).await;
    if let Some(status) = child.try_wait().map_err(|e| format!("Не удалось проверить процесс Minecraft: {e}. Журнал: {}", log_path.display()))? {
        let log_tail = std::fs::read_to_string(&log_path).unwrap_or_default()
            .lines().rev().take(24).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!(
            "Minecraft завершился во время запуска (код: {}). Журнал: {}\nПоследние строки:\n{}",
            status, log_path.display(), if log_tail.is_empty() { "Журнал пуст.".to_string() } else { log_tail }
        ));
    }
    if let Some(id) = instance_id.as_deref() {
        if let Ok(mut instances) = read_instances(&root) {
            if let Some(instance) = instances.iter_mut().find(|item| item.id == id) {
                instance.last_played_at = Some(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs());
                let _ = write_instances(&root, &instances);
            }
        }
    }
    Ok(pid)
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
    let lookup = {
        let mut command = std::process::Command::new("where.exe");
        suppress_console_window(&mut command);
        command.arg("java.exe").output()
    };
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
    let mut command = std::process::Command::new(&executable);
    suppress_console_window(&mut command);
    let output = match command.arg("-version").output() {
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
        .manage(std::sync::Mutex::new(MinecraftAuthState::default()))
        .invoke_handler(tauri::generate_handler![search_public_servers, detect_bedrock_installation, list_bedrock_instances, create_bedrock_instance, delete_bedrock_instance, launch_bedrock, detect_java, microsoft_auth_configured, login_microsoft_browser, minecraft_auth_status, switch_minecraft_account, logout_minecraft, list_instances, create_instance, update_instance, delete_instance, prepare_instance, install_vanilla_client, install_minecraft_dependencies, get_minecraft_installation_status, launch_minecraft])
        .run(tauri::generate_context!())
        .expect("error while running L.o.S.A.");
}


#[cfg(test)]
mod launcher_tests {
    use super::*;

    #[test]
    fn offline_uuid_matches_minecraft_name_uuid_format() {
        assert_eq!(offline_uuid("Notch"), "b50ad385-829d-3141-a216-7e7d7539ba7f");
    }

    #[test]
    fn validates_offline_player_names() {
        assert!(is_valid_offline_name("Steve_123"));
        assert!(is_valid_offline_name("abc"));
        assert!(!is_valid_offline_name("ab"));
        assert!(!is_valid_offline_name("a name"));
        assert!(!is_valid_offline_name("имя"));
        assert!(!is_valid_offline_name("this_name_is_way_too_long"));
    }

    #[test]
    fn parses_java_versions() {
        assert_eq!(parse_java_major("openjdk version \"1.8.0_402\""), Some(8));
        assert_eq!(parse_java_major("openjdk version \"17.0.12\""), Some(17));
        assert_eq!(parse_java_major("java version \"21.0.4\""), Some(21));
    }

    #[test]
    fn rejects_unsafe_relative_paths() {
        assert!(safe_relative_path("libraries/example.jar").is_ok());
        assert!(safe_relative_path("../outside.jar").is_err());
        assert!(safe_relative_path("C:\\\\Windows\\\\system.ini").is_err());
        assert!(safe_relative_path("").is_err());
    }

    #[test]
    fn expands_mojang_placeholders() {
        let mut values = std::collections::HashMap::new();
        values.insert("auth_player_name".to_string(), "PlayerOne".to_string());
        values.insert("version_name".to_string(), "1.21.4".to_string());
        assert_eq!(
            expand_game_argument("--username=${auth_player_name}", &values),
            "--username=PlayerOne"
        );
        assert_eq!(
            expand_game_argument("${version_name}", &values),
            "1.21.4"
        );
    }

    #[test]
    fn respects_minecraft_argument_feature_rules() {
        let metadata: serde_json::Value = serde_json::json!([
            {
                "rules": [{"action": "allow", "features": {"is_quick_play_singleplayer": true}}],
                "value": ["--quickPlaySingleplayer", "world"]
            },
            {
                "rules": [{"action": "allow", "features": {"is_quick_play_multiplayer": true}}],
                "value": ["--quickPlayMultiplayer", "server.example"]
            },
            {
                "rules": [{"action": "allow", "features": {"has_custom_resolution": true}}],
                "value": ["--width", "854"]
            }
        ]);
        let mut values = std::collections::HashMap::new();
        let mut features = std::collections::HashMap::new();
        features.insert("is_quick_play_singleplayer".to_string(), false);
        features.insert("is_quick_play_multiplayer".to_string(), false);
        features.insert("has_custom_resolution".to_string(), true);

        let mut args = Vec::new();
        append_metadata_arguments(&mut args, Some(&metadata), &values, &features);
        assert_eq!(args, vec!["--width", "854"]);

        features.insert("is_quick_play_singleplayer".to_string(), true);
        let mut args_with_quick_play = Vec::new();
        append_metadata_arguments(&mut args_with_quick_play, Some(&metadata), &values, &features);
        assert_eq!(args_with_quick_play, vec!["--quickPlaySingleplayer", "world", "--width", "854"]);
    }

    #[test]
    fn applies_windows_library_rules() {
        let allowed: serde_json::Value = serde_json::json!({
            "rules": [
                {"action": "disallow", "os": {"name": "osx"}},
                {"action": "allow", "os": {"name": "windows"}}
            ]
        });
        let denied: serde_json::Value = serde_json::json!({
            "rules": [{"action": "disallow", "os": {"name": "windows"}}]
        });
        assert!(library_rule_allows(&allowed));
        assert!(!library_rule_allows(&denied));
    }
}

