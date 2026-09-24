export type AWPlatform = 'web' | 'tma' | 'ios' | 'android';

export type AWColorScheme = 'light' | 'dark';

export type AWInsets = Readonly<{ top: number; right: number; bottom: number; left: number }>;

// Окружение хоста: platform, colorScheme, languageCode, safeAreaInset, isActive.
export interface AWEnvironment {
  platform?: AWPlatform;
  colorScheme?: AWColorScheme;
  languageCode?: string;
  safeAreaInset?: AWInsets;
  isActive: boolean;
}
