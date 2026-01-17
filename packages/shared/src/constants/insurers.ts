export const INSURER_STATUSES = ['active', 'inactive'] as const;
export type InsurerStatus = (typeof INSURER_STATUSES)[number];
