"use client";

import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import { resources } from "./resources";
import { DEFAULT_LOCALE } from "./settings";

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    resources,
    defaultNS: "translation",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export const i18n = i18next;
