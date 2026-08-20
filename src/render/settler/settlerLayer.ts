/**
 * Movable sprites. Interpolates `from`→`pos` with moveProgress (+ frame leftover).
 * One container per unit: shadow → body → torso so player-color clothing stays on top.
 * Attackable units get the original health pip (file 4 seq 6) above the head.
 * Selected units get the original mark (file 4 seq 7) under the pip.
 * Clicks sample opaque body/torso pixels; the marquee uses those sprite boxes.
 */
import { Container, Graphics, Sprite, type Texture } from "pixi.js"
import { gridToWorld, isoDepth, ISO_DEPTH_UNIT } from "../../shared"
import type { MapView } from "../../sim/map/mapView"
import type { MovableType, MovableView } from "../../sim/movable/movable"
import type { FogView } from "../../sim/fog/fog"
import { FOG_VISIBLE } from "../../sim/fog/fog"
import { isAttackable, isControllable, settlerDef } from "../../sim/data/settlers"
import type { SettlerDef } from "../../sim/data/types"
import { placeLayer, type PropFrame } from "../graphics/textures"
import { PLAYER_COLORS, clampPlayer } from "../../shared"
import type { SettlerSheets } from "./settlerSheets"
import { aabbOverlap, localHits } from "./spriteHit"

const ALPHA = new WeakMap<Texture, Uint8Array | null>()

/** Original draws the pip 38px above the tile origin (their Y-up). Pixi is Y-down. */
const HEALTH_Y = -38
/** Selection mark sits closer to the unit than the health pip. */
const MARK_Y = -20

type Drawn = {
  id: number
  type: MovableType
  root: Container
  body: Sprite
  torso: Sprite
  shadow: Sprite
  fallback: Graphics
  mark: Sprite
  health: Sprite
}

/** Frame 0 = full HP, last = almost dead. Same mapping as the original sequence. */
export function healthFrameIndex(hp: number, maxHp: number, frames: number): number {
  if (frames <= 0) return 0
  const pct = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 0))
  return Math.min(((1 - pct) * frames) | 0, frames - 1)
}

export class SettlerLayer {
  private sheets: SettlerSheets | null = null
  private view: MapView | null = null
  private drawn = new Map<number, Drawn>()
  private selected = new Set<number>()

  constructor(private readonly parent: Container) {}

  setSheets(sheets: SettlerSheets | null): void {
    this.sheets = sheets
  }

  setSelected(ids: readonly number[]): void {
    this.selected = new Set(ids)
  }

  setView(view: MapView | null): void {
    this.view = view
  }

  /** Frontmost unit whose body/torso pixel contains the world point. */
  hitAt(wx: number, wy: number): number | null {
    let best: { id: number; z: number } | null = null
    for (const d of this.drawn.values()) {
      if (!isControllable(d.type) || !this.drawnHits(d, wx, wy)) continue
      if (!best || d.root.zIndex >= best.z) best = { id: d.id, z: d.root.zIndex }
    }
    return best?.id ?? null
  }

  /** Units whose body/torso screen AABB overlaps the marquee. */
  idsInScreenBox(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
  ): number[] {
    const out: number[] = []
    for (const d of this.drawn.values()) {
      if (!isControllable(d.type) || !this.drawnBoxHits(d, ax, ay, bx, by, toScreen)) continue
      out.push(d.id)
    }
    return out
  }

