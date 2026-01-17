export const CLIENT_TYPES = ['individual', 'business'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const CLIENT_STATUSES = ['active', 'inactive'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

// Separate GOV_ID_TYPES per client type for schema validation
export const CLIENT_GOV_ID_TYPES_INDIVIDUAL = ['ruc_individual', 'cedula', 'pasaporte'] as const;
export const CLIENT_GOV_ID_TYPES_BUSINESS = ['ruc_empresa'] as const;
export const CLIENT_GOV_ID_TYPES = ['ruc_individual', 'cedula', 'pasaporte', 'ruc_empresa'] as const;
export type ClientGovIdType = (typeof CLIENT_GOV_ID_TYPES)[number];

export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];
