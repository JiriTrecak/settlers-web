import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// The supplied sheets each show five views. Tripo receives only the isolated
// frontal figure; paired sheets are split into their two different species.
const sheets = '/Users/jiritrecak/Desktop/creeps-to-implement';
const output = path.resolve('.asset-work/build/neutral-creeps');
const crop = (top, bottom, left = 8, right = 352) => ({ left, top, width: right - left, height: bottom - top });
const creatures = [
  ['thorn-slinger', '22_01_18-1', crop(275, 670, 45, 320)],
  ['dew-sprite', '22_01_19-2', crop(270, 690, 55, 320)],
  ['puddle-wisp', '22_01_20-3', crop(265, 695, 50, 325)],
  ['webling', '22_01_22-4', crop(250, 695, 30, 345)],
  ['spitter', '22_01_23-5', crop(320, 630, 20, 330)],
  ['capling', '22_01_24-6', crop(245, 700, 30, 350)],
  ['puffcap', '22_01_26-7', crop(245, 700, 30, 350)],
  ['rootling', '22_01_37-1', crop(90, 387)],
  ['twigcaster', '22_01_37-1', crop(525, 840)],
  ['old-root', '22_01_38-2', crop(128, 432)],
  ['barkguard', '22_01_38-2', crop(550, 870)],
  ['hornet-guard', '22_01_40-3', crop(148, 390)],
  ['needle-wasp', '22_01_40-3', crop(570, 833)],
  ['nest-mother', '22_01_41-4', crop(108, 390)],
  ['tree-frog', '22_01_41-4', crop(570, 825)],
  ['young-toad', '22_01_43-5', crop(165, 410)],
  ['tadpole-spirit', '22_01_43-5', crop(590, 842)],
  ['briar-hulk', '22_01_45-6', crop(155, 452)],
  ['seedcaster', '22_01_45-6', crop(595, 875)],
  ['bloom-witch', '22_01_47-7', crop(140, 445)],
  ['willow-wisp', '22_01_47-7', crop(570, 850)],
  ['hollow-stag', '22_01_48-8', crop(205, 755)],
  ['rotwood-ancient', '22_01_49-9', crop(140, 460)],
  ['root-seer', '22_01_49-9', crop(590, 855)],
  ['corrupted-rootbeast', '22_01_51-10', crop(140, 455)],
  ['violet-sporeling', '22_01_51-10', crop(580, 845)],
];

fs.mkdirSync(output, { recursive: true });
const manifest = [];
for (const [slug, key, rect] of creatures) {
  const name = fs.readdirSync(sheets).find((file) => file.endsWith(`${key}.png`));
  if (!name) throw new Error(`Missing sheet: ${key}`);
  const dir = path.join(output, slug);
  fs.mkdirSync(dir, { recursive: true });
  const destination = path.join(dir, 'reference.png');
  await sharp(path.join(sheets, name))
    .extract(rect)
    .resize(768, 768, { fit: 'contain', background: '#202020', withoutEnlargement: false })
    .png()
    .toFile(destination);
  manifest.push({ slug, source: name, crop: rect, reference: destination });
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${manifest.length} frontal references in ${output}`);
