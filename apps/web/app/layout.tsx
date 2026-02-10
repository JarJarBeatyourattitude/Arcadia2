import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Game Factory",
  description: "Create, play, and share AI-generated games"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <div className="logo">Game Factory</div>
            <nav className="top-nav">
              <a href="/">Create</a>
              <a href="/lobby">Lobby</a>
              <a href="/toolkit">Toolkit</a>
            </nav>
          </header>
          {children}
          <footer className="footer">Built for rapid game magic. No Docker required.</footer>
        </div>
      </body>
    </html>
  );
}
