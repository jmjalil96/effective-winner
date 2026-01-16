export const GOV_ID_TYPES = ['cedula', 'pasaporte', 'ruc'] as const;
export type GovIdType = (typeof GOV_ID_TYPES)[number];

export const AGENT_STATUSES = ['active', 'inactive'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