  /** `alpha` is leftover accumulator / tickMs — visual only, not sim. */
  draw(movables: readonly MovableView[], alpha: number, fog?: FogView): void {
    const view = this.view
    if (!view) return
    const seen = new Set<number>()
    for (const m of movables) {
      if (m.inside) continue
      seen.add(m.id)
      const drawn = this.ensure(m)
      drawn.type = m.type
      const p = visualProgress(m, alpha)
      const x = m.from.x + (m.pos.x - m.from.x) * p
      const y = m.from.y + (m.pos.y - m.from.y) * p
      const h0 = view.heightAt(m.from.x, m.from.y)
      const h1 = view.heightAt(m.pos.x, m.pos.y)
      const world = gridToWorld(x, y, h0 + (h1 - h0) * p)
      drawn.root.zIndex = isoDepth(world.x, world.y, ISO_DEPTH_UNIT)
      const sight = fog?.sightAt(m.pos.x, m.pos.y) ?? FOG_VISIBLE
      drawn.root.alpha = sight / FOG_VISIBLE
      const frame = this.frameOf(m, p)
      if (frame) {
        drawn.fallback.visible = false
        drawn.body.visible = true
        placeLayer(drawn.body, frame, world.x, world.y)
        if (frame.torso) {
          drawn.torso.visible = true
          drawn.torso.tint = PLAYER_COLORS[clampPlayer(m.player)]
          placeLayer(drawn.torso, frame.torso, world.x, world.y)
        } else {
          drawn.torso.visible = false
        }
        if (frame.shadow) {
          drawn.shadow.visible = true
          placeLayer(drawn.shadow, frame.shadow, world.x, world.y)
        } else {
          drawn.shadow.visible = false
        }
      } else {
        drawn.body.visible = false
        drawn.torso.visible = false
        drawn.shadow.visible = false
        drawn.fallback.visible = true
        drawn.fallback.position.set(world.x, world.y)
      }
      this.paintMark(drawn, m, world.x, world.y)
      this.paintHealth(drawn, m, world.x, world.y)
    }
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue
      d.root.destroy({ children: true })
      this.drawn.delete(id)
    }
  }

  private ensure(m: MovableView): Drawn {
    const existing = this.drawn.get(m.id)
    if (existing) return existing
    const unit = new Container()
    unit.eventMode = "none"
    const shadow = new Sprite()
    shadow.eventMode = "none"
    const body = new Sprite()
    body.eventMode = "none"
    const torso = new Sprite()
    torso.eventMode = "none"
    const fallback = new Graphics()
    fallback.eventMode = "none"
    fallback.circle(0, -4, 4).fill({ color: 0xe8c36a })
    const health = new Sprite()
    health.eventMode = "none"
    const mark = new Sprite()
    mark.eventMode = "none"
    unit.addChild(shadow, body, torso, fallback, mark, health)
    this.parent.addChild(unit)
    const drawn: Drawn = { id: m.id, type: m.type, root: unit, body, torso, shadow, fallback, mark, health }
    this.drawn.set(m.id, drawn)
    return drawn
  }

  private paintMark(drawn: Drawn, m: MovableView, wx: number, wy: number): void {
    const frame = this.sheets?.mark ?? null
    const show = !!frame && this.selected.has(m.id)
    drawn.mark.visible = show
    if (!show || !frame) return
    placeLayer(drawn.mark, frame, wx, wy + MARK_Y)
  }

  private paintHealth(drawn: Drawn, m: MovableView, wx: number, wy: number): void {
    const bars = this.sheets?.health ?? []
    const show = bars.length > 0 && isAttackable(m.type)
    drawn.health.visible = show
    if (!show) return
    const def: SettlerDef = settlerDef(m.type)
    const max = def.health ?? 100
    const frame = bars[healthFrameIndex(m.health, max, bars.length)]!
    placeLayer(drawn.health, frame, wx, wy + HEALTH_Y)
  }

  private drawnHits(d: Drawn, wx: number, wy: number): boolean {
    if (d.body.visible && spritePixelHits(d.body, wx, wy)) return true
    if (d.torso.visible && spritePixelHits(d.torso, wx, wy)) return true
    if (d.fallback.visible) {
      const dx = wx - d.fallback.position.x
      const dy = wy - (d.fallback.position.y - 4)
      return dx * dx + dy * dy <= 16
    }
    return false
  }

  private drawnBoxHits(
    d: Drawn,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
  ): boolean {
    if (d.body.visible && spriteBoxHits(d.body, ax, ay, bx, by, toScreen)) return true
    if (d.torso.visible && spriteBoxHits(d.torso, ax, ay, bx, by, toScreen)) return true
    if (d.fallback.visible) {
      const p = toScreen(d.fallback.position.x, d.fallback.position.y - 4)
      return aabbOverlap(p.x - 4, p.y - 4, p.x + 4, p.y + 4, ax, ay, bx, by)
    }
    return false
  }

  private frameOf(m: MovableView, progress: number): PropFrame | null {
    const sheets = this.sheets?.[m.type] ?? this.sheets?.bearer
    if (!sheets) return null
    const held = m.material !== "none" ? sheets.carry[m.material] : undefined
    const clip =
      m.action === "walk"
        ? (held?.walk[m.direction] ?? sheets.walk[m.direction])
        : m.action === "work"
          ? m.job === "pickup" || m.job === "drop" || m.job === "deliver"
            ? sheets.pickup[m.direction]
            : m.job === "plantCrop"
              ? sheets.plant[m.direction]
              : sheets.chop[m.direction]
          : held
            ? held.idle[m.direction]
            : sheets.idle[m.direction]
    if (!clip || clip.length === 0) return null
    if (m.action === "walk") {
      const i = progress >= 1 ? clip.length - 1 : (progress * clip.length) | 0
      return clip[i] ?? clip[0]!
    }
    if (m.action === "work") {
      if (m.job === "pickup" || m.job === "drop" || m.job === "deliver") {
        const i = (progress * clip.length) | 0
        return clip[i % clip.length] ?? clip[0]!
      }
      const loopTicks = 40
      const cycle = ((progress * m.workTicks) / loopTicks) % 1
      const i = (cycle * clip.length) | 0
      return clip[i % clip.length] ?? clip[0]!
    }
    return clip[0]!
  }
}

