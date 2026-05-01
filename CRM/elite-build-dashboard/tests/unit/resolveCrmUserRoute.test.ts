import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/auth/resolve-crm-user/route';

type DocData = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  type StoredCollections = Map<string, Map<string, DocData>>;
  type DocRefLike = {
    collectionName: string;
    id: string;
    get: () => Promise<{ exists: boolean; data: () => DocData | undefined }>;
    update: (data: DocData) => Promise<void>;
  };

  const collections: StoredCollections = new Map();

  function collectionStore(name: string): Map<string, DocData> {
    let store = collections.get(name);
    if (!store) {
      store = new Map();
      collections.set(name, store);
    }
    return store;
  }

  function snapshot(data: DocData | undefined) {
    return {
      exists: Boolean(data),
      data: () => data,
    };
  }

  function docRef(collectionName: string, id: string): DocRefLike {
    return {
      collectionName,
      id,
      async get() {
        return snapshot(collectionStore(collectionName).get(id));
      },
      async update(data: DocData) {
        const existing = collectionStore(collectionName).get(id) || {};
        collectionStore(collectionName).set(id, { ...existing, ...data });
      },
    };
  }

  function queryDoc(collectionName: string, id: string, data: DocData) {
    return {
      id,
      ref: docRef(collectionName, id),
      data: () => data,
    };
  }

  const adminDb = {
    collection: vi.fn((name: string) => ({
      doc: (id: string) => docRef(name, id),
      where: (field: string, op: string, value: unknown) => ({
        async get() {
          if (op !== '==') throw new Error(`Unsupported mock query op: ${op}`);
          const docs = [...collectionStore(name).entries()]
            .filter(([, data]) => data[field] === value)
            .map(([id, data]) => queryDoc(name, id, data));
          return { docs };
        },
      }),
    })),
    runTransaction: vi.fn(async (fn: (transaction: {
      get: (ref: DocRefLike) => Promise<{ exists: boolean; data: () => DocData | undefined }>;
      set: (ref: DocRefLike, data: DocData) => void;
      delete: (ref: DocRefLike) => void;
    }) => Promise<void>) => {
      await fn({
        get: (ref) => ref.get(),
        set: (ref, data) => {
          collectionStore(ref.collectionName).set(ref.id, data);
        },
        delete: (ref) => {
          collectionStore(ref.collectionName).delete(ref.id);
        },
      });
    }),
  };

  return {
    adminAuth: { verifyIdToken: vi.fn() },
    adminDb,
    reset() {
      collections.clear();
      adminDb.collection.mockClear();
      adminDb.runTransaction.mockClear();
    },
    seed(collectionName: string, id: string, data: DocData) {
      collectionStore(collectionName).set(id, data);
    },
    get(collectionName: string, id: string) {
      return collectionStore(collectionName).get(id);
    },
    has(collectionName: string, id: string) {
      return collectionStore(collectionName).has(id);
    },
  };
});

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: mocks.adminAuth,
  adminDb: mocks.adminDb,
}));

vi.mock('@/lib/api/rateLimit', () => ({
  enforceRateLimit: vi.fn(() => null),
}));

