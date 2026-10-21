const { createPrismaMock } = require('./helpers/mockPrisma');

const mockPrisma = createPrismaMock();
jest.mock('../src/config/db', () => mockPrisma);

// Silence console logs
jest.spyOn(console, 'log').mockImplementation(() => { });
jest.spyOn(console, 'error').mockImplementation(() => { });

const B2bService = require('../src/services/b2bService');
const AuditService = require('../src/services/auditService');

describe('B2bService - Corporate Application Management & Anti-Abuse', () => {
  const validData = {
    userId: 'user-123',
    companyName: 'شركة الأفق للتقنية',
    companyPhone: '+962791112233',
    companyEmail: 'hr@alofoq.demo',
    employeesCount: '50-100 موظف',
    user: { id: 'user-123', role: 'user' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.b2bRequest.findFirst.mockResolvedValue(null);
    mockPrisma.b2bRequest.count.mockResolvedValue(0);
    mockPrisma.b2bRequest.create.mockImplementation(async ({ data }) => ({
      id: 'req-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data
    }));
    mockPrisma.b2bRequest.update.mockImplementation(async ({ where, data }) => ({
      id: where.id,
      companyName: validData.companyName,
      companyPhone: validData.companyPhone,
      companyEmail: validData.companyEmail,
      employeesCount: validData.employeesCount,
      ...data
    }));
    mockPrisma.b2bRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      ...validData,
      status: 'pending'
    });
    mockPrisma.company.upsert.mockResolvedValue({ id: 'comp-1' });
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  describe('createRequest (Anti-abuse & Rate Limiting)', () => {
    it('creates a new pending B2B request successfully', async () => {
      const result = await B2bService.createRequest(validData);

      expect(result.success).toBe(true);
      expect(result.request).toMatchObject({
        companyName: 'شركة الأفق للتقنية',
        companyEmail: 'hr@alofoq.demo',
        employeesCount: '50-100 موظف',
        status: 'pending'
      });
      expect(mockPrisma.b2bRequest.create).toHaveBeenCalledTimes(1);
    });

    it('rejects submission if user already has an active pending request', async () => {
      mockPrisma.b2bRequest.findFirst.mockResolvedValueOnce({
        id: 'existing-pending-1',
        status: 'pending'
      });

      await expect(B2bService.createRequest(validData)).rejects.toMatchObject({
        message: expect.stringContaining('لديك طلب شراكة قيد المراجعة بالفعل'),
        statusCode: 400
      });

      expect(mockPrisma.b2bRequest.create).not.toHaveBeenCalled();
    });

    it('rejects submission if user has already submitted 3 requests in the last 24 hours (rate limit)', async () => {
      mockPrisma.b2bRequest.findFirst.mockResolvedValueOnce(null); // No pending
      mockPrisma.b2bRequest.count.mockResolvedValueOnce(3); // 3 requests in last 24h

      await expect(B2bService.createRequest(validData)).rejects.toMatchObject({
        message: expect.stringContaining('تم تجاوز الحد الأقصى لتقديم طلبات الشركات'),
        statusCode: 429
      });

      expect(mockPrisma.b2bRequest.create).not.toHaveBeenCalled();
    });

    it('rejects submission if user was rejected less than 1 hour ago (cooldown period)', async () => {
      const halfHourAgo = new Date(Date.now() - 30 * 60 * 1000);
      mockPrisma.b2bRequest.findFirst
        .mockResolvedValueOnce(null) // pending check -> null
        .mockResolvedValueOnce({ id: 'rej-1', status: 'rejected', reviewedAt: halfHourAgo }); // rejection check

      await expect(B2bService.createRequest(validData)).rejects.toMatchObject({
        message: expect.stringMatching(/يرجى الانتظار \d+ دقيقة قبل إعادة تقديم الطلب/),
        statusCode: 400
      });

      expect(mockPrisma.b2bRequest.create).not.toHaveBeenCalled();
    });

    it('allows submission if user was rejected more than 1 hour ago', async () => {
      const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
      mockPrisma.b2bRequest.findFirst
        .mockResolvedValueOnce(null) // pending check -> null
        .mockResolvedValueOnce({ id: 'rej-1', status: 'rejected', reviewedAt: twoHoursAgo }); // rejection check

      const result = await B2bService.createRequest(validData);
      expect(result.success).toBe(true);
      expect(mockPrisma.b2bRequest.create).toHaveBeenCalledTimes(1);
    });

    it('records an audit log entry on request submission', async () => {
      const logSpy = jest.spyOn(AuditService, 'log');

      await B2bService.createRequest(validData);

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'B2B_REQUEST_CREATED',
          result: 'SUCCESS',
          metadata: expect.objectContaining({
            companyName: 'شركة الأفق للتقنية',
            companyEmail: 'hr@alofoq.demo'
          })
        })
      );
    });
  });

  describe('getMyRequests', () => {
    it('returns requests for the given userId ordered by date desc', async () => {
      const mockList = [
        { id: 'req-2', status: 'approved' },
        { id: 'req-1', status: 'rejected' }
      ];
      mockPrisma.b2bRequest.findMany.mockResolvedValue(mockList);

      const result = await B2bService.getMyRequests('user-123');

      expect(result).toBe(mockList);
      expect(mockPrisma.b2bRequest.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' }
      });
    });
  });

  describe('reviewRequest (Admin Approval/Rejection)', () => {
    it('approves a request, sets reviewer details, and creates a Company record', async () => {
      const logSpy = jest.spyOn(AuditService, 'log');

      const result = await B2bService.reviewRequest({
        requestId: 'req-1',
        adminId: 'admin-1',
        status: 'approved',
        reviewNote: 'شركة مؤهلة ومطابقة للشروط',
        adminUser: { id: 'admin-1', role: 'admin' }
      });

      expect(result.success).toBe(true);
      expect(result.request.status).toBe('approved');
      expect(result.request.reviewedBy).toBe('admin-1');

      // Company upsert triggered
      expect(mockPrisma.company.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'hr@alofoq.demo' },
          create: expect.objectContaining({
            name: 'شركة الأفق للتقنية',
            email: 'hr@alofoq.demo',
            status: 'active'
          })
        })
      );

      // Audit log recorded
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'B2B_REQUEST_REVIEWED',
          result: 'SUCCESS'
        })
      );
    });

    it('rejects a request with a reviewNote and does not create a company record', async () => {
      const result = await B2bService.reviewRequest({
        requestId: 'req-1',
        adminId: 'admin-1',
        status: 'rejected',
        reviewNote: 'البيانات غير مكتملة',
        adminUser: { id: 'admin-1', role: 'admin' }
      });

      expect(result.success).toBe(true);
      expect(result.request.status).toBe('rejected');
      expect(result.request.reviewNote).toBe('البيانات غير مكتملة');
      expect(mockPrisma.company.upsert).not.toHaveBeenCalled();
    });

    it('throws 404 when request is not found', async () => {
      mockPrisma.b2bRequest.findUnique.mockResolvedValue(null);

      await expect(
        B2bService.reviewRequest({
          requestId: 'missing-id',
          adminId: 'admin-1',
          status: 'approved'
        })
      ).rejects.toMatchObject({
        statusCode: 404
      });
    });
  });
});
