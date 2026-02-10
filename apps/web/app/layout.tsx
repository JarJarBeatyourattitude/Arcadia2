import "./globals.css";
import type { ReactNode } from "react";
import PartySidebar from "../components/PartySidebar";

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
            <a className="logo" href="/">Game Factory</a>
            <nav className="top-nav">
              <a href="/">Create</a>
              <a href="/help">Help</a>
              <a href="/account">Account</a>
            </nav>
          </header>
          <PartySidebar />
          {children}
          <footer className="footer">Built for rapid game magic. No Docker required.</footer>
        </div>
      </body>
    </html>
  );
}
