import {
  Color,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from "three";
import { PLAYER_COLORS } from "../../shared";

/** The only authored material opted into runtime player coloring. Exact, case-sensitive. */
export const TEAM_COLOR_MATERIAL = "TC_TeamColor";

export function applyPlayerMaterial(
  material: MeshStandardMaterial,
  playerColor: Color,
): void {
  if (material.name !== TEAM_COLOR_MATERIAL) return;
  material.userData.authoredPlayerColor ??= material.color.toArray();
  material.color.copy(playerColor);
}

export function applyPlayerMaterials(root: Object3D, owner: number): void {
  if (root.userData.materialOwner === owner) return;
  const color = new Color(
    PLAYER_COLORS[Math.max(0, owner) % PLAYER_COLORS.length]!,
  );
  root.traverse((child) => {
    if (child instanceof Mesh)
      for (const material of Array.isArray(child.material)
        ? child.material
        : [child.material]) {
        if (material instanceof MeshStandardMaterial) {
          if (owner < 0) {
            if (material.userData.authoredPlayerColor)
              material.color.fromArray(material.userData.authoredPlayerColor);
          } else applyPlayerMaterial(material, color);
        }
      }
  });
  root.userData.materialOwner = owner;
}
