export default function HelpPage() {
  return (
    <main className="section">
      <h1>Help & Toolkit</h1>
      <p style={{ color: "#98a0b5" }}>
        Quick reference for the built-in utilities and how to get unstuck.
      </p>

      <div className="cards">
        <div className="card">
          <div className="card-title">Common Fixes</div>
          <div className="card-meta">If a game shows a blank screen, check Preview Diagnostics for errors.</div>
          <div className="card-meta">Click the preview to focus controls (keyboard input).</div>
          <div className="card-meta">Use Perf Mode if fullscreen feels slow.</div>
        </div>
        <div className="card">
          <div className="card-title">How It Works</div>
          <div className="card-meta">Games are generated as single-file HTML with inline JS/CSS.</div>
          <div className="card-meta">AI edits preserve the current game and apply your instruction.</div>
          <div className="card-meta">Drafts are saved locally until you log in and save.</div>
        </div>
        <div className="card">
          <div className="card-title">Accounts & Sharing</div>
          <div className="card-meta">You must be logged in to save games.</div>
          <div className="card-meta">Use the share link on a game page to send it to others.</div>
          <div className="card-meta">Community games are public; your games show in “My Games”.</div>
        </div>
        <div className="card">
          <div className="card-title">Quality Tips</div>
          <div className="card-meta">Be specific: controls, goals, win/lose conditions.</div>
          <div className="card-meta">Ask for AI-powered NPCs or multiplayer if you want dynamic play.</div>
          <div className="card-meta">Iterate using “Edit Preview” before saving.</div>
        </div>
        <div className="card">
          <div className="card-title">Core Toolkit</div>
          <div className="card-meta">math, random, time, easing, tween, input, gamepad</div>
        </div>
        <div className="card">
          <div className="card-title">State</div>
          <div className="card-meta">storage, dialogue, timeline, logger, events, FSM, ECS</div>
        </div>
        <div className="card">
          <div className="card-title">World</div>
          <div className="card-meta">grid, terrain, pathfinding, navmesh, level grammars</div>
        </div>
        <div className="card">
          <div className="card-title">Rendering</div>
          <div className="card-meta">sprites, pseudo‑3D, WebGL helper, text/color utils</div>
        </div>
        <div className="card">
          <div className="card-title">FX / Audio</div>
          <div className="card-meta">particles, camera shake, beep, audio sequencer</div>
        </div>
        <div className="card">
          <div className="card-title">Multiplayer / AI</div>
          <div className="card-meta">GameFactoryMultiplayer, GameFactoryAI</div>
        </div>
      </div>
    </main>
  );
}
