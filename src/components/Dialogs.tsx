'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Return an error message to keep the dialog open. */
  validate?: (value: string) => string | null;
}

type Pending = { id: number } & (
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }
);

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

/** In-app replacements for window.confirm / window.prompt (styled, and work where native dialogs are blocked). */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const seq = useRef(0);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ id: ++seq.current, kind: 'confirm', opts, resolve })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => setPending({ id: ++seq.current, kind: 'prompt', opts, resolve })),
    [],
  );

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {pending && <DialogView key={pending.id} pending={pending} onDone={() => setPending(null)} />}
    </DialogContext.Provider>
  );
}

function DialogView({ pending, onDone }: { pending: Pending; onDone: () => void }) {
  const [value, setValue] = useState(pending.kind === 'prompt' ? (pending.opts.defaultValue ?? '') : '');
  const [error, setError] = useState<string | null>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const cancel = useCallback(() => {
    if (pending.kind === 'confirm') pending.resolve(false);
    else pending.resolve(null);
    onDone();
  }, [onDone, pending]);

  function accept() {
    if (pending.kind === 'confirm') {
      pending.resolve(true);
    } else {
      const err = pending.opts.validate?.(value) ?? null;
      if (err) {
        setError(err);
        return;
      }
      pending.resolve(value);
    }
    onDone();
  }

  useEffect(() => {
    if (pending.kind === 'prompt') {
      input.current?.focus();
      input.current?.select();
    } else primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [cancel, pending.kind]);

  const o = pending.opts;
  return (
    <div className="modal-backdrop" style={{ zIndex: 150 }} onMouseDown={cancel}>
      <form
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          accept();
        }}
      >
        <h2 id="dlg-title" style={{ fontSize: 18, fontWeight: 700 }}>
          {o.title}
        </h2>
        {pending.kind === 'confirm' && pending.opts.message && (
          <div className="muted" style={{ fontSize: 14, whiteSpace: 'pre-line' }}>
            {pending.opts.message}
          </div>
        )}
        {pending.kind === 'prompt' && (
          <label className="field">
            {pending.opts.label}
            <input
              ref={input}
              className="input"
              value={value}
              placeholder={pending.opts.placeholder}
              aria-invalid={!!error}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
            />
            {error && <span className="field-error">{error}</span>}
          </label>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={cancel}>
            {pending.kind === 'confirm' ? (pending.opts.cancelLabel ?? 'ยกเลิก') : 'ยกเลิก'}
          </button>
          <button
            ref={primary}
            type="submit"
            className={`btn ${pending.kind === 'confirm' && pending.opts.danger ? 'btn-danger' : 'btn-primary'}`}
          >
            {o.confirmLabel ?? 'ตกลง'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>');
  return ctx;
}
