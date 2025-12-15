import { createInstance } from "i18next";

import { resources } from "./resources";
import { DEFAULT_LOCALE, type SupportedLocale } from "./settings";

export async function getServerT(lng: SupportedLocale = DEFAULT_LOCALE) {
  const i18n = createInstance();
  await i18n.init({
    lng,
    fallbackLng: DEFAULT_LOCALE,
    resources,
    defaultNS: "translation",
    interpolation: { escapeValue: false },
  });

  return i18n.getFixedT(lng);
}
