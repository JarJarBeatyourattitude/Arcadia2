"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Game = {
  id: number;
  title: string;
  description: string;
  prompt: string;
  code: string;
  created_at: string;
};

export default function PlayPage({ params }: { params: { id: string } }) {
  const [game, setGame] = useState<Game | null>(null);
  const [perfMode, setPerfMode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewKey = useMemo(() => (game ? game.title + game.code.length + String(perfMode) : "empty"), [game, perfMode]);

  useEffect(() => {
    async function load() {
      const res = await fetch(`${API}/games/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setGame(data);
      }
    }
    load();
  }, [params.id]);

  function withHelper(code: string) {
    const helper = `
<script>
(() => {
  const perf = ${perfMode ? "true" : "false"};
  window.__GF_PERF_MODE = perf;
  if (perf) {
    const dpr = window.devicePixelRatio || 1;
    try {
      Object.defineProperty(window, 'devicePixelRatio', { get: () => Math.min(1, dpr), configurable: true });
    } catch {}
  }
})();
</script>
`;
    if (code.includes("</head>")) return code.replace("</head>", `${helper}</head>`);
    return helper + code;
  }

  function focusPreview() {
    iframeRef.current?.contentWindow?.focus();
  }

  return (
    <main className="section">
      {game ? (
        <div style={{ display: "grid", gap: 12 }}>
          <h1>{game.title}</h1>
          <p style={{ color: "#98a0b5" }}>{game.description}</p>
          <div className="preview" style={{ height: "80vh" }} ref={previewRef} onClick={focusPreview}>
            <iframe ref={iframeRef} key={previewKey} srcDoc={withHelper(game.code)} sandbox="allow-scripts" />
          </div>
          <div className="button-row">
            <button className="secondary" onClick={() => setPerfMode((v) => !v)}>
              {perfMode ? "Perf Mode: On" : "Perf Mode: Off"}
            </button>
          </div>
        </div>
      ) : (
        <p>Loading...</p>
      )}
    </main>
  );
}
