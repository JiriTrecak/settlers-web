import { Color, Mesh, MeshStandardMaterial, SRGBColorSpace, type Object3D } from 'three';
import { PLAYER_COLORS } from '../../shared';

/** Recolor authored faction surfaces without flattening the roof/chitin palette. */
export function applyPlayerMaterial(material: MeshStandardMaterial, playerColor: Color): void {
  const flag = material.name === 'UTC Team color' || material.name === 'Ant faction red';
  const shell = /^Ant carapace roof \d+$/.test(material.name)
    || material.name === 'Ant rust chitin' || material.name === 'Ant chitin planes';
  if (!flag && !shell) return;
  if (flag) { material.color.copy(playerColor); return; }
  // Save the authored color once so capture/reassignment never compounds the tint.
  const original = material.userData.authoredPlayerColor ??= material.color.toArray();
  const source = new Color().fromArray(original).getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);
  const target = playerColor.getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);
  material.color.setHSL(target.h, source.s * target.s, source.l, SRGBColorSpace);
}

export function applyPlayerMaterials(root: Object3D, owner: number): void {
  if (owner<0 || root.userData.materialOwner === owner) return;
  const color = new Color(PLAYER_COLORS[owner % PLAYER_COLORS.length]!);
  root.traverse(child => {
    if (child instanceof Mesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (material instanceof MeshStandardMaterial) applyPlayerMaterial(material, color);
    }
  });
  root.userData.materialOwner = owner;
}
