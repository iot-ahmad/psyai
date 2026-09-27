const { createPrismaMock, createRes, createReq } = require('./helpers/mockPrisma');

const mockPrisma = createPrismaMock();
jest.mock('../src/config/db', () => mockPrisma);

// Silence logs
jest.spyOn(console, 'log').mockImplementation(() => { });
jest.spyOn(console, 'error').mockImplementation(() => { });

const b2bController = require('../src/controllers/b2bController');
const B2bService = require('../src/services/b2bService');

describe('b2bController', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createRes();
    next = jest.fn();
  });

  describe('submitRequest', () => {
    it('returns 201 on successful submission', async () => {
      const mockResult = {
        success: true,
        message: 'تم إرسال طلب اعتماد الشركة بنجاح',
        request: { id: 'req-1' }
      };
      jest.spyOn(B2bService, 'createRequest').mockResolvedValue(mockResult);

      const req = createReq({
        body: {
          companyName: 'زين',
          companyPhone: '+962791234567',
          companyEmail: 'hr@zain.demo',
          employeesCount: '150'
        },
        user: { id: 'user-1' }
      });

      await b2bController.submitRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body.success).toBe(true);
    });

    it('returns error status code when service throws', async () => {
      const err = new Error('لديك طلب قيد المراجعة');
      err.statusCode = 400;
      jest.spyOn(B2bService, 'createRequest').mockRejectedValue(err);

      const req = createReq({
        body: { companyName: 'زين' },
        user: { id: 'user-1' }
      });

      await b2bController.submitRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('لديك طلب قيد المراجعة');
    });
  });

  describe('getMyRequests', () => {
    it('returns 200 with list of user requests', async () => {
      const mockRequests = [{ id: 'req-1' }, { id: 'req-2' }];
      jest.spyOn(B2bService, 'getMyRequests').mockResolvedValue(mockRequests);

      const req = createReq({ user: { id: 'user-1' } });
      await b2bController.getMyRequests(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.requests).toBe(mockRequests);
    });
  });

  describe('getAdminRequests', () => {
    it('returns 403 when non-admin accesses', async () => {
      const req = createReq({ user: { id: 'user-1', role: 'user' } });
      await b2bController.getAdminRequests(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with requests for admin', async () => {
      const mockResult = { total: 1, requests: [{ id: 'req-1' }] };
      jest.spyOn(B2bService, 'getAllRequests').mockResolvedValue(mockResult);

      const req = createReq({
        user: { id: 'admin-1', role: 'admin' },
        query: { status: 'pending' }
      });

      await b2bController.getAdminRequests(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.total).toBe(1);
    });
  });

  describe('reviewRequest', () => {
    it('returns 403 when non-admin tries to review', async () => {
      const req = createReq({
        user: { id: 'user-1', role: 'user' },
        params: { id: 'req-1' },
        body: { status: 'approved' }
      });

      await b2bController.reviewRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 200 when admin reviews request', async () => {
      const mockResult = {
        success: true,
        message: 'تمت الموافقة',
        request: { id: 'req-1', status: 'approved' }
      };
      jest.spyOn(B2bService, 'reviewRequest').mockResolvedValue(mockResult);

      const req = createReq({
        user: { id: 'admin-1', role: 'admin' },
        params: { id: 'req-1' },
        body: { status: 'approved', reviewNote: 'ممتاز' }
      });

      await b2bController.reviewRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
    });
  });
});
