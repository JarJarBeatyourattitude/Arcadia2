from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv
import uuid
from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from openrouter import OpenRouter
from openai import OpenAI

from .db import SessionLocal, init_db
from .models import Game, GameVersion, Room
from .schemas import AiIn, AiOut, EditIn, GameCreate, GameOut, GameUpdate, GameVersionOut, GenerateIn, GenerateOut

ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ROOT_ENV)

app = FastAPI(title="Game Factory API")

allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,null")
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return None


def _sanitize_html(code: str) -> str:
    # Strip external scripts/links to keep games self-contained.
    sanitized = code
    sanitized = re.sub(r"<script[^>]+src=['\"][^'\"]+['\"][^>]*>\\s*</script>", "", sanitized, flags=re.I)
    sanitized = re.sub(r"<link[^>]+href=['\"]https?://[^'\"]+['\"][^>]*>", "", sanitized, flags=re.I)
    return sanitized


def _fallback_game(prompt: str) -> Dict[str, str]:
    title = "Neon Drift"
    description = "Dodge the neon asteroids and survive as long as possible."
    code = f"""
<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>{title}</title>
  <style>
    html, body {{ margin:0; height:100%; background:#05060a; color:#fff; font-family:system-ui; }}
    canvas {{ display:block; width:100%; height:100%; }}
    .hud {{ position:fixed; top:12px; left:12px; font-size:14px; background:rgba(0,0,0,0.4); padding:8px 10px; border-radius:8px; }}
  </style>
</head>
<body>
  <div class=\"hud\">{prompt}</div>
  <canvas id=\"game\"></canvas>
  <script>
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const state = {{ x: 0, y: 0, vx: 0, vy: 0, t: 0, score: 0, over: false }};
    const asteroids = Array.from({{length: 30}}, () => ({{
      x: Math.random()*2-1,
      y: Math.random()*2-1,
      z: Math.random()*1+0.2,
      r: Math.random()*12+6
    }}));

    function resize() {{
      canvas.width = window.innerWidth * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
    }}
    window.addEventListener('resize', resize);
    resize();

    window.addEventListener('mousemove', (e) => {{
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      state.vx = nx * 0.02;
      state.vy = ny * 0.02;
    }});

    function step() {{
      if (state.over) return;
      state.t += 1;
      state.score += 1;
      state.x += state.vx;
      state.y += state.vy;

      ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
      ctx.clearRect(0,0,window.innerWidth,window.innerHeight);

      const cx = window.innerWidth/2 + state.x*200;
      const cy = window.innerHeight/2 + state.y*200;

      for (const a of asteroids) {{
        a.z -= 0.01;
        if (a.z <= 0.1) {{
          a.z = 1.2;
          a.x = Math.random()*2-1;
          a.y = Math.random()*2-1;
          a.r = Math.random()*12+6;
        }}
        const sx = cx + (a.x / a.z) * 260;
        const sy = cy + (a.y / a.z) * 260;
        const sr = a.r / a.z;
        ctx.beginPath();
        ctx.fillStyle = `rgba(80,180,255,${{0.6/a.z}})`;
        ctx.arc(sx, sy, sr, 0, Math.PI*2);
        ctx.fill();

        const dx = sx - cx;
        const dy = sy - cy;
        if (Math.hypot(dx, dy) < sr + 14) {{
          state.over = true;
        }}
      }}

      ctx.fillStyle = '#9cf';
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = '16px system-ui';
      ctx.fillText(`Score: ${{state.score}}`, 16, 28);

      if (state.over) {{
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0,0,window.innerWidth,window.innerHeight);
        ctx.fillStyle = '#fff';
        ctx.font = '28px system-ui';
        ctx.fillText('Game Over - refresh to retry', 24, 60);
      }} else {{
        requestAnimationFrame(step);
      }}
    }}
    step();
  </script>
</body>
</html>
"""
    return {"title": title, "description": description, "code": code}