function requestWithToken(token?: string): Request {
  return new Request('https://crm.test/api/auth/resolve-crm-user', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

function mockDecodedToken(overrides: Record<string, unknown> = {}) {
  mocks.adminAuth.verifyIdToken.mockResolvedValue({
    uid: 'u1',
    email: 'u1@test.local',
    name: 'Test User',
    picture: 'https://example.com/avatar.png',
    ...overrides,
  });
}

async function post(token = 'valid-token') {
  const response = await POST(requestWithToken(token) as Parameters<typeof POST>[0]);
  return {
    response,
    body: await response.json(),
  };
}

beforeEach(() => {
  mocks.reset();
  mocks.adminAuth.verifyIdToken.mockReset();
});

describe('/api/auth/resolve-crm-user', () => {
  it('denies requests without a Firebase ID token', async () => {
    const response = await POST(requestWithToken() as Parameters<typeof POST>[0]);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Authentication required.');
    expect(mocks.adminAuth.verifyIdToken).not.toHaveBeenCalled();
  });

  it('denies invalid Firebase ID tokens', async () => {
    mocks.adminAuth.verifyIdToken.mockRejectedValue(new Error('bad token'));

    const { response, body } = await post('invalid-token');

    expect(response.status).toBe(401);
    expect(body.error).toBe('Failed to resolve CRM user.');
  });

  it('returns an existing active CRM user', async () => {
    mockDecodedToken();
    mocks.seed('users', 'u1', {
      email: 'u1@test.local',
      name: 'Existing User',
      role: 'sales_exec',
      active: true,
      created_at: null,
    });

    const { response, body } = await post();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      uid: 'u1',
      email: 'u1@test.local',
      name: 'Existing User',
      role: 'sales_exec',
      active: true,
    });
  });

  it('denies an inactive CRM user', async () => {
    mockDecodedToken();
    mocks.seed('users', 'u1', {
      email: 'u1@test.local',
      name: 'Inactive User',
      role: 'admin',
      active: false,
      created_at: null,
    });

    const { response, body } = await post();

    expect(response.status).toBe(403);
    expect(body.error).toBe('CRM user is inactive.');
  });

  it('self-heals the root superadmin role and active flag', async () => {
    mockDecodedToken({ uid: 'root_uid', email: 'devensuji@gmail.com' });
    mocks.seed('users', 'root_uid', {
      email: 'devensuji@gmail.com',
      name: 'Root User',
      role: 'viewer',
      active: false,
      created_at: null,
    });

    const { response, body } = await post();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      uid: 'root_uid',
      role: 'superadmin',
      active: true,
    });
    expect(mocks.get('users', 'root_uid')).toMatchObject({
      role: 'superadmin',
      active: true,
    });
  });

  it('migrates a pending CRM profile into the real Firebase UID doc', async () => {
    mockDecodedToken({
      uid: 'newhire_uid',
      email: 'newhire@test.local',
      name: 'New Hire Google',
    });
    mocks.seed('crm_config', '_user_count', { count: 1 });
    mocks.seed('users', 'pending_newhire_test_local', {
      email: 'newhire@test.local',
      name: 'New Hire',
      role: 'admin',
      active: true,
      pending_registration: true,
      created_at: null,
    });

    const { response, body } = await post();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      uid: 'newhire_uid',
      email: 'newhire@test.local',
      name: 'New Hire',
      role: 'admin',
      active: true,
    });
    expect(mocks.get('users', 'newhire_uid')).toMatchObject({
      uid: 'newhire_uid',
      email: 'newhire@test.local',
      role: 'admin',
    });
    expect(mocks.has('users', 'pending_newhire_test_local')).toBe(false);
  });

  it('finds legacy mixed-case pending docs by normalized email query', async () => {
    mockDecodedToken({
      uid: 'elitebuild_uid',
      email: 'elitebuildinfratech@gmail.com',
      name: 'EliteBuild',
    });
    mocks.seed('crm_config', '_user_count', { count: 1 });
    mocks.seed('users', 'pending_EliteBuildInfraTech_gmail_com', {
      email: 'elitebuildinfratech@gmail.com',
      name: 'EliteBuild',
      role: 'admin',
      active: true,
      pending_registration: true,
      created_at: null,
    });

    const { response, body } = await post();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      uid: 'elitebuild_uid',
      role: 'admin',
    });
    expect(mocks.has('users', 'pending_EliteBuildInfraTech_gmail_com')).toBe(false);
  });

  it('bootstraps the first CRM user as superadmin', async () => {
    mockDecodedToken({
      uid: 'first_uid',
      email: 'first@test.local',
      name: 'First User',
    });

    const { response, body } = await post();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      uid: 'first_uid',
      email: 'first@test.local',
      role: 'superadmin',
      active: true,
    });
    expect(mocks.get('crm_config', '_user_count')).toEqual({ count: 1 });
  });

  it('denies a non-root user with no CRM profile after bootstrap exists', async () => {
    mockDecodedToken({
      uid: 'unknown_uid',
      email: 'unknown@test.local',
    });
    mocks.seed('crm_config', '_user_count', { count: 1 });

    const { response, body } = await post();

    expect(response.status).toBe(403);
    expect(body.error).toBe('No active CRM profile found.');
  });

  it('denies Google accounts without an email address', async () => {
    mockDecodedToken({
      uid: 'no_email_uid',
      email: undefined,
    });

    const { response, body } = await post();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Google account email is required.');
  });
});
