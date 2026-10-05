/** Command icons and model thumbnails share this runtime contract. Effect textures do not. */
export const COMMAND_ICON_SIZE = 128;

export function validateCommandIcon(id: string, file: string, bytes: Buffer) {
  if (!file.endsWith('.png')) throw Error(`${id}: icon must be a project PNG`);
  if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a')
    throw Error(`${id}: invalid PNG image`);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width !== height || width < 1 || width > COMMAND_ICON_SIZE)
    throw Error(`${id}: icons must be square and at most ${COMMAND_ICON_SIZE}px`);
}
