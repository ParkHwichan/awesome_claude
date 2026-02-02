use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Macro {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub commands: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcut: Option<String>,
    pub scope: MacroScope,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MacroScope {
    Project,
    Global,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct MacroStore {
    macros: Vec<Macro>,
    #[serde(default)]
    order: Vec<String>, // Macro IDs in display order
}

fn get_global_macros_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".awesome-claude").join("macros.json")
}

fn get_project_macros_path(working_dir: &str) -> PathBuf {
    PathBuf::from(working_dir)
        .join(".awesome-claude")
        .join("macros.json")
}

fn load_macro_store(path: &PathBuf) -> MacroStore {
    if let Ok(content) = fs::read_to_string(path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        MacroStore::default()
    }
}

fn save_macro_store(path: &PathBuf, store: &MacroStore) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let content =
        serde_json::to_string_pretty(store).map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(path, content).map_err(|e| format!("Failed to write: {}", e))?;
    Ok(())
}

/// List all macros (both project and global)
#[tauri::command]
pub fn macro_list(working_dir: String) -> Vec<Macro> {
    let mut result = Vec::new();

    // Load global macros
    let global_path = get_global_macros_path();
    let global_store = load_macro_store(&global_path);
    result.extend(global_store.macros);

    // Load project macros
    let project_path = get_project_macros_path(&working_dir);
    let project_store = load_macro_store(&project_path);
    result.extend(project_store.macros);

    // Sort by order (global first, then project)
    // Within each scope, maintain insertion order
    result.sort_by(|a, b| {
        match (&a.scope, &b.scope) {
            (MacroScope::Global, MacroScope::Project) => std::cmp::Ordering::Less,
            (MacroScope::Project, MacroScope::Global) => std::cmp::Ordering::Greater,
            _ => a.created_at.cmp(&b.created_at),
        }
    });

    result
}

/// Create a new macro
#[tauri::command]
pub fn macro_create(
    working_dir: String,
    name: String,
    description: Option<String>,
    commands: Vec<String>,
    icon: Option<String>,
    color: Option<String>,
    shortcut: Option<String>,
    scope: String,
) -> Result<Macro, String> {
    let scope = match scope.as_str() {
        "global" => MacroScope::Global,
        _ => MacroScope::Project,
    };

    let now = chrono::Utc::now().to_rfc3339();
    let macro_item = Macro {
        id: Uuid::new_v4().to_string(),
        name,
        description,
        commands,
        icon,
        color,
        shortcut,
        scope: scope.clone(),
        created_at: now.clone(),
        updated_at: now,
    };

    let path = match scope {
        MacroScope::Global => get_global_macros_path(),
        MacroScope::Project => get_project_macros_path(&working_dir),
    };

    let mut store = load_macro_store(&path);
    store.macros.push(macro_item.clone());
    store.order.push(macro_item.id.clone());
    save_macro_store(&path, &store)?;

    Ok(macro_item)
}

/// Update an existing macro
#[tauri::command]
pub fn macro_update(
    working_dir: String,
    id: String,
    name: Option<String>,
    description: Option<String>,
    commands: Option<Vec<String>>,
    icon: Option<String>,
    color: Option<String>,
    shortcut: Option<String>,
) -> Result<Option<Macro>, String> {
    // Try global first
    let global_path = get_global_macros_path();
    let mut global_store = load_macro_store(&global_path);

    if let Some(idx) = global_store.macros.iter().position(|m| m.id == id) {
        let m = &mut global_store.macros[idx];
        if let Some(n) = name {
            m.name = n;
        }
        if description.is_some() {
            m.description = description;
        }
        if let Some(c) = commands {
            m.commands = c;
        }
        if icon.is_some() {
            m.icon = icon;
        }
        if color.is_some() {
            m.color = color;
        }
        if shortcut.is_some() {
            m.shortcut = shortcut;
        }
        m.updated_at = chrono::Utc::now().to_rfc3339();

        let updated = m.clone();
        save_macro_store(&global_path, &global_store)?;
        return Ok(Some(updated));
    }

    // Try project
    let project_path = get_project_macros_path(&working_dir);
    let mut project_store = load_macro_store(&project_path);

    if let Some(idx) = project_store.macros.iter().position(|m| m.id == id) {
        let m = &mut project_store.macros[idx];
        if let Some(n) = name {
            m.name = n;
        }
        if description.is_some() {
            m.description = description;
        }
        if let Some(c) = commands {
            m.commands = c;
        }
        if icon.is_some() {
            m.icon = icon;
        }
        if color.is_some() {
            m.color = color;
        }
        if shortcut.is_some() {
            m.shortcut = shortcut;
        }
        m.updated_at = chrono::Utc::now().to_rfc3339();

        let updated = m.clone();
        save_macro_store(&project_path, &project_store)?;
        return Ok(Some(updated));
    }

    Ok(None)
}

/// Delete a macro
#[tauri::command]
pub fn macro_delete(working_dir: String, id: String) -> Result<bool, String> {
    // Try global first
    let global_path = get_global_macros_path();
    let mut global_store = load_macro_store(&global_path);

    let orig_len = global_store.macros.len();
    global_store.macros.retain(|m| m.id != id);
    global_store.order.retain(|i| i != &id);

    if global_store.macros.len() < orig_len {
        save_macro_store(&global_path, &global_store)?;
        return Ok(true);
    }

    // Try project
    let project_path = get_project_macros_path(&working_dir);
    let mut project_store = load_macro_store(&project_path);

    let orig_len = project_store.macros.len();
    project_store.macros.retain(|m| m.id != id);
    project_store.order.retain(|i| i != &id);

    if project_store.macros.len() < orig_len {
        save_macro_store(&project_path, &project_store)?;
        return Ok(true);
    }

    Ok(false)
}

/// Reorder macros
#[tauri::command]
pub fn macro_reorder(working_dir: String, macro_ids: Vec<String>) -> Result<(), String> {
    // Separate into global and project IDs
    let global_path = get_global_macros_path();
    let mut global_store = load_macro_store(&global_path);
    let global_ids: std::collections::HashSet<_> =
        global_store.macros.iter().map(|m| m.id.clone()).collect();

    let project_path = get_project_macros_path(&working_dir);
    let mut project_store = load_macro_store(&project_path);
    let project_ids: std::collections::HashSet<_> =
        project_store.macros.iter().map(|m| m.id.clone()).collect();

    // Update orders
    global_store.order = macro_ids
        .iter()
        .filter(|id| global_ids.contains(*id))
        .cloned()
        .collect();
    project_store.order = macro_ids
        .iter()
        .filter(|id| project_ids.contains(*id))
        .cloned()
        .collect();

    // Reorder macros vectors to match order
    let reorder = |macros: &mut Vec<Macro>, order: &[String]| {
        let id_to_idx: HashMap<_, _> = order.iter().enumerate().map(|(i, id)| (id, i)).collect();
        macros.sort_by_key(|m| id_to_idx.get(&m.id).copied().unwrap_or(usize::MAX));
    };

    reorder(&mut global_store.macros, &global_store.order);
    reorder(&mut project_store.macros, &project_store.order);

    save_macro_store(&global_path, &global_store)?;
    save_macro_store(&project_path, &project_store)?;

    Ok(())
}
