"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function LobbyPage() {
  const [roomId, setRoomId] = useState("lobby");
  const [nickname, setNickname] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [rooms, setRooms] = useState<{ room_id: string; count: number; max_players: number | null }[]>([]);
  const [roomPlayers, setRoomPlayers] = useState<{ id: string; name: string; ready: boolean }[]>([]);
  const [roomLog, setRoomLog] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const roomSocketRef = useRef<WebSocket | null>(null);
  const clientId = useMemo(() => {
    if (typeof window === "undefined") return "gf-client";
    const key = "gf_client_id";
    let id = "";
    try {
      id = window.localStorage.getItem(key) || "";
    } catch {}
    if (!id) {
      id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      try {
        window.localStorage.setItem(key, id);
      } catch {}
    }
    return id;
  }, []);

  useEffect(() => {
    refreshRooms().catch(() => {});
    return () => roomSocketRef.current?.close();
  }, []);

  async function refreshRooms() {
    const res = await fetch(`${API}/lobby/rooms`);
    if (!res.ok) return;
    const data = await res.json();
    setRooms(data);
  }

  function connectRoom(id: string) {
    if (roomSocketRef.current) {
      roomSocketRef.current.close();
    }
    const wsUrl = API.replace("http://", "ws://").replace("https://", "wss://");
    const params = new URLSearchParams();
    if (clientId) params.set("client_id", clientId);
    if (nickname.trim()) params.set("name", nickname.trim());
    if (maxPlayers) params.set("max_players", String(maxPlayers));
    const ws = new WebSocket(`${wsUrl}/ws/${encodeURIComponent(id)}${params.toString() ? `?${params.toString()}` : ""}`);
    roomSocketRef.current = ws;
    ws.onopen = () => {
      if (nickname.trim()) {
        ws.send(JSON.stringify({ type: "set_name", name: nickname.trim() }));
      }
      setRoomLog((prev) => [`Joined room ${id}`, ...prev].slice(0, 20));
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "room_state") {
          setRoomPlayers(msg.players || []);
          return;
        }
        if (msg.type === "chat") {
          setRoomLog((prev) => [`${msg.name || "Player"}: ${msg.text}`, ...prev].slice(0, 20));
          return;
        }
      } catch {
        setRoomLog((prev) => [String(evt.data), ...prev].slice(0, 20));
      }
    };
    ws.onclose = () => {
      setRoomPlayers([]);
    };
  }

  function sendChat() {
    const ws = roomSocketRef.current;
    if (!ws || ws.readyState !== 1 || !chatInput.trim()) return;
    ws.send(JSON.stringify({ type: "chat", name: nickname || "Player", text: chatInput.trim() }));
    setChatInput("");
  }

  function toggleReady(ready: boolean) {
    const ws = roomSocketRef.current;
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "ready", ready }));
  }
  
  function leaveRoom() {
    if (roomSocketRef.current) {
      roomSocketRef.current.close();
      roomSocketRef.current = null;
    }
    setRoomPlayers([]);
    setRoomLog((prev) => ["Left room", ...prev].slice(0, 20));
  }

  return (
    <main className="section">
      <h1>Multiplayer Lobby</h1>
      <p style={{ color: "#98a0b5" }}>
        Create or join a room. Games can use the room to sync state with other players.
      </p>
      <div className="cards">
        <div className="card">
          <div className="card-title">Join / Create Room</div>
          <div className="card-meta">Room Id</div>
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="room-id"
            style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#0e1322", color: "#e8eefc" }}
          />
          <div className="card-meta">Nickname</div>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="player name"
            style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#0e1322", color: "#e8eefc" }}
          />
          <div className="card-meta">Max Players</div>
          <input
            value={String(maxPlayers)}
            onChange={(e) => setMaxPlayers(Math.max(2, parseInt(e.target.value || "2", 10) || 2))}
            placeholder="2"
            style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#0e1322", color: "#e8eefc" }}
          />
          <div className="button-row" style={{ marginTop: 8 }}>
            <button onClick={() => connectRoom(roomId)} disabled={roomPlayers.length >= maxPlayers}>
              {roomPlayers.length >= maxPlayers ? "Room Full" : "Join"}
            </button>
            <button className="secondary" onClick={leaveRoom}>Leave</button>
            <button className="secondary" onClick={() => toggleReady(true)}>Ready</button>
            <button className="secondary" onClick={() => toggleReady(false)}>Unready</button>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Active Rooms</div>
          <div className="card-meta">Click to join</div>
          <div style={{ display: "grid", gap: 8 }}>
            {rooms.length === 0 && <div className="card-meta">No rooms yet.</div>}
            {rooms.map((room) => {
              const cap = room.max_players ?? maxPlayers;
              const full = room.count >= cap;
              return (
              <button
                key={room.room_id}
                className="secondary"
                onClick={() => {
                  setRoomId(room.room_id);
                  connectRoom(room.room_id);
                }}
                disabled={full}
              >
                {room.room_id} ({room.count}/{cap}) {full ? "• Full" : ""}
              </button>
            )})}
          </div>
          <button className="secondary" style={{ marginTop: 10 }} onClick={refreshRooms}>
            Refresh
          </button>
        </div>
        <div className="card">
          <div className="card-title">Players</div>
          <div className="card-meta">
            {roomPlayers.length === 0 ? "No one connected." : "Room roster"}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {roomPlayers.map((p) => (
              <div key={p.id} className="card-meta">
                {p.name} {p.ready ? "✅" : "⏳"}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="chat..."
              style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#0e1322", color: "#e8eefc" }}
            />
            <button onClick={sendChat}>Send</button>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Room Log</div>
          <div className="card-meta">Latest events</div>
          <div style={{ display: "grid", gap: 6 }}>
            {roomLog.length === 0 && <div className="card-meta">No activity yet.</div>}
            {roomLog.map((line, idx) => (
              <div key={idx} className="card-meta">{line}</div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
