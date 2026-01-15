-- Drop the existing constraint
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_org_name_unique;

-- Create partial unique index (only for non-deleted rows)
CREATE UNIQUE INDEX roles_org_name_unique ON roles(organization_id, name) WHERE deleted_at IS NULL;
