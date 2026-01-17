import { eq, and, isNull, sql, asc, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { insurers } from '../../db/schema/index.js';
import { AppError } from '../../errors/index.js';

// =============================================================================
// Interfaces
// =============================================================================

export interface InsurerRow {
  id: string;
  organizationId: string;
  name: string;
  govId: string | null;
  contractNumber: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Queries
// =============================================================================

export const findInsurerById = async (
  insurerId: string,
  organizationId: string
): Promise<InsurerRow | null> => {
  const result = await db
    .select({
      id: insurers.id,
      organizationId: insurers.organizationId,
      name: insurers.name,
      govId: insurers.govId,
      contractNumber: insurers.contractNumber,
      email: insurers.email,
      phone: insurers.phone,
      status: insurers.status,
      createdAt: insurers.createdAt,
      updatedAt: insurers.updatedAt,
    })
    .from(insurers)
    .where(
      and(
        eq(insurers.id, insurerId),
        eq(insurers.organizationId, organizationId),
        isNull(insurers.deletedAt)
      )
    )
    .limit(1);

  return result[0] ?? null;
};

// =============================================================================
// Commands
// =============================================================================

export interface CreateInsurerParams {
  organizationId: string;
  name: string;
  govId?: string;
  contractNumber?: string;
  email?: string;
  phone?: string;
  status?: string;
}

export const createInsurer = async (params: CreateInsurerParams): Promise<InsurerRow> => {
  const result = await db
    .insert(insurers)
    .values({
      organizationId: params.organizationId,
      name: params.name,
      govId: params.govId,
      contractNumber: params.contractNumber,
      email: params.email,
      phone: params.phone,
      status: params.status ?? 'active',
    })
    .returning({
      id: insurers.id,
      organizationId: insurers.organizationId,
      name: insurers.name,
      govId: insurers.govId,
      contractNumber: insurers.contractNumber,
      email: insurers.email,
      phone: insurers.phone,
      status: insurers.status,
      createdAt: insurers.createdAt,
      updatedAt: insurers.updatedAt,
    });

  const insurer = result[0];
  if (!insurer) throw new AppError('Failed to create insurer', 500, 'DB_INSERT_FAILED');
  return insurer;
};

export interface UpdateInsurerParams {
  name?: string;
  govId?: string | null;
  contractNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
}

export const updateInsurer = async (
  insurerId: string,
  organizationId: string,
  params: UpdateInsurerParams
): Promise<InsurerRow> => {
  const result = await db
    .update(insurers)
    .set({
      ...(params.name !== undefined && { name: params.name }),
      ...(params.govId !== undefined && { govId: params.govId }),
      ...(params.contractNumber !== undefined && { contractNumber: params.contractNumber }),
      ...(params.email !== undefined && { email: params.email }),
      ...(params.phone !== undefined && { phone: params.phone }),
      ...(params.status !== undefined && { status: params.status }),
    })
    .where(
      and(
        eq(insurers.id, insurerId),
        eq(insurers.organizationId, organizationId),
        isNull(insurers.deletedAt)
      )
    )
    .returning({
      id: insurers.id,
      organizationId: insurers.organizationId,
      name: insurers.name,
      govId: insurers.govId,
      contractNumber: insurers.contractNumber,
      email: insurers.email,
      phone: insurers.phone,
      status: insurers.status,
      createdAt: insurers.createdAt,
      updatedAt: insurers.updatedAt,
    });

  const insurer = result[0];
  if (!insurer) throw new AppError('Failed to update insurer', 500, 'DB_UPDATE_FAILED');
  return insurer;
};

// =============================================================================
// List
// =============================================================================

export interface ListInsurersParams {
  organizationId: string;
  page: number;
  limit: number;
  status?: string;
  search?: string;
  sortBy: 'name' | 'status' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

export interface ListInsurersResult {
  insurers: InsurerRow[];
  total: number;
}

export const listInsurers = async (params: ListInsurersParams): Promise<ListInsurersResult> => {
  const { organizationId, page, limit, status, search, sortBy, sortOrder } = params;
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = [
    eq(insurers.organizationId, organizationId),
    isNull(insurers.deletedAt),
  ];

  if (status !== undefined) {
    conditions.push(eq(insurers.status, status));
  }

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(sql`${insurers.name} ILIKE ${searchPattern}`);
  }

  const whereClause = and(...conditions);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(insurers)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  // Get paginated results
  const sortColumn =
    sortBy === 'name' ? insurers.name : sortBy === 'status' ? insurers.status : insurers.createdAt;
  const orderDirection = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const result = await db
    .select({
      id: insurers.id,
      organizationId: insurers.organizationId,
      name: insurers.name,
      govId: insurers.govId,
      contractNumber: insurers.contractNumber,
      email: insurers.email,
      phone: insurers.phone,
      status: insurers.status,
      createdAt: insurers.createdAt,
      updatedAt: insurers.updatedAt,
    })
    .from(insurers)
    .where(whereClause)
    .orderBy(orderDirection, asc(insurers.id))
    .limit(limit)
    .offset(offset);

  return { insurers: result, total };
};

// =============================================================================
// Delete
// =============================================================================

export const hasInsurerRelatedData = async (
  insurerId: string,
  organizationId: string
): Promise<{ hasProducts: boolean; hasStatements: boolean }> => {
  // Check products
  const productsResult = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM products
      WHERE insurer_id = ${insurerId}
        AND organization_id = ${organizationId}
        AND deleted_at IS NULL
      LIMIT 1
    ) AS has_data
  `);
  const hasProducts = productsResult[0]?.['has_data'] === true;

  // Check commission statements
  const statementsResult = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM commission_statements
      WHERE insurer_id = ${insurerId}
        AND organization_id = ${organizationId}
        AND deleted_at IS NULL
      LIMIT 1
    ) AS has_data
  `);
  const hasStatements = statementsResult[0]?.['has_data'] === true;

  return { hasProducts, hasStatements };
};

export const softDeleteInsurer = async (
  insurerId: string,
  organizationId: string
): Promise<void> => {
  await db
    .update(insurers)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(insurers.id, insurerId),
        eq(insurers.organizationId, organizationId),
        isNull(insurers.deletedAt)
      )
    );
};
