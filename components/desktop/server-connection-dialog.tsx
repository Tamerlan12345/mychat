'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { connectionManager } from '@/lib/desktop/connection-manager';
import { CheckCircle2, AlertCircle, RefreshCw, Server, RotateCcw, Save, ChevronDown } from 'lucide-react';

export interface ServerConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * One field for employees — the company server address. Direct Supabase access (URL + anon key)
 * stays available behind "advanced" for installations without a gateway.
 */
export const ServerConnectionDialog: React.FC<ServerConnectionDialogProps> = ({ isOpen, onClose, onSaved }) => {
  const [serverUrl, setServerUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [mode, setMode] = useState<'gateway' | 'direct' | 'none'>('none');
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    setTestResult(null);
    connectionManager
      .getActiveConfig()
      .then(cfg => {
        if (!active) return;
        setServerUrl(cfg.serverUrl);
        setAnonKey(cfg.anonKey);
        setIsCustom(cfg.isCustom);
        setMode(cfg.mode ?? (cfg.anonKey ? 'direct' : cfg.serverUrl ? 'gateway' : 'none'));
        setAdvanced(Boolean(cfg.anonKey));
      })
      .catch(err => active && setErrorMessage(err.message || 'Не удалось прочитать параметры соединения.'))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [isOpen]);

  const busy = isLoading || isSaving || isTesting;

  const handleTest = async () => {
    setTestResult(null);
    setErrorMessage(null);
    setIsTesting(true);
    try {
      const res = await connectionManager.testConnection(serverUrl, advanced ? anonKey : undefined);
      setTestResult(
        res.ok
          ? { ok: true, message: `Сервер отвечает${res.status ? ` (HTTP ${res.status})` : ''}.` }
          : { ok: false, message: res.error || 'Сервер не отвечает.' }
      );
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'Ошибка проверки соединения.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setErrorMessage(null);
    setIsSaving(true);
    try {
      await connectionManager.saveConfig({ serverUrl, anonKey: advanced ? anonKey : undefined });
      onSaved?.();
      if (typeof window !== 'undefined') setTimeout(() => window.location.reload(), 300);
    } catch (err: any) {
      setErrorMessage(err.message || 'Не удалось сохранить конфигурацию.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setErrorMessage(null);
    setTestResult(null);
    setIsSaving(true);
    try {
      await connectionManager.clearCustomConfig();
      onSaved?.();
      if (typeof window !== 'undefined') setTimeout(() => window.location.reload(), 300);
    } catch (err: any) {
      setErrorMessage(err.message || 'Не удалось сбросить конфигурацию.');
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = serverUrl.trim().length > 0 && (!advanced || anonKey.trim().length > 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Подключение к серверу компании">
      <div className="space-y-5">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Server className="h-4 w-4 text-blue-600" />
            <span>Приложение будет работать с данными этого сервера.</span>
          </div>
          {isCustom ? <Badge variant="warning">Задано вручную</Badge> : <Badge variant="neutral">{mode === 'none' ? 'Демо-режим' : 'По умолчанию'}</Badge>}
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {testResult && (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
              testResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
        )}

        <Input
          label="Адрес сервера компании"
          placeholder="https://chat.company.kz"
          value={serverUrl}
          onChange={e => {
            setServerUrl(e.target.value);
            setTestResult(null);
          }}
          disabled={busy}
        />

        <button
          type="button"
          onClick={() => setAdvanced(v => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-slate-900"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advanced ? 'rotate-180' : ''}`} />
          Расширенные параметры
        </button>
        {advanced && (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">
              Прямое подключение к Supabase без шлюза: укажите URL проекта выше и публичный ключ здесь. Оставьте пустым, если
              адрес выше — это шлюз компании.
            </p>
            <Input
              label="Публичный ключ (anon key)"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              type="password"
              value={anonKey}
              onChange={e => {
                setAnonKey(e.target.value);
                setTestResult(null);
              }}
              disabled={busy}
            />
          </div>
        )}

        <div className="flex flex-col items-stretch justify-between gap-2.5 border-t border-gray-100 pt-3 sm:flex-row sm:items-center">
          <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={busy || !isCustom}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Сбросить
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleTest} disabled={busy || !serverUrl.trim()}>
              {isTesting ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Server className="mr-1.5 h-3.5 w-3.5" />}
              {isTesting ? 'Проверка…' : 'Проверить'}
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleSave} disabled={busy || !canSave}>
              {isSaving ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              {isSaving ? 'Сохранение…' : 'Сохранить и подключиться'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
