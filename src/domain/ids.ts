/**
 * ID generators for domain entities.
 * IDs are URL-safe, lowercase, latin-only slugs derived from Cyrillic names.
 */

const CYRILLIC_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

/** Transliterate Cyrillic to Latin and slugify. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((ch) => CYRILLIC_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generate person ID from surname + initials.
 * "Гайдуков Н.И." → "gaydukov-ni"
 * "Буряк А.М." → "buryak-am"
 */
export function generatePersonId(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) throw new Error("Empty name for person ID");
  const parts = trimmed.split(/\s+/);

  const surname = slugify(parts[0]);
  const initials = parts
    .slice(1)
    .map((p) => slugify(p.replace(/\./g, "")))
    .join("");

  return initials ? `${surname}-${initials}` : surname;
}

/**
 * Generate organization ID from short name or full name.
 * "АО «ОЭК»" → "oek"
 * "АНО «ОЭК Стройтрест»" → "oek-stroytrest"
 * "ООО «СПЕЦИНЖСТРОЙ»" → "specinjstroy"
 */
export function generateOrgId(name: string): string {
  // Extract name inside quotes if present
  const quoted = name.match(/[«"](.*?)[»"]/);
  const base = quoted ? quoted[1] : name;
  // Remove organizational form prefixes
  const cleaned = base.replace(/^(АО|АНО|ООО|ОАО|ПАО|ГУП|МУП)\s*/i, "");
  return slugify(cleaned);
}

/**
 * Generate transition ID from customer + object + gnb_number_short.
 * ("Крафт", "Марьино", "5-5") → "kraft-marjino-5-5"
 */
export function generateTransitionId(
  customer: string,
  object: string,
  gnbNumberShort: string,
): string {
  const parts = [slugify(customer), slugify(object), slugify(gnbNumberShort)];
  return parts.filter(Boolean).join("-");
}
