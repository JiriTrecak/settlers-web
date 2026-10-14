import {defineInstructions} from 'eve/instructions';
import guide from '../author-spells/SKILL.md?raw';
// SKILL.md is the whole system prompt. Its engine reference (author-spells/reference/*.md) is
// fetched on demand through studio_schema sections `reference` and `reference.<topic>`.
export default defineInstructions({content:guide,role:'system'});
