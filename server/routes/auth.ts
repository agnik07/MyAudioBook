import { Router, Request, Response } from 'express';

const router = Router();

const SINGLE_USER_PROFILE = {
  id: 'user-owner',
  displayName: 'Agnik Dutta',
  email: 'agnik@myaudiobook.internal',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
};

// 1. Single User Auth Status
router.get('/auth/me', (_req: Request, res: Response) => {
  res.json({
    user: SINGLE_USER_PROFILE,
  });
});

// 2. Login Endpoint
router.post('/auth/login', (_req: Request, res: Response) => {
  res.json({
    success: true,
    user: SINGLE_USER_PROFILE,
  });
});

// 3. Logout Endpoint
router.post('/auth/logout', (_req: Request, res: Response) => {
  res.json({ success: true });
});

export default router;
