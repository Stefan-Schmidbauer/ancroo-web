export interface Category {
  value: string;
  label: string;
  icon: string;
}

const STORAGE_KEY = "localCategories";

export const DEFAULT_CATEGORIES: Category[] = [
  { value: "Starter", label: "Starter", icon: "⚡" },
  { value: "Writing", label: "Writing", icon: "✍️" },
  { value: "Coding", label: "Coding", icon: "💻" },
  { value: "Translation", label: "Translation", icon: "🌐" },
  { value: "Research", label: "Research", icon: "🔍" },
  { value: "Productivity", label: "Productivity", icon: "⚙️" },
  { value: "Custom", label: "Custom", icon: "🔧" },
];

export async function listCategories(): Promise<Category[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as Category[] | undefined) ?? DEFAULT_CATEGORIES;
}

export async function saveCategory(cat: Category): Promise<void> {
  const all = await listCategories();
  const idx = all.findIndex((c) => c.value === cat.value);
  if (idx >= 0) {
    all[idx] = cat;
  } else {
    all.push(cat);
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

export async function deleteCategory(value: string): Promise<void> {
  const all = await listCategories();
  await chrome.storage.local.set({ [STORAGE_KEY]: all.filter((c) => c.value !== value) });
}
