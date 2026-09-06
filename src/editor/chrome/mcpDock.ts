/**
 * Sibling dock for the MCP latch: enable the Cursor bridge and set its port.
 */
import { btn, field, sheet } from "../../ui";
import { EDITOR_MCP_PORT } from "../../shared";
import type { McpLink } from "../control/mcpPrefs";

export type McpDockState = {
  enabled: boolean;
  port: number;
  link: McpLink;
};

export type McpDockHooks = {
  onMcpEnabled(on: boolean): void;
  onMcpPort(n: number): void;
};

export class McpDock {
  readonly root: HTMLElement;
  private readonly enable: HTMLButtonElement;
  private readonly port: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly hint: HTMLElement;

  constructor(host: HTMLElement, private readonly hooks: McpDockHooks) {
    this.root = document.createElement("div");
    this.root.className = `pointer-events-auto flex w-56 min-w-0 flex-col gap-1.5 overflow-hidden rounded-2xl p-2 font-dock ${sheet}`;
    this.root.setAttribute("aria-label", "MCP");
    const title = document.createElement("span");
    title.className = "text-[11px] font-medium tracking-[0.14em] text-canopy/40 uppercase";
    title.textContent = "MCP";
    this.status = document.createElement("p");
    this.status.className = "text-[12px] tracking-wide text-canopy/70";
    this.enable = document.createElement("button");
    this.enable.type = "button";
    this.enable.className = `${btn} w-full text-left`;
    this.enable.addEventListener("click", () => this.hooks.onMcpEnabled(this.enable.dataset.on !== "1"));
    const portRow = document.createElement("label");
    portRow.className = "flex flex-col gap-1";
    const portCap = document.createElement("span");
    portCap.className = "text-[10px] font-medium tracking-[0.12em] text-canopy/40 uppercase";
    portCap.textContent = "Port";
    this.port = document.createElement("input");
    this.port.type = "number";
    this.port.min = "1";
    this.port.max = "65535";
    this.port.step = "1";
    this.port.className = `${field} w-full px-1.5 py-1 text-[12px]`;
    this.port.addEventListener("change", () => this.hooks.onMcpPort(Number(this.port.value)));
    portRow.append(portCap, this.port);
    this.hint = document.createElement("p");
    this.hint.className = "text-[10px] leading-4 tracking-wide text-canopy/40";
    this.hint.textContent = `Cursor talks to this tab on 127.0.0.1. Default ${EDITOR_MCP_PORT}.`;
    this.root.append(title, this.status, this.enable, portRow, this.hint);
    this.root.classList.add("hidden");
    host.append(this.root);
  }

  setOpen(on: boolean): void {
    this.root.classList.toggle("hidden", !on);
  }

  set(state: McpDockState): void {
    this.enable.dataset.on = state.enabled ? "1" : "0";
    this.enable.textContent = state.enabled ? "Enabled" : "Disabled";
    this.enable.classList.toggle("bg-white/[0.08]", state.enabled);
    this.enable.classList.toggle("text-canopy", state.enabled);
    this.port.value = String(state.port);
    this.status.textContent = label(state);
  }

  destroy(): void {
    this.root.remove();
  }
}

function label(state: McpDockState): string {
  if (!state.enabled) return "Off — enable to let Cursor drive the map.";
  if (state.link === "connected") return "Connected to Cursor.";
  return "Waiting for Cursor (npm run mcp:editor).";
}