def _generate_game(prompt: str) -> Dict[str, str]:
    openai_key = os.getenv("OPENAI_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openai_key and not openrouter_key:
        return _fallback_game(prompt)

    system = (
        "You are a game designer who outputs ONLY JSON. "
        "Return a JSON object with keys: title, description, code. "
        "code must be a complete single-file HTML document with inline CSS and JS. "
        "The game must be playable, fun, and self-contained with no external assets. "
        "Use keyboard and/or mouse controls, include a win/lose condition, and show a score. "
        "If you need live AI interaction inside the game, call window.GameFactoryAI(prompt) "
        "which returns a string response. "
        "For multiplayer, you can use window.GameFactoryMultiplayer(roomId) which returns "
        "an object with send(data), onMessage(fn), and disconnect(). "
        "Capabilities (optional) quick API cheat-sheet: "
        "AI: await GameFactoryAI(prompt, system?) -> string. "
        "Multiplayer: const mp=GameFactoryMultiplayer(roomId); mp.send(data); mp.onMessage(fn); mp.disconnect(). "
        "Math: clamp(v,min,max), lerp(a,b,t), map(v,inMin,inMax,outMin,outMax). "
        "Random: rand(min,max), choice(arr), rng.setSeed(s), rng.next(). "
        "Time: now(), timers.after(ms,fn), timers.tick(). "
        "Motion: easing.* (linear/inQuad/outQuad/inOutQuad), tween(obj, prop, to, ms). "
        "Input: input.keys, input.mouse{x,y,down}, input.isDown('ArrowUp'); gamepad.poll(). "
        "Audio: audio.beep(freq,dur,type,vol); audioSeq.play(pattern,bpm); audioSeq.track(steps,bpm); audioSeq.noteToFreq('C4'). "
        "State: storage.save/load, storage.slotSave/slotLoad; dialogue.say/next; timeline.add(at,fn)/run(t); logger.push(msg). "
        "Physics2D: physics2d.step(obj,dt), aabb(a,b), circle(a,b). "
        "FX: particles.spawn/update/draw/prune; camera.shake/applyShake; color.hexToRgb/rgbToHex/lerp; text.wrap(ctx,text,maxW). "
        "World: grid.make/inBounds; terrain.heightMap(w,h,scale); pathfinding.aStar(grid,start,end); navmesh.build(grid,diag)/findPath(mesh,start,end); levelGrammar.expand(rules,axiom,depth)/toGrid(str,w). "
        "Architecture: ecs.create/add/get/has/remove/query/system/update; fsm(initial).on(from,to,fn).set(to); eventBus.on/emit. "
        "Rendering: sprites.draw(ctx,img,frame,fw,fh,x,y,scale); pseudo3d.project(pt,cam); webgl.create(canvas). "
        "Examples (optional patterns): "
        "AI NPC: const reply=await GameFactoryAI('In character, give a hint about the puzzle'); "
        "Multiplayer sync: const mp=GameFactoryMultiplayer('room1'); mp.onMessage(msg=>{state=JSON.parse(msg)}); mp.send(JSON.stringify(state)); "
        "ECS loop: ecs.system(['pos','vel'],(id,p,v,dt)=>{p.x+=v.x*dt}); function tick(dt){ecs.update(dt); requestAnimationFrame(tick);} "
        "If it fits the design, prefer using at least 2 GameFactoryKit utilities (not just Math.random) so tools are exercised. "
        "Use these selectively and creatively so games stay diverse. "
        "It is acceptable if the HTML file is very large (tens of thousands of lines) when the game requires it."
    )

    if openai_key:
        model = os.getenv("OPENAI_MODEL", "gpt-5.2-codex")
        client = OpenAI(api_key=openai_key)
        response = client.responses.create(
            model=model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        )
        content = getattr(response, "output_text", None)
    else:
        model = os.getenv("OPENROUTER_MODEL", "moonshotai/kimi-k2.5")
        with OpenRouter(api_key=openrouter_key) as client:
            response = client.chat.send(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
            )
        content = response.choices[0].message.content if response.choices else None

    if not content:
        return _fallback_game(prompt)

    payload = _extract_json(content)
    if not payload:
        return _fallback_game(prompt)

    title = str(payload.get("title") or "Untitled Game")
    description = str(payload.get("description") or "")
    code = _sanitize_html(str(payload.get("code") or ""))
    if "<html" not in code.lower():
        return _fallback_game(prompt)

    return {"title": title, "description": description, "code": code}


def _edit_game(current_code: str, instruction: str, original_prompt: str | None = None) -> Dict[str, str]:
    openai_key = os.getenv("OPENAI_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openai_key and not openrouter_key:
        raise ValueError("No AI API key set")

    system = (
        "You are editing an existing HTML game. "
        "Return ONLY a JSON object with keys: title, description, code. "
        "code must be a complete single-file HTML document. "
        "Preserve existing functionality unless the instruction changes it. "
        "Do not omit scripts/styles. Keep it working."
    )
    user = f"EDIT INSTRUCTION:\\n{instruction}\\n\\nCURRENT HTML:\\n{current_code}"

    if openai_key:
        model = os.getenv("OPENAI_MODEL", "gpt-5.2-codex")
        client = OpenAI(api_key=openai_key)
        response = client.responses.create(
            model=model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        content = getattr(response, "output_text", None)
    else:
        model = os.getenv("OPENROUTER_MODEL", "moonshotai/kimi-k2.5")
        with OpenRouter(api_key=openrouter_key) as client:
            response = client.chat.send(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.7,
            )
        content = response.choices[0].message.content if response.choices else None

    payload = _extract_json(content or "")
    if not payload:
        raise ValueError("Failed to parse edit JSON")
    title = str(payload.get("title") or "Untitled Game")
    description = str(payload.get("description") or "")
    code = _sanitize_html(str(payload.get("code") or ""))
    if "<html" not in code.lower():
        raise ValueError("Edited code missing HTML document")
    return {"title": title, "description": description, "code": code}


@app.post("/generate", response_model=GenerateOut)
def generate(payload: GenerateIn) -> GenerateOut:
    try:
        game = _generate_game(payload.prompt)
        return GenerateOut(**game)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/generate/stream")
def generate_stream(payload: GenerateIn):
    def event_stream():
        openai_key = os.getenv("OPENAI_API_KEY")
        openrouter_key = os.getenv("OPENROUTER_API_KEY")
        if not openai_key and not openrouter_key:
            fallback = _fallback_game(payload.prompt)
            yield f"event: done\ndata: {json.dumps(fallback)}\n\n"
            return
        system = (
            "You are a game designer who outputs ONLY JSON. "
            "Return a JSON object with keys: title, description, code. "
            "code must be a complete single-file HTML document with inline CSS and JS. "
            "The game must be playable, fun, and self-contained with no external assets. "
            "Use keyboard and/or mouse controls, include a win/lose condition, and show a score. "
            "If you need live AI interaction inside the game, call window.GameFactoryAI(prompt) "
            "which returns a string response. "
            "For multiplayer, you can use window.GameFactoryMultiplayer(roomId) which returns "
            "an object with send(data), onMessage(fn), and disconnect(). "
            "Capabilities (optional) quick API cheat-sheet: "
            "AI: await GameFactoryAI(prompt, system?) -> string. "
            "Multiplayer: const mp=GameFactoryMultiplayer(roomId); mp.send(data); mp.onMessage(fn); mp.disconnect(). "
            "Math: clamp(v,min,max), lerp(a,b,t), map(v,inMin,inMax,outMin,outMax). "
            "Random: rand(min,max), choice(arr), rng.setSeed(s), rng.next(). "
            "Time: now(), timers.after(ms,fn), timers.tick(). "
            "Motion: easing.* (linear/inQuad/outQuad/inOutQuad), tween(obj, prop, to, ms). "
            "Input: input.keys, input.mouse{x,y,down}, input.isDown('ArrowUp'); gamepad.poll(). "
            "Audio: audio.beep(freq,dur,type,vol); audioSeq.play(pattern,bpm); audioSeq.track(steps,bpm); audioSeq.noteToFreq('C4'). "
            "State: storage.save/load, storage.slotSave/slotLoad; dialogue.say/next; timeline.add(at,fn)/run(t); logger.push(msg). "
            "Physics2D: physics2d.step(obj,dt), aabb(a,b), circle(a,b). "
            "FX: particles.spawn/update/draw/prune; camera.shake/applyShake; color.hexToRgb/rgbToHex/lerp; text.wrap(ctx,text,maxW). "
            "World: grid.make/inBounds; terrain.heightMap(w,h,scale); pathfinding.aStar(grid,start,end); navmesh.build(grid,diag)/findPath(mesh,start,end); levelGrammar.expand(rules,axiom,depth)/toGrid(str,w). "
            "Architecture: ecs.create/add/get/has/remove/query/system/update; fsm(initial).on(from,to,fn).set(to); eventBus.on/emit. "
            "Rendering: sprites.draw(ctx,img,frame,fw,fh,x,y,scale); pseudo3d.project(pt,cam); webgl.create(canvas). "
            "Examples (optional patterns): "
            "AI NPC: const reply=await GameFactoryAI('In character, give a hint about the puzzle'); "
            "Multiplayer sync: const mp=GameFactoryMultiplayer('room1'); mp.onMessage(msg=>{state=JSON.parse(msg)}); mp.send(JSON.stringify(state)); "
            "ECS loop: ecs.system(['pos','vel'],(id,p,v,dt)=>{p.x+=v.x*dt}); function tick(dt){ecs.update(dt); requestAnimationFrame(tick);} "
            "If it fits the design, prefer using at least 2 GameFactoryKit utilities (not just Math.random) so tools are exercised. "
            "Use these selectively and creatively so games stay diverse. "
            "It is acceptable if the HTML file is very large (tens of thousands of lines) when the game requires it."
        )

        chunks: list[str] = []
        if openai_key:
            model = os.getenv("OPENAI_MODEL", "gpt-5.2-codex")
            client = OpenAI(api_key=openai_key)
            stream = client.responses.create(
                model=model,
                input=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": payload.prompt},
                ],
                stream=True,
            )
            for event in stream:
                if getattr(event, "type", "") == "response.output_text.delta":
                    delta = getattr(event, "delta", None)
                    if not delta:
                        continue
                    chunks.append(delta)
                    yield f"event: delta\ndata: {json.dumps({'chunk': delta})}\n\n"
        else:
            model = os.getenv("OPENROUTER_MODEL", "moonshotai/kimi-k2.5")
            with OpenRouter(api_key=openrouter_key) as client:
                stream = client.chat.send(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": payload.prompt},
                    ],
                    temperature=0.7,
                    stream=True,
                )
                for event in stream:
                    if not event.choices:
                        continue
                    delta = event.choices[0].delta.content if event.choices[0].delta else None
                    if not delta:
                        continue
                    chunks.append(delta)
                    yield f"event: delta\ndata: {json.dumps({'chunk': delta})}\n\n"

        content = "".join(chunks)
        payload_json = _extract_json(content) or _fallback_game(payload.prompt)
        yield f"event: done\ndata: {json.dumps(payload_json)}\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)


@app.post("/ai", response_model=AiOut)
def ai_call(payload: AiIn) -> AiOut:
    openai_key = os.getenv("OPENAI_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openai_key and not openrouter_key:
        raise HTTPException(status_code=400, detail="No AI API key set")

    messages = []
    if payload.system:
        messages.append({"role": "system", "content": payload.system})
    messages.append({"role": "user", "content": payload.prompt})

    if openai_key:
        model = os.getenv("OPENAI_MODEL", "gpt-5.2-codex")
        client = OpenAI(api_key=openai_key)
        response = client.responses.create(model=model, input=messages)
        content = getattr(response, "output_text", "") or ""
    else:
        model = os.getenv("OPENROUTER_MODEL", "moonshotai/kimi-k2.5")
        with OpenRouter(api_key=openrouter_key) as client:
            response = client.chat.send(
                model=model,
                messages=messages,
                temperature=0.7,
            )
        content = response.choices[0].message.content if response.choices else ""

    return AiOut(content=content or "")


class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = {}
        self.players: dict[WebSocket, dict[str, str | bool]] = {}

    async def connect(self, room: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.rooms.setdefault(room, set()).add(websocket)
        self.players[websocket] = {
            "id": uuid.uuid4().hex[:8],
            "name": "Player",
            "ready": False,
            "room": room,
        }
        _upsert_room(room, len(self.rooms.get(room, [])))

    def disconnect(self, room: str, websocket: WebSocket) -> None:
        if room in self.rooms:
            self.rooms[room].discard(websocket)
            if not self.rooms[room]:
                self.rooms.pop(room, None)
        self.players.pop(websocket, None)
        _upsert_room(room, len(self.rooms.get(room, [])))

    async def broadcast(self, room: str, message: str) -> None:
        for ws in list(self.rooms.get(room, [])):
            await ws.send_text(message)

    def room_state(self, room: str) -> list[dict[str, str | bool]]:
        players = []
        for ws in self.rooms.get(room, []):
            meta = self.players.get(ws)
            if meta:
                players.append(
                    {"id": meta["id"], "name": meta["name"], "ready": meta["ready"]}
                )
        return players


manager = ConnectionManager()


def _upsert_room(room_id: str, count: int) -> None:
    db = SessionLocal()
    try:
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            room = Room(id=room_id, count=count)
            db.add(room)
        else:
            room.count = count
        db.commit()
    finally:
        db.close()


@app.websocket("/ws/{room_id}")
async def ws_room(websocket: WebSocket, room_id: str):
    await manager.connect(room_id, websocket)
    await manager.broadcast(
        room_id, json.dumps({"type": "room_state", "players": manager.room_state(room_id)})
    )
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                payload = {"type": "message", "data": data}

            if payload.get("type") == "set_name":
                name = str(payload.get("name") or "Player")[:24]
                if websocket in manager.players:
                    manager.players[websocket]["name"] = name
                await manager.broadcast(
                    room_id,
                    json.dumps(
                        {
                            "type": "room_state",
                            "players": manager.room_state(room_id),
                        }
                    ),
                )
                continue

            if payload.get("type") == "ready":
                ready = bool(payload.get("ready"))
                if websocket in manager.players:
                    manager.players[websocket]["ready"] = ready
                await manager.broadcast(
                    room_id,
                    json.dumps(
                        {
                            "type": "room_state",
                            "players": manager.room_state(room_id),
                        }
                    ),
                )
                continue

            await manager.broadcast(room_id, json.dumps(payload))
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        await manager.broadcast(
            room_id, json.dumps({"type": "room_state", "players": manager.room_state(room_id)})
        )


@app.get("/lobby/rooms")
def lobby_rooms():
    db = SessionLocal()
    try:
        rooms = []
        for r in db.query(Room).all():
            rooms.append({"room_id": r.id, "count": r.count})
        rooms.sort(key=lambda r: r["count"], reverse=True)
        return rooms
    finally:
        db.close()


@app.post("/games", response_model=GameOut)
def create_game(payload: GameCreate, db: Session = Depends(get_db)) -> GameOut:
    data = payload.dict()
    data["code"] = _sanitize_html(data["code"])
    game = Game(**data)
    db.add(game)
    db.commit()
    db.refresh(game)
    version = GameVersion(
        game_id=game.id,
        title=game.title,
        description=game.description,
        prompt=game.prompt,
        code=game.code,
        action="create",
    )
    db.add(version)
    db.commit()
    return game


@app.get("/games", response_model=list[GameOut])
def list_games(db: Session = Depends(get_db)) -> list[GameOut]:
    return db.query(Game).order_by(Game.created_at.desc()).all()


@app.get("/games/{game_id}", response_model=GameOut)
def get_game(game_id: int, db: Session = Depends(get_db)) -> GameOut:
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game


@app.put("/games/{game_id}", response_model=GameOut)
def update_game(game_id: int, payload: GameUpdate, db: Session = Depends(get_db)) -> GameOut:
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Save current version before manual update
    version = GameVersion(
        game_id=game.id,
        title=game.title,
        description=game.description,
        prompt=game.prompt,
        code=game.code,
        action="manual",
    )
    db.add(version)
    db.commit()

    if payload.title is not None:
        game.title = payload.title
    if payload.description is not None:
        game.description = payload.description
    if payload.prompt is not None:
        game.prompt = payload.prompt
    if payload.code is not None:
        game.code = _sanitize_html(payload.code)
    db.commit()
    db.refresh(game)
    return game


@app.get("/games/{game_id}/versions", response_model=list[GameVersionOut])
def list_versions(game_id: int, db: Session = Depends(get_db)) -> list[GameVersionOut]:
    return (
        db.query(GameVersion)
        .filter(GameVersion.game_id == game_id)
        .order_by(GameVersion.created_at.desc())
        .all()
    )


@app.post("/games/{game_id}/edit", response_model=GameOut)
def edit_game(game_id: int, payload: EditIn, db: Session = Depends(get_db)) -> GameOut:
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Save current version before editing
    version = GameVersion(
        game_id=game.id,
        title=game.title,
        description=game.description,
        prompt=game.prompt,
        code=game.code,
        action="edit",
    )
    db.add(version)
    db.commit()

    try:
        updated = _edit_game(game.code, payload.instruction, game.prompt)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    game.title = updated["title"]
    game.description = updated["description"]
    game.code = _sanitize_html(updated["code"])
    db.commit()
    db.refresh(game)
    return game


@app.post("/games/{game_id}/rollback/{version_id}", response_model=GameOut)
def rollback_game(game_id: int, version_id: int, db: Session = Depends(get_db)) -> GameOut:
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    version = (
        db.query(GameVersion)
        .filter(GameVersion.id == version_id, GameVersion.game_id == game_id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Save current before rollback
    current = GameVersion(
        game_id=game.id,
        title=game.title,
        description=game.description,
        prompt=game.prompt,
        code=game.code,
        action="rollback",
    )
    db.add(current)
    db.commit()

    game.title = version.title
    game.description = version.description
    game.prompt = version.prompt
    game.code = version.code
    db.commit()
    db.refresh(game)
    return game
