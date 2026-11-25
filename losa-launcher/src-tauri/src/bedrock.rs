use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BedrockInstallInfo {
    installed: bool,
    version: Option<String>,
    package_family_name: Option<String>,
    worlds_path: Option<String>,
    behavior_packs_path: Option<String>,
    resource_packs_path: Option<String>,
    message: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BedrockInstance {
    id: String,
    name: String,
    created_at: u64,
    last_played_at: Option<u64>,
}

fn app_data_root() -> Result<PathBuf, String> {
    let app_data = std::env::var_os("APPDATA").map(PathBuf::from)
        .ok_or_else(|| "Не найдена папка APPDATA Windows.".to_string())?;
    Ok(app_data.join("L-o-S-A"))
}

fn instances_path() -> Result<PathBuf, String> {
    Ok(app_data_root()?.join("bedrock-instances.json"))
}

fn read_instances() -> Result<Vec<BedrockInstance>, String> {
    let path = instances_path()?;
    if !path.is_file() { return Ok(Vec::new()); }
    let bytes = std::fs::read(path).map_err(|e| format!("Не удалось прочитать профили Bedrock: {e}"))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("Список профилей Bedrock повреждён: {e}"))
}

fn write_instances(instances: &[BedrockInstance]) -> Result<(), String> {
    let path = instances_path()?;
    let root = path.parent().ok_or_else(|| "Не удалось определить папку профилей.".to_string())?;
    std::fs::create_dir_all(root).map_err(|e| format!("Не удалось создать папку L.o.S.A.: {e}"))?;
    let temp = root.join("bedrock-instances.json.tmp");
    let bytes = serde_json::to_vec_pretty(instances).map_err(|e| format!("Не удалось сохранить профили Bedrock: {e}"))?;
    std::fs::write(&temp, bytes).map_err(|e| format!("Не удалось записать профили Bedrock: {e}"))?;
    if path.exists() { std::fs::remove_file(&path).map_err(|e| format!("Не удалось обновить профили Bedrock: {e}"))?; }
    std::fs::rename(temp, path).map_err(|e| format!("Не удалось завершить сохранение профилей: {e}"))
}

#[cfg(target_os = "windows")]
fn detect_bedrock_package() -> Result<(String, String), String> {
    use std::os::windows::process::CommandExt;
    let script = "$p = Get-AppxPackage -Name Microsoft.MinecraftUWP -ErrorAction SilentlyContinue | Select-Object -First 1; if ($null -eq $p) { exit 3 }; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output ($p.PackageFamilyName + '|' + $p.Version.ToString())";
    let output = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(0x08000000)
        .output().map_err(|e| format!("Не удалось проверить установку Minecraft Bedrock: {e}"))?;
    if !output.status.success() {
        return Err("Minecraft Bedrock для Windows не найден. Установи официальную игру через Microsoft Store и повтори проверку.".into());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut parts = text.trim().splitn(2, '|');
    let family = parts.next().unwrap_or("").trim().to_string();
    let version = parts.next().unwrap_or("").trim().to_string();
    if family.is_empty() || version.is_empty() {
        return Err("Windows обнаружила пакет Minecraft, но не вернула его версию.".into());
    }
    Ok((family, version))
}

#[cfg(not(target_os = "windows"))]
fn detect_bedrock_package() -> Result<(String, String), String> {
    Err("Автоматическое обнаружение Minecraft Bedrock пока поддерживается только в Windows.".into())
}

#[cfg(target_os = "windows")]
fn detect_bedrock_application_id() -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    // Read the actual Application Id from the installed package manifest instead of
    // assuming every Minecraft package exposes an application named "App".
    let script = "$ErrorActionPreference = 'Stop'; $p = Get-AppxPackage -Name Microsoft.MinecraftUWP -ErrorAction SilentlyContinue | Select-Object -First 1; if ($null -eq $p) { exit 3 }; $m = Get-AppxPackageManifest -Package $p; $app = $m.SelectSingleNode(\"//*[local-name()='Applications']/*[local-name()='Application']\"); if ($null -eq $app) { exit 4 }; $id = $app.GetAttribute('Id'); if ([string]::IsNullOrWhiteSpace($id)) { exit 5 }; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output ($p.PackageFamilyName + '!' + $id)";
    let output = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(0x08000000)
        .output().map_err(|e| format!("Не удалось определить приложение Minecraft Bedrock: {e}"))?;
    if !output.status.success() {
        return Err("Не удалось определить идентификатор запуска Minecraft Bedrock в Windows. Проверь установку игры через Microsoft Store.".into());
    }
    let app_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !app_id.contains('!') || app_id.ends_with('!') || app_id.chars().any(char::is_control) {
        return Err("Windows вернула некорректный идентификатор приложения Minecraft Bedrock.".into());
    }
    Ok(app_id)
}

