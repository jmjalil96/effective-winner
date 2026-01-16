declare global {
  namespace Express {
    interface Request {
      ctx?: {
        user: {
          id: string;
          email: string;
        };
        organization: {
          id: string;
          name: string;
          slug: string;
        };
        role: {
          id: string;
          name: string;
        };
        permissions: string[];
        session: {
          id: string;
          expiresAt: Date;
        };
      };
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
