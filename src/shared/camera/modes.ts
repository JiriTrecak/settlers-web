export const UNIT_CAMERA_MODES=['rts','third-person','first-person'] as const;
export type UnitCameraMode=typeof UNIT_CAMERA_MODES[number];
export const cameraModeName:Record<UnitCameraMode,string>={'rts':'RTS','third-person':'Third person','first-person':'First person'};
export function nextCameraMode(mode:UnitCameraMode):UnitCameraMode{return UNIT_CAMERA_MODES[(UNIT_CAMERA_MODES.indexOf(mode)+1)%3]!;}
