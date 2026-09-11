/** Fengari's Node detection must be resolved while bundling its CommonJS files.
 * A global process polyfill makes it load filesystem/IO modules in the browser.
 * Keep the adjustment scoped to Fengari, in both dev optimization and production.
 */
export function fengariBrowser() {
  return {name:'fengari-browser',
    transform(code:string,id:string){
      if(!id.replaceAll('\\','/').includes('/node_modules/fengari/src/'))return;
      return {code:code.replaceAll('process.env.FENGARICONF','undefined').replaceAll('typeof process','"undefined"'),map:null};
    },
  };
}
