const { createPrismaMock, createRes, createReq } = require('./helpers/mockPrisma');

const mockPrisma = createPrismaMock();
jest.mock('../src/config/db', () => mockPrisma);

const specialistsController = require('../src/controllers/specialistsController');

function specialist(overrides = {}) {
  return {
    id: 'spec-1',
    name: 'د. سارة',
    title: 'أخصائية نفسية',
    specialty: 'قلق وتوتر',
    expYears: 8,
    rating: 4.9,
    price: 300,
    gender: 'female',
    status: 'active',
    ...overrides
  };
}

describe('specialistsController.getSpecialists', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
    mockPrisma.specialist.findMany.mockResolvedValue([specialist()]);
  });

  it('returns active specialists with mapped experience_years and default slots', async () => {
    const req = createReq({ query: {} });
    await specialistsController.getSpecialists(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.specialists[0].experience_years).toBe(8);
    expect(res.body.specialists[0].slots).toHaveLength(4);

    const where = mockPrisma.specialist.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ status: 'active' });
  });

  it('applies a gender filter when a specific gender is requested', async () => {
    const req = createReq({ query: { gender: 'female' } });
    await specialistsController.getSpecialists(req, res, next);

    const where = mockPrisma.specialist.findMany.mock.calls[0][0].where;
    expect(where.gender).toBe('female');
  });

  it.each(['all', 'any'])('ignores the "%s" gender value', async (gender) => {
    const req = createReq({ query: { gender } });
    await specialistsController.getSpecialists(req, res, next);

    const where = mockPrisma.specialist.findMany.mock.calls[0][0].where;
    expect(where.gender).toBeUndefined();
  });

  it('adds an OR search clause across name, title and specialty', async () => {
    const req = createReq({ query: { search: 'قلق' } });
    await specialistsController.getSpecialists(req, res, next);

    const where = mockPrisma.specialist.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: 'قلق' } },
      { title: { contains: 'قلق' } },
      { specialty: { contains: 'قلق' } }
    ]);
  });

  it('orders results by rating descending', async () => {
    await specialistsController.getSpecialists(createReq({ query: {} }), res, next);
    expect(mockPrisma.specialist.findMany.mock.calls[0][0].orderBy).toEqual({ rating: 'desc' });
  });

  it('returns count 0 and an empty array when no specialists match (edge case)', async () => {
    mockPrisma.specialist.findMany.mockResolvedValue([]);
    await specialistsController.getSpecialists(createReq({ query: {} }), res, next);

    expect(res.body.count).toBe(0);
    expect(res.body.specialists).toEqual([]);
  });

  it('delegates database errors to next()', async () => {
    mockPrisma.specialist.findMany.mockRejectedValue(new Error('db error'));
    await specialistsController.getSpecialists(createReq({ query: {} }), res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('specialistsController.getSpecialistById', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  it('returns the specialist with mapped experience_years and slots', async () => {
    mockPrisma.specialist.findUnique.mockResolvedValue(specialist());

    const req = createReq({ params: { id: 'spec-1' } });
    await specialistsController.getSpecialistById(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.specialist.id).toBe('spec-1');
    expect(res.body.specialist.experience_years).toBe(8);
    expect(res.body.specialist.slots).toHaveLength(4);
    expect(mockPrisma.specialist.findUnique).toHaveBeenCalledWith({ where: { id: 'spec-1' } });
  });

  it('returns 404 when the specialist is not found', async () => {
    mockPrisma.specialist.findUnique.mockResolvedValue(null);

  const req = createReq({ params: { id: 'missing' } });
  await specialistsController.getSpecialistById(req, res, next);

  expect(res.status).toHaveBeenCalledWith(404);
  expect(res.body.success).toBe(false);
});

it('delegates database errors to next()', async () => {
  mockPrisma.specialist.findUnique.mockRejectedValue(new Error('db error'));
  const req = createReq({ params: { id: 'spec-1' } });
  await specialistsController.getSpecialistById(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.any(Error));
});
});
