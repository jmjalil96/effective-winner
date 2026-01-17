export const CLIENT_ERRORS = {
  CLIENT_NOT_FOUND: 'Client not found',
  ACCOUNT_NOT_FOUND: 'Account not found',
  EMAIL_EXISTS: 'A client with this email already exists',
  GOV_ID_EXISTS: 'A client with this government ID already exists',
  INVALID_GOV_ID_TYPE: 'Invalid government ID type for this client type',
  TYPE_CHANGE_MISSING_FIELDS: 'Missing required fields for client type change',
  CANNOT_DELETE_WITH_DATA: 'Cannot delete client with associated data',
} as const;
