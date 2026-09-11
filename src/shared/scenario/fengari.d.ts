declare module 'fengari' {
  export const lua:any;
  export const lauxlib:any;
  export function to_luastring(s:string):Uint8Array;
  export function to_jsstring(s:Uint8Array):string;
}
