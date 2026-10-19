"use client";
/**
 * pdfme editörü (public/sablon-editor) — iframe.
 *
 * Mesajlar:
 *  editör → admin : btpos:ready | btpos:save {template, requestId?} | btpos:dirty {dirty}
 *  admin → editör : btpos:load {template, meta} | btpos:get-template {requestId}
 *                   btpos:undo | btpos:redo   (odak admin sayfasındayken Ctrl+Z / Ctrl+Y)
 *
 * Üst çubuktaki Kaydet, editördeki GÜNCEL tasarımı `requestTemplate()` ile ister.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { PdfmeTemplate, TemplateType } from "@/types/templates";

type Props = {
  template: PdfmeTemplate | null;
  name: string;
  templateType: TemplateType;
  /** Editörün kendi Kaydet düğmesine basıldığında */
  onSave: (t: PdfmeTemplate) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onHistory?: (history: { undo: number; redo: number }) => void;
};

export type PdfmeEditorHandle = {
  /** Editördeki güncel şablonu ister. Editör cevap vermezse null. */
  requestTemplate: (timeoutMs?: number) => Promise<PdfmeTemplate | null>;
  undo: () => void;
  redo: () => void;
};

export const PdfmeEditorFrame = forwardRef<PdfmeEditorHandle, Props>(function PdfmeEditorFrame(
  { template, name, templateType, onSave, onDirtyChange, onHistory },
  handleRef,
) {
  const ref = useRef<HTMLIFrameElement>(null);
  const loaded = useRef(false);
  const pending = useRef(new Map<string, (t: PdfmeTemplate | null) => void>());

  useImperativeHandle(handleRef, () => ({
    requestTemplate(timeoutMs = 3000) {
      const win = ref.current?.contentWindow;
      if (!win || !loaded.current) return Promise.resolve(null);
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return new Promise<PdfmeTemplate | null>((resolve) => {
        const timer = setTimeout(() => {
          pending.current.delete(requestId);
          resolve(null);
        }, timeoutMs);
        pending.current.set(requestId, (t) => {
          clearTimeout(timer);
          resolve(t);
        });
        win.postMessage({ type: "btpos:get-template", requestId }, window.location.origin);
      });
    },
    undo() {
      ref.current?.contentWindow?.postMessage({ type: "btpos:undo" }, window.location.origin);
    },
    redo() {
      ref.current?.contentWindow?.postMessage({ type: "btpos:redo" }, window.location.origin);
    },
  }));

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== ref.current?.contentWindow) return;
      const m = e.data as { type?: string; template?: PdfmeTemplate; dirty?: boolean; requestId?: string };

      if (m.type === "btpos:ready" && !loaded.current) {
        loaded.current = true;
        ref.current?.contentWindow?.postMessage(
          { type: "btpos:load", template, meta: { name, templateType } },
          window.location.origin,
        );
        return;
      }

      if (m.type === "btpos:save" && m.template) {
        // Üst çubuğun isteğine cevapsa → bekleyen isteği çöz, kaydı üst çubuk yapar
        if (m.requestId && pending.current.has(m.requestId)) {
          pending.current.get(m.requestId)!(m.template);
          pending.current.delete(m.requestId);
          return;
        }
        onSave(m.template);
        return;
      }

      if (m.type === "btpos:dirty") onDirtyChange?.(!!m.dirty);
      if (m.type === "btpos:history") {
        const hist = e.data as { undo?: number; redo?: number };
        onHistory?.({ undo: hist.undo ?? 0, redo: hist.redo ?? 0 });
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [template, name, templateType, onSave, onDirtyChange, onHistory]);

  // Odak admin sayfasındayken (üst çubuk vb.) Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z → editöre ilet.
  // Odak iframe içindeyse tuşlar zaten editöre gider.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      const k = e.key.toLowerCase();
      const type = k === "z" && !e.shiftKey ? "btpos:undo" : k === "y" || (k === "z" && e.shiftKey) ? "btpos:redo" : null;
      if (!type) return;
      e.preventDefault();
      ref.current?.contentWindow?.postMessage({ type }, window.location.origin);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <iframe
      ref={ref}
      src="/sablon-editor/index.html?v=20261019-barcode"
      style={{ width: "100%", height: "100%", border: 0, background: "#f5f5f5" }}
      title="Şablon editörü"
    />
  );
});
