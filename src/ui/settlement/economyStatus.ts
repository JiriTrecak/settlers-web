import { BUILDINGS, STOCKPILE_LIMIT } from '../../shared/settlement/rules';
import type { Building, SettlementView } from '../../sim/settlement/settlement';

export function economyStatus(b: Building, state: SettlementView): string {
  if(b.health <= 0) return 'Destroyed';
  const incoming = state.workers.filter(w => w.shipment?.target === b.id);
  const deliveries = incoming.length ? ` · ${incoming.length} delivery${incoming.length===1?'':'ies'} assigned` : '';
  const staff = state.workers.find(w => w.building === b.id && w.role !== 'carrier' && w.role !== 'builder');
  if(!b.complete) {
    const r=BUILDINGS[b.kind];
    return (b.delivered.wood < r.wood || b.delivered.stone < r.stone ? 'Waiting for construction deliveries' : state.workers.some(w=>w.building===b.id && w.role==='builder') ? 'Builders constructing' : 'Waiting for a builder') + deliveries;
  }
  if(b.kind==='fort') return 'Warehouse · Receives planks and stone; supplies construction' + deliveries;
  if(b.kind==='house') return 'Housing · Adds three settlers';
  if(b.kind==='tower') return 'Territory outpost';
  if(!staff) return 'Unstaffed · Build a house for more settlers' + deliveries;
  const name = `${staff.role[0]!.toUpperCase()}${staff.role.slice(1)} #${staff.id}`;
  const full=b.inventory.log+b.inventory.plank+b.inventory.stone >= STOCKPILE_LIMIT;
  let activity: string;
  if(b.kind==='sawmill') activity=staff.job==='mill-process' ? 'Sawing logs into planks' : b.inventory.log ? 'Preparing logs' : 'Waiting for logs';
  else if(staff.job==='gather') activity=b.kind==='lumberjack' ? 'Cutting timber' : 'Quarrying stone';
  else if(staff.job==='to-resource') activity='Walking to resource';
  else if(staff.job==='to-stock') activity='Bringing harvest to workplace';
  else if(staff.job==='plant') activity='Replanting forest';
  else if(full) activity='Stockpile full · Waiting for carrier';
  else if(b.kind==='forester') activity='Waiting for a harvested planting site';
  else activity='Looking for reachable resources in owned territory';
  const chain=b.kind==='sawmill' ? ' · Logs → planks' : b.kind==='lumberjack' ? ' · Output: logs' : b.kind==='stonemason' ? ' · Output: stone' : '';
  return `${name} · ${activity}${chain}${deliveries}`;
}
