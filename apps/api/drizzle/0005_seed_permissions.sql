INSERT INTO permissions (id, name, description) VALUES
  (gen_random_uuid(), 'roles:read', 'View roles and permissions'),
  (gen_random_uuid(), 'roles:write', 'Create and update roles'),
  (gen_random_uuid(), 'roles:delete', 'Delete roles'),
  (gen_random_uuid(), 'invitations:read', 'View pending invitations'),
  (gen_random_uuid(), 'invitations:create', 'Send invitations'),
  (gen_random_uuid(), 'invitations:delete', 'Revoke invitations')
ON CONFLICT (name) DO NOTHING;
