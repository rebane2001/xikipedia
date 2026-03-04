import type { LanguageConfig } from "../types";

export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  simple: {
    code: "simple",
    name: "Simple English",
    nativeName: "Simple English",
    wikipediaDomain: "simple.wikipedia.org",
    defaultCategories: [
      "nature", "science", "animals", "anthropology", "places",
      "sociology", "art", "mathematics", "games", "technology",
      "music", "human sexuality",
    ],
  },
  ru: {
    code: "ru",
    name: "Russian",
    nativeName: "Русский",
    wikipediaDomain: "ru.wikipedia.org",
    defaultCategories: [
      "наука", "природа", "животные", "история", "география",
      "искусство", "математика", "технология", "музыка", "спорт",
      "литература", "философия",
    ],
  },
};
