/** One identity for UI commands, assistant calls and canvas capture in this tab. */
export const studioClient=sessionStorage.getItem('studio-client')??crypto.randomUUID();
sessionStorage.setItem('studio-client',studioClient);
