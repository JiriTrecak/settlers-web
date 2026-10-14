# Spell first-cast benchmark

With the game dev server running, open `/scripts/bench/spell-effects/index.html` and run the benchmark. Reload between comparisons; avoid other browser interaction during the run. It prepares actual published effects, then measures first and repeat casts of Holy Light, Blizzard, Carapace, Crownfall, Uproot and Inferno.

Creation CPU is separate from the maximum update/render-submit CPU. Frame interval includes browser scheduling; neither is a GPU timer. Effect draw count subtracts the 13 static scene draws. The raw JSON retains total draws. New shader programs and resource requests should both remain zero after preparation.

This is an isolated rendering regression bench, not a full-match performance claim. Verify normal casts in a four-player match using the game's ten-second budget capture as well. Do not request snapshots or take screenshots during that capture: debugging work can itself interrupt frames. Compare shader timings with the capture window because the debug history can include earlier links.
