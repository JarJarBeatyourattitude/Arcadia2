export default function ToolkitPage() {
  return (
    <main className="section">
      <h1>Toolkit Reference</h1>
      <p style={{ color: "#98a0b5" }}>
        Optional utilities available in every game via `GameFactoryKit` (and compatible globals).
      </p>
      <div className="cards">
        <div className="card">
          <div className="card-title">Core</div>
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
