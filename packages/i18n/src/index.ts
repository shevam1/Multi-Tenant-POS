import en from './messages/en.json';
import fr from './messages/fr.json';

export const locales = ['en', 'fr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const messages: Record<Locale, typeof en> = { en, fr };

export { en, fr };
