use serde_json::Value;

#[tauri::command]
pub async fn search_public_servers(query: String, edition: String, license: String) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("L-o-S-A-Launcher/0.11.2")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Не удалось подготовить поиск серверов: {e}"))?;
    let mut request = client.get("https://anyserver.pro/api/servers")
        .query(&[("limit", "48"), ("sort", "most_players"), ("hide_offline", "true")]);
    let game = match edition.as_str() { "Java" => Some("mc_java"), "Bedrock" => Some("mc_bedrock"), _ => None };
    if let Some(game) = game { request = request.query(&[("game", game)]); }
    let auth_type = match license.as_str() { "required" => "online", "not_required" => "offline", _ => "any" };
    request = request.query(&[("auth_type", auth_type)]);
    let query = query.trim();
    if !query.is_empty() { request = request.query(&[("search", query)]); }
    let response = request.send().await
        .map_err(|e| format!("Не удалось связаться с каталогом серверов AnyServer.pro: {e}"))?;
    let status = response.status();
    if !status.is_success() { return Err(format!("Каталог серверов вернул ошибку HTTP {status}. Попробуй повторить поиск позже.")); }
    response.json::<Value>().await
        .map_err(|e| format!("Каталог серверов вернул некорректный ответ: {e}"))
}
