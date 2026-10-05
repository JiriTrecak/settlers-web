import {expect,it,vi} from 'vitest';
import {game,placed} from './helpers';

it('reuses a stopped actor’s terrain budget, but not the changing traffic route',()=>{
 const placements=[placed('mover','unit.ants.warrior',60,90),placed('wall','building.ants.house',100,90),placed('blocker','unit.ants.warrior',62,90)];
 const g=game(placements);
 const s=g.spatial,e=g.entities.find(e=>e.placement==='mover')!,b=g.entities.find(e=>e.placement==='blocker')!,goal={x:180,y:90};
 expect(s.route(e,goal,true,200000)).toBe(true);
 expect(s.routing.trafficBiasedSearches).toBeGreaterThan(0);
 const queries=s.routing.meshSearches,first=[...e.unit!.route];
 expect(s.route(e,goal,true,200000)).toBe(true);
 expect(e.unit!.route).toEqual(first);expect(s.routing.meshSearches).toBe(queries);expect(s.routing.trafficBudgetHits).toBe(1);
 // Bodies are live input to the actual retry, never part of the budget cache.
 b.x=first[0]!%s.size;b.y=Math.floor(first[0]!/s.size);b.unit!.position=null;
 const copy=game(placements);copy.restore(JSON.parse(JSON.stringify(g.snapshot())));
 expect(s.route(e,goal,true,200000)).toBe(copy.spatial.route(copy.context.get(e.id)!,goal,true,200000));
 expect(g.checksum('full')).toBe(copy.checksum('full'));
 expect(s.routing.trafficBudgetHits).toBe(2);
 // Even sub-cell movement and local terrain changes must reconsider the limit.
 e.unit!.position!.y+=100;
 s.route(e,goal,true,200000);expect(s.routing.trafficBudgetHits).toBe(2);
 const obstacle=g.context.create(placed('new-wall','building.ants.house',140,90));s.appendOccupancy(obstacle);
 s.route(e,goal,true,200000);expect(s.routing.trafficBudgetHits).toBe(2);
});

it('retains exact traffic routes near a dense group and for short destinations',()=>{
 const g=game(),s=g.spatial,start=s.cell({x:60,y:90}),goal=s.cell({x:180,y:90});
 const blockers=new Set([s.cell({x:64,y:89}),s.cell({x:65,y:92}),s.cell({x:62,y:92}),s.cell({x:66,y:87})]);
 const exact=s.navigation.path(start,goal,blockers);
 expect(s.findGridPath(start,goal,blockers)).toEqual(exact);expect(s.routing.trafficBiasedSearches).toBe(0);
 const nearby=s.cell({x:80,y:90}),single=new Set([s.cell({x:65,y:90})]);
 expect(s.findGridPath(start,nearby,single)).toEqual(s.navigation.path(start,nearby,single));expect(s.routing.trafficBiasedSearches).toBe(0);
 expect(s.findGridPath(start,goal,single)?.at(-1)).toBe(goal);expect(s.routing.trafficBiasedSearches).toBe(1);
});

it('rejects nearby traffic before scanning a long terrain shortcut, without skipping body clearance',()=>{
 const g=game(),s=g.spatial;
 s.terrain.fill(1);s.heights.fill(0);s.occupied.fill(0);s.resources.fill(0);
 const from={x:40000,y:100000},to={x:220000,y:100000},body={radius:.75,height:2,formationSpacing:2};
 const check=vi.spyOn(s,'walkable'),blocked=new Set([s.cell({x:41,y:100})]);
 expect(s.clearSegment(from,to,blocked,body)).toBe(false);
 expect(check.mock.calls.length).toBeLessThan(10);
 blocked.clear();expect(s.clearSegment(from,to,blocked,body)).toBe(true);
 // The center is clear, but a wide body's side overlaps a wall.
 s.occupied[s.cell({x:120,y:101})]=999;
 expect(s.clearSegment(from,to,blocked,body)).toBe(false);
 s.occupied.fill(0);s.heights[s.cell({x:120,y:100})]=500;
 expect(s.clearSegment(from,to,blocked,body)).toBe(false);
});

it('biases long convoys while preserving exact priority for crossing orders and nearby opponents',()=>{
 const g=game([placed('mover','unit.ants.warrior',60,90),placed('other','unit.ants.warrior',170,90)]);
 const s=g.spatial,e=g.entities.find(e=>e.placement==='mover')!,other=g.entities.find(e=>e.placement==='other')!;
 const start=s.cell(e),goal=s.cell({x:180,y:90});
 const blockers=new Set([s.cell({x:64,y:89}),s.cell({x:65,y:92}),s.cell({x:62,y:92}),s.cell({x:66,y:87})]);
 const search=()=>{const before=s.routing.trafficBiasedSearches;expect(s.findGridPath(start,goal,blockers,Infinity,e)?.at(-1)).toBe(goal);return s.routing.trafficBiasedSearches-before;};
 other.unit!.goal=goal;other.unit!.route=[goal];
 expect(search()).toBe(1); // Same direction; density alone does not require exact search.
 other.unit!.goal=start;other.unit!.route=[start];
 expect(search()).toBe(0); // Opposing orders by the same player.
 other.owner='player.2';
 expect(search()).toBe(1); // Far-away activity by another controller is irrelevant here.
 other.x=70;
 expect(search()).toBe(0); // Other controllers still reserve right-of-way locally.
 other.unit!.contained=e.id;
 expect(search()).toBe(1); // A contained actor is not an approaching stream.
});
