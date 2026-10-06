import { Binoculars, Bug, PaperPlaneTilt, Robot, type Icon } from '@phosphor-icons/react';

const HOLDER_ICON: Record<string, Icon> = { acr: Binoculars, fixer: Bug, shipper: PaperPlaneTilt };

/** The icon of the agent holding a PR: the ship track's and the Checks tab's "<holder> has it". */
export const holderIcon = (holder: string): Icon => HOLDER_ICON[holder] ?? Robot;
