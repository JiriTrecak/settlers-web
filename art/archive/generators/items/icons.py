"""Generate distinct, editable vector inventory icons from the authored item catalog."""
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from html import escape
ROOT=Path(__file__).resolve().parents[2]
# Each silhouette is purpose-drawn; common framing keeps tiny HUD icons consistent.
shapes=[
'<path d="M45 40h38v13l13 16v35H32V69l13-16z"/><path d="M50 26h28v14H50z"/><path d="M48 77h32M64 61v32" stroke="#fff1c3" stroke-width="9"/>',
'<path d="M52 25h24v24q30 22 17 48t-58 0q-13-26 17-48z"/><path d="M74 62a18 18 0 1 0 4 30 21 21 0 0 1-4-30" fill="#e4f7ff"/>',
'<path d="M43 30h42v18l12 22-5 33H36l-5-33 12-22z"/><path d="M49 64h30v30H49z" fill="#ffe2ad"/><path d="M32 66l-9 9v19l12 8M96 66l9 9v19l-12 8" fill="none"/>',
'<path d="M65 27C20 48 23 101 64 106c40-5 46-52 1-79z"/><path d="M64 99V43m0 27L46 54m18 32 21-25" fill="none" stroke="#e7efae"/>',
'<circle cx="64" cy="69" r="27" fill="none" stroke-width="15"/><path d="m35 57-10-15 20 5m33-6 8-18 4 22m0 46 16 3-11-16M49 93l-8 17-3-22"/>',
'<path d="M64 24 95 40v40l-31 27-31-27V40z"/><path d="M45 41v39l19 15 18-15V42M64 32v57" fill="none"/>',
'<path d="M47 22q17 20 34 0M64 42v18" fill="none"/><ellipse cx="64" cy="79" rx="16" ry="25"/><path d="M50 65Q18 44 31 80l19 5m28-20q32-21 19 15l-19 5"/><circle cx="64" cy="87" r="8" fill="#f6ffa4"/>',
'<path d="m42 31 43 9-7 23 13 12-14 33-40-8 8-26-11-14z"/><path d="m37 48 44 10M42 69l40 12m-43 9 38 9" fill="none" stroke="#dfd9a2"/>',
'<path d="m51 25 31 9-9 44 25 11-3 17H33V88l14-12z"/><path d="m24 68 10-15 6 17 16 7-17 5-8 15-4-19-13-7z"/>',
'<path d="m30 73 29-12 17-29 24 21-27 40-32 7z"/><ellipse cx="82" cy="50" rx="10" ry="6" fill="#152725"/><path d="m29 49-9-13m28 8-1-17m64 47 8 9" fill="none"/>',
'<path d="M35 31h58l-8 73H43z"/><path d="M51 103 58 38m12 63 6-65M37 48l13 16m38-8L77 74" fill="none"/><path d="m63 72-12-11-9 12 20 21 22-24-9-10z" fill="#e6b98a"/>',
'<path d="m30 39 15 10 19-23 19 23 15-10-6 49-28 17-28-17z"/><path d="M40 75h48M50 55l14 22 14-22" fill="none"/>',
'<path d="M32 33h64l-8 37-18 13v15h17v10H41V98h17V83L40 70z"/><ellipse cx="64" cy="36" rx="26" ry="8" fill="#a9e3f0"/>',
'<path d="M40 29q55 5 54 32L78 100 59 111l8-37-26 23 7-33-18 9z"/><path d="m48 42 24 13-4 16" fill="none"/>',
'<path d="M64 24 98 44 87 88l-23 20-23-20-11-44z"/><path d="m64 32-16 20 4 29 12 16 14-21-3-26z" fill="#ffc976"/><path d="m32 45 18 8m45-7-21 6M41 86l13-7m33 8-12-9" fill="none"/>',
'<path d="M49 39V25q15-15 30 0v14M34 45h60v51l-30 13-30-13zM29 41h70"/><path d="m64 51-19 21 19 26 19-26z" fill="#fff3ad"/>',
'<path d="M36 22v88M39 27h58L83 49l14 23H39"/><path d="m60 38 17 12-17 12z" fill="#f1dfa9"/>',
'<path d="m50 27 26 10-6 40 25 12v17H36V83z"/><path d="M41 67Q6 45 24 34l27 21M41 75Q12 71 18 54"/>',
'<path d="M49 22h30v29l19 20-7 35H37l-7-35 19-20z"/><path d="m46 80 18-18 18 18-18 18z" fill="#ede2bc"/><path d="M64 69v21m-10-10h20" fill="none" stroke="#66426a"/>',
'<path d="m64 23 25 21-7 29 19 30H26l20-30-8-29z"/><path d="m47 46 10 5m14 0 10-5M50 72l14 12 14-12m-14 9v21M48 88l-7 13m39-13 7 13" fill="none"/>',
'<path d="m25 35 22 17 17-31 17 31 22-17-10 55H35z"/><path d="M35 91h58v13H35z"/><path d="m64 47 11 18-11 17-11-17z" fill="#f9e7b4"/>',
'<path d="M64 25Q24 31 33 67l20 24-17 16 27-9 27 9-17-17 24-25Q100 28 64 25z"/><path d="M64 42v54m0-21L45 53m19 10 17-19M53 91l-29 9m48-11 32 9" fill="none"/>',
'<path d="M27 27q45 4 36 35L43 99l-14 9 8-39zM101 27q-45 4-36 35l20 37 14 9-8-39z"/>',
'<path d="m64 19 41 28-12 40-29 24-29-24-12-40z"/><path d="m64 32 26 20-9 30-17 15-17-15-9-30z" fill="#42695d"/><path d="M64 45v43m-17-24 17-13 17 13" fill="none" stroke="#f8e9bb"/>',
'<path d="M58 104Q42 71 30 42l8-21 10 6-4 18 21 39 19-39-3-18 10-6 8 21-23 62z"/><path d="m66 25-12 30h16l-9 28 24-39H68l10-19z" fill="#e6fcff"/>',
'<path d="M64 24q-36 15-26 53l26 32 26-32q10-38-26-53z"/><path d="m41 48 38 41m-43-23 41 30M50 35l39 37" fill="none"/><path d="m64 45-8 23 8 19 11-19z" fill="#fff1ab"/>',
'<path d="m49 105 20-63 11 3-17 64z"/><path d="M85 20a24 24 0 1 0 10 38A29 29 0 0 1 85 20z"/><circle cx="66" cy="38" r="7" fill="#eef1ff"/>',
'<path d="M33 20v91M36 28h64L87 48l13 23-34 16-30-13z"/><path d="m55 41 12 10 15-6-10 17-16 4z" fill="#eedcaf"/>',
'<path d="M36 24h56v12H36zm0 73h56v11H36zM43 38q0 17 19 26-19 12-19 30h42q0-18-19-30 19-9 19-26z"/><path d="m48 43 31 0-15 16zm16 31-13 16h26z" fill="#ffe1a1"/>',
'<path d="M64 20v88M26 42l76 44M26 86l76-44M51 28l13 12 13-12M51 100l13-12 13 12M28 55l19 1-2-18M84 94l-3-18 20-1M28 75l19-1-2 18M84 34l-3 18 20 1" fill="none" stroke-width="7"/><path d="m64 45 16 19-16 20-16-20z" fill="#d3f9ff"/>',
]
slugs=['resin-salve','moon-dew','trailkeeper-flask','heartseed','thornband','barkguard','firefly-pendant','mossweave-wraps','quickstep-spurs','scout-whistle','ancient-heartwood','royal-crest','moonwell-chalice','predator-talon','amber-carapace','broodkeeper-lantern','warcaller-standard','stormwing-spurs','restoration-draught','rootbinder-idol','first-queen-crown','worldroot-heart','reaper-mandible','canopy-aegis','tempest-antennae','phoenix-chrysalis','deep-moon-scepter','endless-brood-banner','amber-hourglass','winter-heart']
colors=['#a8bd7a','#72adce','#d2a972','#9aba69','#bd9463','#a8a079','#e5d787','#9bad70','#c9a26b','#ceb98d','#b8a273','#d6b775','#93bcd4','#b7bfa3','#edb46a','#b8d19b','#d49e6b','#a6c8bf','#cba4c7','#99ac75','#e4bf77','#c4ad70','#d0b48c','#e9ca83','#a1d6e4','#f1b36b','#c2b8df','#d5b884','#e9c68b','#aadce7']
defs=json.loads((ROOT/'content/game.json').read_text())['definitions']
for slug,shape,color in zip(slugs,shapes,colors):
 d=next(d for d in defs if d['id']=='item.'+slug);tier=d['itemTier'];border=['#88916d','#7096b5','#d6ac61'][tier-1]
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><title>{escape(d['name'])}</title><defs><radialGradient id="bg"><stop stop-color="#344138"/><stop offset="1" stop-color="#0c1515"/></radialGradient><linearGradient id="metal" x2=".8" y2="1"><stop stop-color="#fff0c8"/><stop offset=".4" stop-color="{color}"/><stop offset="1" stop-color="#5c6250"/></linearGradient></defs><rect x="2" y="2" width="124" height="124" rx="15" fill="url(#bg)" stroke="{border}" stroke-width="3"/><circle cx="64" cy="64" r="47" fill="none" stroke="{color}" opacity=".16"/><g fill="url(#metal)" stroke="#263026" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">{shape}</g><path d="M15 27V15h12m74 0h12v12M15 101v12h12m74 0h12v-12" fill="none" stroke="{border}" stroke-width="2"/></svg>'''
 tree=ET.fromstring(svg)
 for node in tree.iter():
  if node.get('fill')=='none' and node.get('stroke') is None: node.set('stroke',color)
 ET.register_namespace('', 'http://www.w3.org/2000/svg')
 (ROOT/'assets/ui/icons/items-v1'/f'{slug}.svg').write_text(ET.tostring(tree,encoding='unicode'))
print('Generated',len(slugs),'icons')
