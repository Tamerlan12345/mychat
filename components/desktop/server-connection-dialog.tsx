'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { connectionManager } from '@/lib/desktop/connection-manager';
import { CheckCircle2, AlertCircle, RefreshCw, Server, RotateCcw, Save } from 'lucide-react';

export interface ServerConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const ServerConnectionDialog: React.FC<ServerConnectionDialogProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [serverUrl, setServerUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    setTestResult(null);
    setSaveSuccess(false);

    connectionManager
      .getActiveConfig()
      .then((cfg) => {
        if (!active) return;
        setServerUrl(cfg.serverUrl);
        setAnonKey(cfg.anonKey);
        setIsCustom(cfg.isCustom);
      })
      .catch((err) => {
        if (!active) return;
        setErrorMessage(err.message || 'Не удалось прочитать параметры соединения.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleTest = async () => {
    setTestResult(null);
    setErrorMessage(null);
    setIsTesting(true);

    try {
      const res = await connectionManager.testConnection(serverUrl, anonKey);
      if (res.ok) {
        setTestResult({
          ok: true,
          message: `Подключение успешно установлено${res.status ? ` (HTTP ${res.status})` : ''}.`,
        });
      } else {
        setTestResult({
          ok: false,
          message: res.error || 'Не удалось подключиться к серверу.',
        });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err.message || 'Ошибка тестирования соединения.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setErrorMessage(null);
    setSaveSuccess(false);
    setIsSaving(true);

    try {
      await connectionManager.saveConfig({ serverUrl, anonKey });
      setIsCustom(true);
      setSaveSuccess(true);
      onSaved?.();
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Не удалось сохранить конфигурацию.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setErrorMessage(null);
    setSaveSuccess(false);
    setTestResult(null);
    setIsSaving(true);

    try {
      await connectionManager.clearCustomConfig();
      const cfg = await connectionManager.getActiveConfig();
      setServerUrl(cfg.serverUrl);
      setAnonKey(cfg.anonKey);
      setIsCustom(false);
      setSaveSuccess(true);
      onSaved?.();
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Не удалось сбросить конфигурацию.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Настройка подключения к серверу">
      <div className="space-y-5">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-600" />
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Конфигурация бэкенда
            </span>
          </div>
          {isCustom ? (
            <Badge variant="warning">Пользовательский сервер</Badge>
          ) : (
            <Badge variant="neutral">Стандартная конфигурация</Badge>
          )}
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {saveSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Параметры успешно обновлены и применены.</span>
          </div>
        )}

        {testResult && (
          <div
            className={`flex items-start gap-2 p-3 border rounded-lg text-xs ${
              testResult.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="space-y-3.5">
          <Input
            label="URL корпоративного сервера / Supabase API"
            placeholder="https://your-supabase-project.supabase.co"
            value={serverUrl}
            onChange={(e) => {
              setServerUrl(e.target.value);
              setSaveSuccess(false);
              setTestResult(null);
            }}
            disabled={isLoading || isSaving || isTesting}
          />

          <Input
            label="Публичный ключ (Anon Public API Key)"
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            type="password"
            value={anonKey}
            onChange={(e) => {
              setAnonKey(e.target.value);
              setSaveSuccess(false);
              setTestResult(null);
            }}
            disabled={isLoading || isSaving || isTesting}
          />
        </div>

        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isLoading || isSaving || isTesting || (!isCustom && !serverUrl && !anonKey)}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Сбросить к умолчанию
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleTest}
              disabled={isLoading || isSaving || isTesting || !serverUrl.trim()}
            >
              {isTesting ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Server className="w-3.5 h-3.5 mr-1.5" />
              )}
              {isTesting ? 'Проверка...' : 'Проверить подключение'}
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isLoading || isSaving || isTesting || !serverUrl.trim() || !anonKey.trim()}
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-1.5" />
              )}
              {isSaving ? 'Сохранение...' : 'Сохранить и применить'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
