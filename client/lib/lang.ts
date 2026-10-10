// Supported UI languages (see i18n.ts for the translations).
export const LANGUAGES = { en: "English", hi: "हिन्दी", es: "Español" } as const;
export type Lang = keyof typeof LANGUAGES;

export function detectLanguage(): Lang {
  if (typeof navigator === "undefined") return "en";
  const l = navigator.language.toLowerCase();
  return l.startsWith("hi") ? "hi" : l.startsWith("es") ? "es" : "en";
}
