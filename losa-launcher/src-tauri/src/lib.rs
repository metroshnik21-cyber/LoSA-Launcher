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
        .form(&[
            ("client_id", client_id.trim()),
            ("scope", "XboxLive.signin offline_access"),
        ])
        .send().await.map_err(|e| auth_error(format!("Не удалось связаться с Microsoft: {e}")))?;

    if !response.status().is_success() {
        return Err(format!("Microsoft OAuth вернул HTTP {}", response.status()));
    }
    let data: DeviceCodeResponse = response.json().await
        .map_err(|e| auth_error(format!("Не удалось прочитать ответ Microsoft: {e}")))?;

    Ok(DeviceCodeInfo {
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri,
        message: data.message,
        interval: data.interval.unwrap_or(5),
        expires_in: data.expires_in,
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

        let response = client
            .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("client_id", client_id.trim()),
                ("device_code", device_code.as_str()),
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
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={}", microsoft_token.access_token)
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
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
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbox_data.token] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send().await.map_err(|e| auth_error(format!("Ошибка Xbox XSTS: {e}")))?;
    if !xsts.status().is_success() {
        return Err(format!("Xbox XSTS отклонил вход (HTTP {}). Возможно, нужно настроить Xbox-профиль или семейные разрешения.", xsts.status()));
    }
    let xsts_data: XboxAuthResponse = xsts.json().await
        .map_err(|e| auth_error(format!("Не удалось прочитать ответ XSTS: {e}")))?;

    let minecraft = client.post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "identityToken": format!("XBL3.0 x={};{}", user_hash, xsts_data.token)
        }))
        .send().await.map_err(|e| auth_error(format!("Ошибка Minecraft Services: {e}")))?;
    if !minecraft.status().is_success() {
        return Err(format!("Minecraft Services отклонил вход (HTTP {}). Проверь лицензию Minecraft Java и доступ к Minecraft Services.", minecraft.status()));
    }
    let mc_token: MinecraftLoginResponse = minecraft.json().await
        .map_err(|e| auth_error(format!("Не удалось получить Minecraft-токен: {e}")))?;

    let profile = client.get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(mc_token.access_token)
        .send().await.map_err(|e| auth_error(format!("Не удалось получить профиль Minecraft: {e}")))?;
    if !profile.status().is_success() {
        return Err(format!("Профиль Minecraft недоступен (HTTP {}). Возможно, у аккаунта нет профиля Java Edition.", profile.status()));
    }
    profile.json::<MinecraftProfile>().await
        .map_err(|e| auth_error(format!("Не удалось прочитать профиль Minecraft: {e}")))
}

#[tauri::command]
fn detect_java() -> String {
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("cmd").args(["/C", "java -version 2>&1"]).output();
    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("java").arg("-version").output();

    match output {
        Ok(result) if result.status.success() || !result.stderr.is_empty() => {
            let text = String::from_utf8_lossy(&result.stderr);
            let combined = if text.trim().is_empty() { String::from_utf8_lossy(&result.stdout).to_string() } else { text.to_string() };
            format!("Найдена: {}", combined.lines().next().unwrap_or("версия не определена"))
        }
        _ => "Java не найдена в PATH. Автоматическая установка JRE — следующий шаг.".to_string()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![detect_java, start_microsoft_login, complete_microsoft_login])
        .run(tauri::generate_context!())
        .expect("error while running L.o.S.A.");
}
