'use client';

import { useState, useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onEnviar: (contenido: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onEnviar, disabled }: ChatInputProps) {
  const t = useTranslations('chat');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleEnviar = async () => {
    const trimmed = texto.trim();
    if (!trimmed || enviando) return;

    setEnviando(true);
    setTexto('');
    try {
      await onEnviar(trimmed);
    } finally {
      setEnviando(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleEnviar();
    }
  };

  return (
    <div className="flex items-end gap-2 p-2 border-t bg-background">
      <textarea
        ref={textareaRef}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('inputPlaceholder')}
        disabled={disabled || enviando}
        rows={1}
        maxLength={1000}
        className={cn(
          'flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm',
          'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:opacity-50 max-h-24 overflow-y-auto',
        )}
        style={{ minHeight: '38px' }}
      />
      <Button
        size="icon"
        onClick={handleEnviar}
        disabled={!texto.trim() || disabled || enviando}
        className="flex-shrink-0"
      >
        <SendHorizontal className="h-4 w-4" />
        <span className="sr-only">{t('enviar')}</span>
      </Button>
    </div>
  );
}
