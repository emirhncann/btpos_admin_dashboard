"use client";

import { useState } from "react";
import {
  newCustomElement,
  STATIC_TEXT_PRESETS,
  type TemplateCustomElement,
} from "@/lib/templateCustomElements";

interface Props {
  elements: TemplateCustomElement[];
  onChange: (elements: TemplateCustomElement[]) => void;
}

export function TemplateCustomElementsPanel({ elements, onChange }: Props) {
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");

  function addElement() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onChange([...elements, newCustomElement(label, trimmed)]);
    setLabel("");
    setText("");
  }

  function addPreset(preset: (typeof STATIC_TEXT_PRESETS)[number]) {
    onChange([
      ...elements,
      newCustomElement(preset.label, preset.text, preset.itemType ?? "text"),
    ]);
  }

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: "1px solid #E5E7EB",
        background: "#FAFAFA",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #E5E7EB",
          background: "white",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
          Özel Metin
        </div>
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
          Ekledikten sonra AnkaReport sol panelinde &quot;Sabit Metinler&quot;
          altında sürükleyip bırakın.
        </div>
      </div>

      <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
        <label style={{ fontSize: 11, color: "#6B7280", display: "block" }}>
          Başlık (panelde görünür)
        </label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="örn. Firma sloganı"
          style={{
            width: "100%",
            marginTop: 4,
            marginBottom: 8,
            padding: "6px 8px",
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid #E5E7EB",
            boxSizing: "border-box",
          }}
        />
        <label style={{ fontSize: 11, color: "#6B7280", display: "block" }}>
          Metin
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Fişte görünecek sabit metin..."
          rows={4}
          style={{
            width: "100%",
            marginTop: 4,
            padding: "6px 8px",
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid #E5E7EB",
            resize: "vertical",
            boxSizing: "border-box",
            fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          onClick={addElement}
          disabled={!text.trim()}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "8px 12px",
            borderRadius: 6,
            border: "none",
            background: text.trim() ? "#1565C0" : "#E5E7EB",
            color: text.trim() ? "white" : "#9CA3AF",
            fontSize: 12,
            fontWeight: 600,
            cursor: text.trim() ? "pointer" : "default",
          }}
        >
          Listeye Ekle
        </button>

        <div
          style={{
            marginTop: 16,
            fontSize: 11,
            fontWeight: 600,
            color: "#6B7280",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Hızlı ekle
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {STATIC_TEXT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => addPreset(p)}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                borderRadius: 999,
                border: "1px solid #E5E7EB",
                background: "white",
                cursor: "pointer",
                color: "#374151",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {elements.length > 0 && (
          <>
            <div
              style={{
                marginTop: 16,
                fontSize: 11,
                fontWeight: 600,
                color: "#6B7280",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Kayıtlı özel metinler ({elements.length})
            </div>
            <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
              {elements.map((el) => (
                <li
                  key={el.id}
                  style={{
                    marginBottom: 8,
                    padding: 8,
                    background: "white",
                    borderRadius: 6,
                    border: "1px solid #E5E7EB",
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#111827" }}>
                    {el.label}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      color: "#6B7280",
                      fontSize: 11,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {el.text}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(elements.filter((x) => x.id !== el.id))
                    }
                    style={{
                      marginTop: 6,
                      padding: 0,
                      border: "none",
                      background: "none",
                      color: "#DC2626",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Kaldır
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
