"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type User = { id: number; email: string; username: string };

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadMe() {
    const res = await fetch(`${API}/auth/me`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setUser(data);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function register() {
    setError(null);
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, username, password })
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await loadMe();
  }

  async function login() {
    setError(null);
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await loadMe();
  }

  async function logout() {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
  }

  return (
    <main className="section">
      <h1>Account</h1>
      {user ? (
        <div className="card">
          <div className="card-title">Signed in</div>
          <div className="card-meta">{user.username} — {user.email}</div>
          <div className="button-row" style={{ marginTop: 8 }}>
            <button className="secondary" onClick={logout}>Log out</button>
          </div>
        </div>
      ) : (
        <div className="cards">
          <div className="card">
            <div className="card-title">Register</div>
            <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="button-row">
              <button onClick={register}>Create Account</button>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Login</div>
            <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="button-row">
              <button onClick={login}>Sign In</button>
            </div>
          </div>
        </div>
      )}
      {error && <p style={{ color: "#ff9b9b" }}>{error}</p>}
    </main>
  );
}
