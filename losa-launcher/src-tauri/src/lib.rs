use serde::{Deserialize, Serialize};
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

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MinecraftProfile {
    id: String,
    name: String,
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
async fn complete_microsoft_login(client_id: String, device_code: String, interval: u64, expires_in: u64) -> Result<MinecraftProfile, String> {
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
        .bearer_auth(mc_token.access_token).send().await
        .map_err(|e| auth_error(format!("Не удалось получить профиль Minecraft: {e}")))?;
    if !profile.status().is_success() {
        return Err(format!("Профиль Minecraft недоступен (HTTP {}). Возможно, у аккаунта нет профиля Java Edition.", profile.status()));
    }
    profile.json::<MinecraftProfile>().await
        .map_err(|e| auth_error(format!("Не удалось прочитать профиль Minecraft: {e}")))
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
    if parsed_metadata_url.scheme() != "https" || !parsed_metadata_url.host_str().unwrap_or("").ends_with("mojang.com") {
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
    if parsed_client_url.scheme() != "https" || !parsed_client_url.host_str().unwrap_or("").ends_with("mojang.com") {
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
        .invoke_handler(tauri::generate_handler![detect_java, start_microsoft_login, complete_microsoft_login, install_vanilla_client])
        .run(tauri::generate_context!())
        .expect("error while running L.o.S.A.");
}