#[tauri::command]
pub fn detect_bedrock_installation() -> BedrockInstallInfo {
    match detect_bedrock_package() {
        Ok((family, version)) => {
            let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
            let com_mojang = local.map(|p| p.join("Packages").join(&family).join("LocalState").join("games").join("com.mojang"));
            let worlds = com_mojang.as_ref().map(|p| p.join("minecraftWorlds"));
            let behavior = com_mojang.as_ref().map(|p| p.join("behavior_packs"));
            let resources = com_mojang.as_ref().map(|p| p.join("resource_packs"));
            BedrockInstallInfo {
                installed: true,
                version: Some(version),
                package_family_name: Some(family),
                worlds_path: worlds.map(|p| p.to_string_lossy().to_string()),
                behavior_packs_path: behavior.map(|p| p.to_string_lossy().to_string()),
                resource_packs_path: resources.map(|p| p.to_string_lossy().to_string()),
                message: "Minecraft Bedrock обнаружен.".into(),
            }
        }
        Err(message) => BedrockInstallInfo {
            installed: false, version: None, package_family_name: None,
            worlds_path: None, behavior_packs_path: None, resource_packs_path: None, message,
        }
    }
}

#[tauri::command]
pub fn list_bedrock_instances() -> Result<Vec<BedrockInstance>, String> {
    read_instances()
}

#[tauri::command]
pub fn create_bedrock_instance(name: String) -> Result<BedrockInstance, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 40 {
        return Err("Название профиля должно содержать от 1 до 40 символов.".into());
    }
    let mut instances = read_instances()?;
    if instances.iter().any(|i| i.name.eq_ignore_ascii_case(name)) {
        return Err("Профиль с таким названием уже существует.".into());
    }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let item = BedrockInstance {
        id: format!("bedrock-{}", now.as_nanos()),
        name: name.to_string(),
        created_at: now.as_secs(),
        last_played_at: None,
    };
    instances.insert(0, item.clone());
    write_instances(&instances)?;
    Ok(item)
}

#[tauri::command]
pub fn delete_bedrock_instance(instance_id: String) -> Result<(), String> {
    if instance_id.len() > 80 || !instance_id.starts_with("bedrock-") ||
        !instance_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Некорректный идентификатор профиля Bedrock.".into());
    }
    let mut instances = read_instances()?;
    let before = instances.len();
    instances.retain(|item| item.id != instance_id);
    if before == instances.len() { return Err("Профиль Bedrock не найден.".into()); }
    write_instances(&instances)
}

#[tauri::command]
pub fn launch_bedrock() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let app_id = detect_bedrock_application_id()?;
        let target = format!("shell:AppsFolder\\{app_id}");
        let status = std::process::Command::new("explorer.exe")
            .arg(target)
            .creation_flags(0x08000000)
            .status()
            .map_err(|e| format!("Не удалось открыть Minecraft Bedrock: {e}"))?;
        if !status.success() {
            return Err("Windows не смогла передать запрос на запуск Minecraft Bedrock.".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Запуск Minecraft Bedrock из L.o.S.A. пока поддерживается только в Windows.".into())
    }
}
