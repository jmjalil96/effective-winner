import type { User } from '@crm/shared';

export function App() {
  const user: User = {
    id: crypto.randomUUID(),
    email: 'test@example.com',
    name: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return (
    <div>
      <h1>CRM</h1>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </div>
  );
}
