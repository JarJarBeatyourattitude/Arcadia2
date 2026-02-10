"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Party = {
  id: string;
  name: string;
  is_private: boolean;
  join_code?: string | null;
  max_players?: number | null;
  member_count?: number | null;
  created_at?: string | null;
};

type PartyMember = {
  user_id: number;
  username: string;
  joined_at?: string | null;
};

type PartyDetail = {
  party: Party;
  members: PartyMember[];
};

type Game = {
  id: number;
  title: string;
  description: string;
  multiplayer?: boolean;
  max_players?: number | null;
};

export default function PartySidebar() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<any | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [online, setOnline] = useState<{ id: string; name: string }[]>([]);
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [games, setGames] = useState<Game[]>([]);
  const [createName, setCreateName] = useState("");
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createMax, setCreateMax] = useState(2);
  const [joinPartyId, setJoinPartyId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [launching, setLaunching] = useState(false);
  const [partyError, setPartyError] = useState<string | null>(null);

  const clientId = useMemo(() => {
    if (typeof window === "undefined") return "gf-client";
    const key = "gf_client_id";
    let id = "";
    try { id = window.localStorage.getItem(key) || ""; } catch {}
    if (!id) {
      id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      try { window.localStorage.setItem(key, id); } catch {}
    }
    return id;
  }, []);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("gf_party_id") : null;
    if (saved) setPartyId(saved);
    loadMe();
    loadParties();
  }, []);

  useEffect(() => {
    if (!partyId) return;
    if (typeof window !== "undefined") window.localStorage.setItem("gf_party_id", partyId);
    loadParty(partyId);
    loadVotes(partyId);
    connectPartyChat(partyId);
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [partyId]);

  useEffect(() => {
    if (!party) return;
    const size = members.length || 1;
    loadGames(size);
  }, [party, members]);

  async function loadMe() {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: "include" });
      const data = await res.json();
      setMe(data);
    } catch {}
  }

  async function loadParties() {
    const res = await fetch(`${API}/parties`);
    if (!res.ok) return;
    setParties(await res.json());
  }

  async function loadParty(id: string) {
    try {
      const res = await fetch(`${API}/parties/${id}`, { credentials: "include" });
      if (!res.ok) {
        setPartyError(`Failed to load party (${res.status})`);
        return;
      }
      const detail: PartyDetail = await res.json();
      setParty(detail.party);
      setMembers(detail.members || []);
      setPartyError(null);
    } catch (err: any) {
      setPartyError(err?.message || "Failed to load party");
    }
  }

  async function loadVotes(id: string) {
    const res = await fetch(`${API}/parties/${id}/votes`);
    if (!res.ok) return;
    const rows: { game_id: number; votes: number }[] = await res.json();
    const map: Record<number, number> = {};
    rows.forEach((r) => (map[r.game_id] = r.votes));
    setVotes(map);
  }

  async function loadGames(minPlayers: number) {
    const params = new URLSearchParams();
    params.set("multiplayer", "true");
    params.set("min_players", String(minPlayers));
    const res = await fetch(`${API}/games?${params.toString()}`);
    if (!res.ok) return;
    const data: Game[] = await res.json();
    setGames(data);
  }

  async function createParty() {
    if (!me) {
      alert("Log in to create a party.");
      return;
    }
    if (!createName.trim()) return;
    const res = await fetch(`${API}/parties`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: createName.trim(), is_private: createPrivate, max_players: createMax })
    });
    if (!res.ok) return;
    const data: Party = await res.json();
    setPartyId(data.id);
    setCreateName("");
    setJoinCode("");
    loadParties();
  }

  async function joinParty(id: string, code?: string) {
    if (!me) {
      alert("Log in to join a party.");
      return;
    }
    const res = await fetch(`${API}/parties/${id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code: code || null })
    });
    if (!res.ok) return;
    setPartyId(id);
    loadParties();
  }

  async function leaveParty() {
    if (!partyId) return;
    await fetch(`${API}/parties/${partyId}/leave`, { method: "POST", credentials: "include" });
    setPartyId(null);
    setParty(null);
    setMembers([]);
    setOnline([]);
    setChatLog([]);
    setVotes({});
    wsRef.current?.close();
    wsRef.current = null;
  }

  function connectPartyChat(id: string) {
    wsRef.current?.close();
    const wsUrl = API.replace("http://", "ws://").replace("https://", "wss://");
    const params = new URLSearchParams();
    params.set("client_id", clientId);
    if (me?.username) params.set("name", me.username);
    const ws = new WebSocket(`${wsUrl}/ws/party-${encodeURIComponent(id)}?${params.toString()}`);
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "room_state") {
          const list = (msg.players || []).map((p: any) => ({ id: p.id, name: p.name || "Player" }));
          setOnline(list);
          return;
        }
        if (msg.type === "chat") {
          setChatLog((prev) => [`${msg.name || "Player"}: ${msg.text}`, ...prev].slice(0, 40));
          return;
        }
        if (msg.type === "launch" && msg.game_id) {
          const gameId = msg.game_id;
          window.location.href = `/play/${gameId}`;
          return;
        }
      } catch {}
    };
  }

  function sendChat() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1 || !chatInput.trim()) return;
    ws.send(JSON.stringify({ type: "chat", name: me?.username || "Player", text: chatInput.trim() }));
    setChatInput("");
  }

  async function vote(gameId: number) {
    if (!partyId) return;
    const res = await fetch(`${API}/parties/${partyId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ game_id: gameId })
    });
    if (res.ok) loadVotes(partyId);
  }

  const partySize = members.length || 0;
  const partyCap = party?.max_players ?? null;
  const topGameId = Object.entries(votes)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => Number(id))[0];
  const topGame = games.find((g) => g.id === topGameId);

  function launchTopGame() {
    if (!partyId || !topGameId) return;
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      setLaunching(true);
      ws.send(JSON.stringify({ type: "launch", game_id: topGameId }));
      setTimeout(() => setLaunching(false), 800);
    } else {
      window.location.href = `/play/${topGameId}`;
    }
  }

  return (
    <div className={`party-sidebar ${open ? "open" : ""}`}>
      <button className="party-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "Close Party" : "Party"}
      </button>
      {open && (
        <div className="party-panel">
          <div className="party-title">Party</div>
          {partyError && <div className="party-meta" style={{ color: "#ff9b9b" }}>{partyError}</div>}
          {!party && (
            <div className="party-section">
              <div className="party-label">Create Party</div>
              <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Party name" />
              <div className="party-row">
                <label><input type="checkbox" checked={createPrivate} onChange={(e) => setCreatePrivate(e.target.checked)} /> Private</label>
                <input
                  value={String(createMax)}
                  onChange={(e) => setCreateMax(Math.max(2, parseInt(e.target.value || "2", 10) || 2))}
                  style={{ width: 60 }}
                />
              </div>
              <button onClick={createParty}>Create</button>
              <div className="party-label" style={{ marginTop: 10 }}>Join Private</div>
              <input value={joinPartyId} onChange={(e) => setJoinPartyId(e.target.value)} placeholder="Party ID" />
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Join code" />
              <button className="secondary" onClick={() => joinParty(joinPartyId.trim(), joinCode)} disabled={!joinPartyId.trim() || !joinCode.trim()}>
                Join Private
              </button>
            </div>
          )}
          {party && (
            <div className="party-section">
              <div className="party-label">Current Party</div>
              <div className="party-pill">{party.name} ({partySize}/{partyCap ?? "?"}) {party.is_private ? "• Private" : "• Public"}</div>
              <div className="party-meta">Party ID: {party.id}</div>
              {party.is_private && party.join_code && <div className="party-meta">Join code: {party.join_code}</div>}
              <div className="party-row">
                <button className="secondary" onClick={leaveParty}>Leave</button>
                <button className="secondary" onClick={() => loadParty(party.id)}>Refresh</button>
              </div>
            </div>
          )}

          <div className="party-section">
            <div className="party-label">Public Parties</div>
            <div className="party-list">
              {parties.length === 0 && <div className="party-meta">No public parties yet.</div>}
              {parties.map((p) => {
                const cap = p.max_players || 2;
                const count = p.member_count || 0;
                const full = count >= cap;
                return (
                  <button key={p.id} className="secondary" onClick={() => joinParty(p.id)} disabled={full}>
                    {p.name} ({count}/{cap}) {full ? "• Full" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {party && (
            <>
              <div className="party-section">
                <div className="party-label">Members</div>
                <div className="party-list">
                  {members.map((m) => (
                    <div key={m.user_id} className="party-meta">{m.username}</div>
                  ))}
                </div>
                {online.length > 0 && (
                  <div className="party-meta">Online: {online.map((p) => p.name).join(", ")}</div>
                )}
              </div>
              <div className="party-section">
                <div className="party-label">Party Chat</div>
                <div className="party-chat">
                  {chatLog.length === 0 && <div className="party-meta">No messages yet.</div>}
                  {chatLog.map((line, idx) => (
                    <div key={idx} className="party-meta">{line}</div>
                  ))}
                </div>
                <div className="party-row">
                  <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="message" />
                  <button onClick={sendChat}>Send</button>
                </div>
              </div>
              <div className="party-section">
                <div className="party-label">Vote Game</div>
                <div className="party-meta">Showing multiplayer games that fit {partySize || 2} players.</div>
                <div className="party-list">
                  {games.length === 0 && <div className="party-meta">No eligible games found.</div>}
                  {games.map((g) => (
                    <div key={g.id} className="party-game">
                      <div>
                        <div className="party-meta" style={{ fontWeight: 700 }}>{g.title}</div>
                        <div className="party-meta">Max: {g.max_players || "?"}</div>
                      </div>
                      <div className="party-row">
                        <button className="secondary" onClick={() => vote(g.id)}>Vote ({votes[g.id] || 0})</button>
                        <a className="secondary" href={`/games/${g.id}`}>Open</a>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="party-row">
                  <button className="secondary" onClick={launchTopGame} disabled={!topGameId || launching}>
                    {topGameId ? `Launch Top: ${topGame?.title || topGameId}` : "Launch Top"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
