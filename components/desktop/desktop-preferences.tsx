'use client';

import React, { useEffect, useState } from 'react';
import { Monitor, RefreshCw } from 'lucide-react';
import type { DesktopPreferences as Prefs, PlatformInfo } from '@/lib/desktop/types';

const ZOOM_OPTIONS = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

const Toggle: React.FC<{ checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; label: string }> = ({
  checked,
  disabled,
  onChange,
  label,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
      checked ? 'bg-blue-600' : 'bg-gray-300'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.2)] transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
      }`}
    />
  </button>
);

/** Desktop-only block for the Settings page; renders nothing in the browser. */
export const DesktopPreferences: React.FC = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [info, setInfo] = useState<PlatformInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.desktopBridge : undefined;
    if (!bridge?.isDesktop) return;
    setIsDesktop(true);
    bridge.getPreferences?.().then(setPrefs).catch(() => setError('Не удалось прочитать настройки приложения.'));
    bridge.getPlatformInfo?.().then(setInfo).catch(() => {});
  }, []);

  if (!isDesktop) return null;

  const update = async (patch: Partial<Prefs>) => {
    const bridge = window.desktopBridge;
    if (!bridge?.setPreferences) return;
    setError(null);
    try {
      setPrefs(await bridge.setPreferences(patch));
    } catch {
      setError('Не удалось сохранить настройки приложения.');
    }
  };

  const platformLabel = info
    ? `${info.platform === 'win32' ? 'Windows' : info.platform} ${info.arch}`
    : '';

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4">
        <Monitor className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-900">Приложение на компьютере</h2>
        {!prefs && !error && <RefreshCw className="ml-auto h-3.5 w-3.5 animate-spin text-slate-400" />}
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
          <span>
            <span className="block text-sm font-medium text-slate-800">Запускать при входе в Windows</span>
            <span className="mt-1 block text-xs text-slate-500">
              {info && info.isPackaged === false
                ? 'Доступно только в установленной версии приложения.'
                : 'Приложение откроется свёрнутым в область уведомлений и сразу начнёт получать сообщения.'}
            </span>
          </span>
          <Toggle
            label="Запускать при входе в Windows"
            checked={Boolean(prefs?.launchAtLogin)}
            disabled={!prefs || info?.isPackaged === false}
            onChange={v => update({ launchAtLogin: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
          <span>
            <span className="block text-sm font-medium text-slate-800">Сворачивать в область уведомлений при закрытии</span>
            <span className="mt-1 block text-xs text-slate-500">
              Кнопка «Закрыть» скрывает окно, а уведомления продолжают приходить. Если выключить — окно закрывается вместе с приложением.
            </span>
          </span>
          <Toggle
            label="Сворачивать в область уведомлений при закрытии"
            checked={prefs ? prefs.closeToTray : true}
            disabled={!prefs}
            onChange={v => update({ closeToTray: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
          <span>
            <span className="block text-sm font-medium text-slate-800">Масштаб интерфейса</span>
            <span className="mt-1 block text-xs text-slate-500">
              Также <kbd className="rounded border border-gray-200 border-b-2 bg-white px-1 font-sans text-[10px] font-semibold text-gray-600">Ctrl</kbd> + <kbd className="rounded border border-gray-200 border-b-2 bg-white px-1 font-sans text-[10px] font-semibold text-gray-600">+</kbd> / <kbd className="rounded border border-gray-200 border-b-2 bg-white px-1 font-sans text-[10px] font-semibold text-gray-600">−</kbd>, сброс — <kbd className="rounded border border-gray-200 border-b-2 bg-white px-1 font-sans text-[10px] font-semibold text-gray-600">Ctrl</kbd> + <kbd className="rounded border border-gray-200 border-b-2 bg-white px-1 font-sans text-[10px] font-semibold text-gray-600">0</kbd>.
            </span>
          </span>
          <select
            value={prefs ? String(prefs.zoomFactor) : '1'}
            disabled={!prefs}
            onChange={e => update({ zoomFactor: Number(e.target.value) })}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-100"
          >
            {ZOOM_OPTIONS.map(z => (
              <option key={z} value={String(z)}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
        </div>
      </div>

      {info && (
        <p className="mt-4 text-[11px] text-slate-400">
          Centras Chat {info.version} · {platformLabel}
        </p>
      )}
    </section>
  );
};
