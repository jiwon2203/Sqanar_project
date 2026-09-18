// src/state/useSettings.ts
import * as React from 'react';
import apiClient from '../../api/apiClient';

export type FontSizeKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ThemeKey = 'light' | 'dark';

type SettingsContextType = {
  theme: ThemeKey;
  setTheme: (t: ThemeKey) => void;
  fontSize: FontSizeKey;
  setFontSize: (s: FontSizeKey) => void;
  palette: {
    bg: string; card: string; text: string; sub: string; border: string; primary: string; tab: string;
  };
  baseFont: number;
  saveDisplay: (partial?: Partial<{ theme: ThemeKey; fontSize: FontSizeKey }>) => Promise<void>;
  refreshFromServer: () => Promise<void>;
};

/** ---------- 전역 싱글톤 Context (두 사본 로드 방지) ---------- */
const CTX_KEY = '__SQANAR_SETTINGS_CTX__' as const;

const Ctx: React.Context<SettingsContextType | null> =
  (globalThis as any)[CTX_KEY] || React.createContext<SettingsContextType | null>(null);

if (!(globalThis as any)[CTX_KEY]) {
  (globalThis as any)[CTX_KEY] = Ctx;
}

/** ---------- 공용 변환 유틸 ---------- */
const mapSizeToScale = (s: FontSizeKey) =>
  ({ xs: 90, sm: 95, md: 100, lg: 110, xl: 120 }[s] ?? 100);

const mapScaleToSize = (p: number): FontSizeKey => {
  if (p <= 92) return 'xs';
  if (p <= 97) return 'sm';
  if (p <= 105) return 'md';
  if (p <= 115) return 'lg';
  return 'xl';
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = React.useState<ThemeKey>('light');
  const [fontSize, setFontSize] = React.useState<FontSizeKey>('md');

  const palette = React.useMemo(
    () =>
      theme === 'dark'
        ? { bg: '#101214', card: '#1b1f24', text: '#e6e6e6', sub: '#9aa0a6', border: '#2a2f36', primary: '#2563eb', tab: '#0d1117' }
        : { bg: '#f2f3f7', card: '#ffffff', text: '#202124', sub: '#666666', border: 'rgba(0,0,0,0.08)', primary: '#2563eb', tab: '#FFFFFF' },
    [theme]
  );

  const baseFont = React.useMemo(
    () => ({ xs: 12, sm: 14, md: 16, lg: 18, xl: 20 }[fontSize] || 16),
    [fontSize]
  );

  const refreshFromServer = React.useCallback(async () => {
    try {
      const sres = await apiClient.get('/settings/json');
      const s = sres.data?.settings;
      if (s) {
        const srvTheme: ThemeKey = s.display?.theme === 'dark' ? 'dark' : 'light';
        const scale = Number(s.display?.font_scale ?? 100);
        setTheme(srvTheme);
        setFontSize(mapScaleToSize(Number.isFinite(scale) ? scale : 100));
      }
    } catch {
      // 네트워크 실패는 조용히 패스
    }
  }, []);

  React.useEffect(() => {
    refreshFromServer();
  }, [refreshFromServer]);

  const saveDisplay = React.useCallback(
    async (partial?: Partial<{ theme: ThemeKey; fontSize: FontSizeKey }>) => {
      const nextTheme: ThemeKey = partial?.theme ?? theme;
      const nextFontSize: FontSizeKey = partial?.fontSize ?? fontSize;

      // 낙관적 반영
      setTheme(prev => (prev !== nextTheme ? nextTheme : prev));
      setFontSize(prev => (prev !== nextFontSize ? nextFontSize : prev));

      try {
        await apiClient.post('/settings', {
          display: { theme: nextTheme, font_scale: mapSizeToScale(nextFontSize) },
        });
      } catch (e) {
        console.warn('save settings error', (e as any)?.message);
      }
    },
    [theme, fontSize]
  );

  const value = React.useMemo<SettingsContextType>(
    () => ({
      theme,
      setTheme,
      fontSize,
      setFontSize,
      palette,
      baseFont,
      saveDisplay,
      refreshFromServer,
    }),
    [theme, fontSize, palette, baseFont, saveDisplay, refreshFromServer]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

/** ---------- 훅: Provider 밖 호출 시도도 크래시 나지 않게 가드 ---------- */
export const useSettings = () => {
  const v = React.useContext(Ctx);
  if (!v) {
    console.warn('[useSettings] Provider가 감싸지 않아 기본값으로 동작합니다.');
    return {
      theme: 'light' as ThemeKey,
      setTheme: () => {},
      fontSize: 'md' as FontSizeKey,
      setFontSize: () => {},
      palette: {
        bg: '#f2f3f7', card: '#ffffff', text: '#202124', sub: '#666666',
        border: 'rgba(0,0,0,0.08)', primary: '#2563eb', tab: '#FFFFFF',
      },
      baseFont: 16,
      saveDisplay: async () => {},
      refreshFromServer: async () => {},
    } as SettingsContextType;
  }
  return v;
};
