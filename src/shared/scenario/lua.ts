import {lua,lauxlib,to_luastring,to_jsstring} from 'fengari';
export type Scalar=string|number|boolean|null;
export type LuaHost=Record<string,(...args:Scalar[])=>Scalar|Scalar[]|void>;
const bytes=to_luastring;
/** Fresh, library-free Lua VM per callback. Only explicit host state survives.
 * No JS bridge, filesystem, network, wall clock, random, metatables or coroutines.
 * Bounded instructions prevent accidental infinite loops; script size is map-validated.
 */
export function runMissionLua(source:string,callback:string,host:LuaHost):void {
  const L=lauxlib.luaL_newstate();
  try {
    let instructions=0, active=false;
    lua.lua_sethook(L,()=>{
      if(++instructions>20000)lauxlib.luaL_error(L,bytes('Mission exceeded 20,000 instructions'));
      // Check every instruction: repeated string doubling can exhaust memory in
      // fewer than 32 instructions, long before a coarse instruction hook fires.
      for(let i=1;i<=lua.lua_gettop(L);i++)if(lua.lua_type(L,i)===lua.LUA_TSTRING && lua.lua_rawlen(L,i)>65536)lauxlib.luaL_error(L,bytes('Mission string exceeds 64 KiB'));
    },lua.LUA_MASKCOUNT,1);
    lua.lua_newtable(L);
    for(const [name,fn] of Object.entries(host)) {
      lua.lua_pushjsfunction(L,(state:unknown)=>{
        try {
          if(!active)throw new Error("Call the mission API inside on_start/on_tick, not at script top level");
          const args:Scalar[]=[];
          for(let i=1;i<=lua.lua_gettop(state);i++) {
            const type=lua.lua_type(state,i);
            if(type===lua.LUA_TSTRING)args.push(to_jsstring(lua.lua_tolstring(state,i)));
            else if(type===lua.LUA_TNUMBER)args.push(lua.lua_tonumber(state,i));
            else if(type===lua.LUA_TBOOLEAN)args.push(!!lua.lua_toboolean(state,i));
            else if(type===lua.LUA_TNIL)args.push(null);
            else throw new Error('Mission API accepts only strings, numbers and booleans');
          }
          const result=fn(...args), values=Array.isArray(result)?result:result===undefined?[]:[result];
          for(const value of values) {
            if(value===null)lua.lua_pushnil(state);
            else if(typeof value==='string')lua.lua_pushstring(state,bytes(value));
            else if(typeof value==='boolean')lua.lua_pushboolean(state,value);
            else lua.lua_pushnumber(state,value);
          }
          return values.length;
        } catch(error) {return lauxlib.luaL_error(state,bytes(error instanceof Error?error.message:String(error)));}
      });
      lua.lua_setfield(L,-2,bytes(name));
    }
    lua.lua_setglobal(L,bytes('mission'));
    const check=(status:number)=>{if(status!==lua.LUA_OK)throw new Error(to_jsstring(lua.lua_tolstring(L,-1)));};
    check(lauxlib.luaL_loadbufferx(L,bytes(source),bytes(source).length,bytes('mission.lua'),bytes('t')));
    check(lua.lua_pcall(L,0,0,0));
    lua.lua_getglobal(L,bytes(callback));
    if(lua.lua_isnil(L,-1))return;
    if(!lua.lua_isfunction(L,-1))throw new Error(`${callback} must be a function`);
    active=true;
    check(lua.lua_pcall(L,0,0,0));
  } finally {lua.lua_close(L);}
}
/** Syntax checking does not execute authored code. */
export function validateMissionLua(source:string):void {
  const L=lauxlib.luaL_newstate();
  try {const s=bytes(source);if(lauxlib.luaL_loadbufferx(L,s,s.length,bytes('mission.lua'),bytes('t'))!==lua.LUA_OK)throw new Error(to_jsstring(lua.lua_tolstring(L,-1)));}
  finally {lua.lua_close(L);}
}
