"use client";

import { useEffect, useRef, useState } from "react";

export interface AnkaDataSource {
  label: string;
  field?: string;
  type?: "text" | "image";
  children?: AnkaDataSource[];
}

type DesignerInstance = {
  destroy?: () => void;
  setDataSource?: (dataSource: AnkaDataSource[]) => void;
};

interface Props {
  dataSource: AnkaDataSource[];
  layout?: unknown;
  onSave: (layout: unknown) => void;
  height?: string | number;
}

export function AnkaReportDesigner({
  dataSource,
  layout,
  onSave,
  height = 700,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<DesignerInstance | null>(null);
  const dataSourceRef = useRef(dataSource);
  dataSourceRef.current = dataSource;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const layoutRef = useRef(layout);
  const onSaveRef = useRef(onSave);
  layoutRef.current = layout;
  onSaveRef.current = onSave;

  useEffect(() => {
    if ((window as unknown as { AnkaReport?: unknown }).AnkaReport) {
      setReady(true);
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/ankareport/ankareport.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "/ankareport/ankareport.js";
    script.onload = () => setReady(true);
    script.onerror = () =>
      setError(
        "AnkaReport yüklenemedi — public/ankareport klasörünü kontrol edin"
      );
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;

    const AR = (
      window as unknown as {
        AnkaReport?: {
          designer: (opts: unknown) => DesignerInstance;
        };
      }
    ).AnkaReport;

    if (!AR?.designer) {
      setError("AnkaReport.designer bulunamadı");
      return;
    }

    instanceRef.current?.destroy?.();
    containerRef.current.innerHTML = "";

    try {
      instanceRef.current = AR.designer({
        element: containerRef.current,
        dataSource: dataSourceRef.current,
        layout: layoutRef.current ?? undefined,
        onSaveButtonClick: (l: unknown) => {
          console.log(
            "[AnkaReportDesigner] Kaydet tıklandı, layout:",
            JSON.stringify(l).slice(0, 300)
          );
          onSaveRef.current(l);
        },
      });
    } catch (e) {
      setError("Designer başlatılamadı: " + String(e));
    }

    return () => {
      instanceRef.current?.destroy?.();
      instanceRef.current = null;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || !instanceRef.current?.setDataSource) return;
    instanceRef.current.setDataSource(dataSource);
  }, [ready, dataSource]);

  if (error) {
    return (
      <div
        style={{
          padding: 24,
          color: "#DC2626",
          fontSize: 13,
          background: "#FEF2F2",
          borderRadius: 8,
          border: "1px solid #FECACA",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>⚠️ {error}</div>
        <pre
          style={{
            background: "#F3F4F6",
            padding: 8,
            borderRadius: 4,
            fontSize: 11,
            color: "#6B7280",
            margin: 0,
            whiteSpace: "pre-wrap",
          }}
        >
          {`mkdir -p public/ankareport
cp node_modules/ankareport/dist/ankareport.js public/ankareport/
cp node_modules/ankareport/dist/ankareport.css public/ankareport/`}
        </pre>
      </div>
    );
  }

  if (!ready) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: typeof height === "number" ? height : 600,
          color: "#9CA3AF",
          fontSize: 13,
        }}
      >
        Editör yükleniyor...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height, minHeight: 400 }}
    />
  );
}