function visualProgress(m: MovableView, alpha: number): number {
  if (m.action === "walk") return Math.min(1, m.moveProgress + alpha / m.stepTicks)
  if (m.action === "work") return Math.min(1, m.workProgress + alpha / m.workTicks)
  return 0
}

function spritePixelHits(sprite: Sprite, wx: number, wy: number): boolean {
  const tex = sprite.texture
  if (!tex || tex.width === 0 || tex.height === 0) return false
  const sx = sprite.scale.x || 1
  const sy = sprite.scale.y || 1
  return localHits((wx - sprite.position.x) / sx, (wy - sprite.position.y) / sy, tex.width, tex.height, alphaOf(tex))
}

function spriteBoxHits(
  sprite: Sprite,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  toScreen: (wx: number, wy: number) => { x: number; y: number },
): boolean {
  const tex = sprite.texture
  if (!tex || tex.width === 0 || tex.height === 0) return false
  const p0 = toScreen(sprite.position.x, sprite.position.y)
  const p1 = toScreen(sprite.position.x + tex.width * sprite.scale.x, sprite.position.y + tex.height * sprite.scale.y)
  return aabbOverlap(p0.x, p0.y, p1.x, p1.y, ax, ay, bx, by)
}

function alphaOf(tex: Texture): Uint8Array | null {
  if (ALPHA.has(tex)) return ALPHA.get(tex) ?? null
  const a = readAlpha(tex)
  ALPHA.set(tex, a)
  return a
}

/** Same-origin catalog PNGs. Failure → AABB-only hit. */
function readAlpha(tex: Texture): Uint8Array | null {
  const w = tex.width | 0
  const h = tex.height | 0
  if (w <= 0 || h <= 0) return null
  const src = tex.source.resource
  if (!src) return null
  try {
    const c = document.createElement("canvas")
    c.width = w
    c.height = h
    const ctx = c.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null
    const frame = tex.frame
    ctx.drawImage(src as CanvasImageSource, frame.x, frame.y, frame.width, frame.height, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    const a = new Uint8Array(w * h)
    for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3]!
    return a
  } catch {
    return null
  }
}
