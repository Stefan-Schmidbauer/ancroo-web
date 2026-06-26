import { useState } from "preact/hooks";
import type { Category } from "@/shared/local-categories";

const ICON_SUGGESTIONS = [
  "📝",
  "✏️",
  "🔧",
  "🎙️",
  "🔊",
  "🤖",
  "📊",
  "📁",
  "🔒",
  "📧",
  "📷",
  "🎨",
  "⚡",
  "💬",
  "📅",
  "🔍",
  "📦",
  "🧮",
  "🧹",
  "💡",
  "🔤",
  "💻",
  "🖼️",
  "🎬",
  "📋",
  "🏷️",
  "📎",
  "🔗",
  "🧠",
  "📡",
  "🛡️",
  "⏱️",
  "📈",
  "🗂️",
  "✅",
  "🔔",
  "🪄",
  "📄",
  "🌍",
  "🗑️",
  "🌐",
  "🏠",
  "⚙️",
  "🎯",
];

function IconPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div class="flex flex-wrap gap-1 mt-1.5">
      {ICON_SUGGESTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          class="w-7 h-7 text-base rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50 flex items-center justify-center transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

interface Props {
  categories: Category[];
  workflowCounts?: Record<string, number>;
  onSave: (cat: Category) => void;
  onDelete: (value: string) => void;
  onClose: () => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CategoryManager({
  categories,
  workflowCounts = {},
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function startEdit(cat: Category) {
    setEditingValue(cat.value);
    setEditLabel(cat.label);
    setEditIcon(cat.icon);
    setAdding(false);
    setConfirmDelete(null);
  }

  function cancelEdit() {
    setEditingValue(null);
    setEditLabel("");
    setEditIcon("");
  }

  function saveEdit() {
    if (!editingValue || !editLabel.trim()) return;
    onSave({ value: editingValue, label: editLabel.trim(), icon: editIcon.trim() || "🔧" });
    cancelEdit();
  }

  function startAdd() {
    setAdding(true);
    setNewLabel("");
    setNewIcon("");
    cancelEdit();
    setConfirmDelete(null);
  }

  function cancelAdd() {
    setAdding(false);
    setNewLabel("");
    setNewIcon("");
  }

  function saveNew() {
    if (!newLabel.trim()) return;
    const value = slugify(newLabel);
    onSave({ value, label: newLabel.trim(), icon: newIcon.trim() || "🔧" });
    cancelAdd();
  }

  return (
    <div class="flex flex-col h-screen">
      <div class="flex items-center justify-between p-3 border-b bg-white">
        <h1 class="font-bold text-sm">Categories</h1>
        <button onClick={onClose} class="text-xs text-gray-400 hover:text-gray-600">
          Done
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3 bg-gray-50 space-y-2">
        {categories.map((cat) => (
          <div key={cat.value} class="bg-white rounded-lg border p-3">
            {editingValue === cat.value ? (
              <div class="space-y-2">
                <div class="flex gap-2">
                  <input
                    type="text"
                    value={editIcon}
                    onInput={(e) => setEditIcon((e.target as HTMLInputElement).value)}
                    class="w-12 border rounded px-2 py-1.5 text-sm text-center"
                    placeholder="🔧"
                  />
                  <input
                    type="text"
                    value={editLabel}
                    onInput={(e) => setEditLabel((e.target as HTMLInputElement).value)}
                    class="flex-1 border rounded px-2 py-1.5 text-sm"
                    placeholder="Category name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                </div>
                <IconPicker onSelect={setEditIcon} />
                <div class="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={!editLabel.trim()}
                    class="flex-1 bg-blue-600 text-white py-1.5 rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    class="flex-1 border py-1.5 rounded text-xs text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : confirmDelete === cat.value ? (
              <div class="space-y-2">
                <p class="text-xs text-gray-600">
                  Delete <strong>{cat.label}</strong>?
                  {(workflowCounts[cat.value] ?? 0) > 0
                    ? ` ${workflowCounts[cat.value]} action${workflowCounts[cat.value] === 1 ? "" : "s"} will be moved to Uncategorized.`
                    : ""}
                </p>
                <div class="flex gap-2">
                  <button
                    onClick={() => {
                      onDelete(cat.value);
                      setConfirmDelete(null);
                    }}
                    class="flex-1 bg-red-500 text-white py-1.5 rounded text-xs hover:bg-red-600"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    class="flex-1 border py-1.5 rounded text-xs text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div class="flex items-center gap-2">
                <span class="text-base w-6 text-center">{cat.icon}</span>
                <span class="text-sm flex-1">{cat.label}</span>
                <button
                  onClick={() => startEdit(cat)}
                  class="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100"
                  title="Edit"
                >
                  ✎
                </button>
                <button
                  onClick={() => {
                    setConfirmDelete(cat.value);
                    cancelEdit();
                  }}
                  class="text-xs text-gray-400 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-gray-100"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        ))}

        {adding ? (
          <div class="bg-white rounded-lg border p-3 space-y-2">
            <div class="flex gap-2">
              <input
                type="text"
                value={newIcon}
                onInput={(e) => setNewIcon((e.target as HTMLInputElement).value)}
                class="w-12 border rounded px-2 py-1.5 text-sm text-center"
                placeholder="🔧"
              />
              <input
                type="text"
                value={newLabel}
                onInput={(e) => setNewLabel((e.target as HTMLInputElement).value)}
                class="flex-1 border rounded px-2 py-1.5 text-sm"
                placeholder="Category name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveNew();
                  if (e.key === "Escape") cancelAdd();
                }}
              />
            </div>
            <IconPicker onSelect={setNewIcon} />
            <div class="flex gap-2">
              <button
                onClick={saveNew}
                disabled={!newLabel.trim()}
                class="flex-1 bg-blue-600 text-white py-1.5 rounded text-xs hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={cancelAdd}
                class="flex-1 border py-1.5 rounded text-xs text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startAdd}
            class="w-full text-xs text-blue-500 hover:text-blue-700 py-2 rounded-lg border border-dashed border-blue-200 hover:border-blue-400 bg-white"
          >
            + Add Category
          </button>
        )}
      </div>
    </div>
  );
}
