import React, { useEffect, useRef, useState } from 'react';
import { useDialogStore } from '@/store/dialogStore';

export default function DialogHost() {
  const dialog = useDialogStore((s) => s.dialog);
  if (!dialog) return null;
  return <Dialog dialog={dialog} key={dialog.title + (dialog.description || '')} />;
}

function Dialog({ dialog }) {
  const { title, description, fields = [], actions = [], resolve } = dialog;

  const [values, setValues] = useState(() => {
    const initial = {};
    fields.forEach((f) => {
      initial[f.name] = f.defaultValue ?? '';
    });
    return initial;
  });

  const firstInputRef = useRef(null);

  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus();
      if (firstInputRef.current.select) firstInputRef.current.select();
    }
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        const cancel = actions.find((a) => a.cancel) || actions[0];
        resolve(cancel ? { action: cancel.value, values } : null);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const primary = actions.find((a) => a.primary);
        if (primary) {
          e.preventDefault();
          resolve({ action: primary.value, values });
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [values, actions, resolve]);

  function setField(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  return (
    <div
      data-backdrop="true"
      className="fixed inset-0 z-[1000] bg-[rgba(15,23,42,0.44)] flex items-center justify-center [animation:fade-in_120ms_ease]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const cancel = actions.find((a) => a.cancel) || actions[0];
          resolve(cancel ? { action: cancel.value, values } : null);
        }
      }}
    >
      <div className="bg-bg-surface rounded-[18px] shadow-[0_24px_56px_rgba(15,23,42,0.22)] border border-border-default min-w-[360px] max-w-[520px] p-[26px]">
        <h2
          className="text-[17px] font-[650] text-text-primary"
          style={{
            marginBottom: description ? 10 : 18,
          }}
        >
          {title}
        </h2>
        {description && (
          <p className="text-[15px] text-text-secondary mb-5 leading-[1.45]">{description}</p>
        )}

        {fields.map((field, idx) => (
          <div key={field.name} style={{ marginBottom: 12 }}>
            {field.label && (
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 4,
                }}
              >
                {field.label}
              </label>
            )}
            {field.type === 'select' ? (
              <select
                ref={idx === 0 ? firstInputRef : null}
                value={values[field.name]}
                onChange={(e) => setField(field.name, e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                }}
              >
                {(field.options || []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                ref={idx === 0 ? firstInputRef : null}
                type={field.type || 'text'}
                value={values[field.name]}
                placeholder={field.placeholder || ''}
                onChange={(e) => setField(field.name, e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                }}
              />
            )}
          </div>
        ))}

        <div
          className="flex gap-3 mt-2"
          style={{
            justifyContent: actions.length <= 2 ? 'center' : 'flex-end',
          }}
        >
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => resolve({ action: action.value, values })}
              className="min-w-[132px] h-12 py-0 px-[18px] text-[15px] font-semibold rounded-[14px] cursor-pointer border"
              style={buttonStyle(action.variant, action.primary)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function buttonStyle(variant, primary) {
  if (variant === 'danger') {
    return {
      background: 'rgba(220, 38, 38, 0.08)',
      borderColor: 'rgba(220, 38, 38, 0.18)',
      color: 'var(--danger)',
    };
  }
  if (primary || variant === 'primary') {
    return {
      background: 'var(--accent)',
      borderColor: 'var(--accent)',
      color: 'var(--text-on-accent)',
      boxShadow: '0 10px 24px rgba(74, 124, 255, 0.18)',
    };
  }
  return {
    background: 'var(--bg-app)',
    borderColor: 'var(--border-default)',
    color: 'var(--text-primary)',
  };
}
