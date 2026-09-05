'use client';

import React, { useState, useEffect } from 'react';
import { Palette, CheckCircle2, Sparkles } from 'lucide-react';
import { BrandingConfig } from '@/types';
import { BrandingService } from '@/services/branding-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const BrandingForm: React.FC = () => {
  const [config, setConfig] = useState<BrandingConfig | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    BrandingService.getBranding().then(setConfig);
  }, []);

  if (!config) return <div className="text-xs text-gray-400">Загрузка брендинга...</div>;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    const updated = await BrandingService.updateBranding(config);
    setConfig(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <form onSubmit={handleSave} className="max-w-2xl bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary flex items-center justify-center text-white">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Брендинг компании</h2>
            <p className="text-xs text-gray-500">
              Название, логотип и цвета применяются сразу, без перезапуска приложения
            </p>
          </div>
        </div>

        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            Применено!
          </span>
        )}
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Название компании"
            value={config.company_name}
            onChange={e => setConfig({ ...config, company_name: e.target.value })}
          />
          <Input
            label="Заголовок приложения"
            value={config.app_title}
            onChange={e => setConfig({ ...config, app_title: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="URL логотипа (основной)"
            placeholder="https://example.com/logo.png"
            value={config.logo_url}
            onChange={e => setConfig({ ...config, logo_url: e.target.value })}
          />
          <Input
            label="URL Favicon"
            placeholder="https://example.com/favicon.ico"
            value={config.favicon_url}
            onChange={e => setConfig({ ...config, favicon_url: e.target.value })}
          />
        </div>

        {/* Color Palette Controls */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Цветовая палитра интерфейса
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Основной цвет (Primary)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.primary_color}
                  onChange={e => setConfig({ ...config, primary_color: e.target.value })}
                  className="w-8 h-8 rounded border border-gray-300 bg-transparent cursor-pointer"
                />
                <span className="text-xs font-mono text-gray-700">{config.primary_color}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Вторичный цвет (Secondary)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.secondary_color}
                  onChange={e => setConfig({ ...config, secondary_color: e.target.value })}
                  className="w-8 h-8 rounded border border-gray-300 bg-transparent cursor-pointer"
                />
                <span className="text-xs font-mono text-gray-700">{config.secondary_color}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Фон приложения (Background)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.background_color}
                  onChange={e => setConfig({ ...config, background_color: e.target.value })}
                  className="w-8 h-8 rounded border border-gray-300 bg-transparent cursor-pointer"
                />
                <span className="text-xs font-mono text-gray-700">{config.background_color}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview Box */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Предпросмотр кнопки брендинга
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              style={{ backgroundColor: config.primary_color }}
              className="px-4 py-2 text-slate-900 text-xs font-bold rounded-lg shadow-lg transition-transform active:scale-95"
            >
              Кнопка {config.company_name}
            </button>
            <span className="text-xs text-gray-500">
              Все элементы UI мгновенно перекрашиваются при сохранении.
            </span>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200 flex justify-end">
        <Button type="submit" variant="primary">
          Сохранить и применить брендинг
        </Button>
      </div>
    </form>
  );
};
