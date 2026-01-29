// Health Check Routes

import { Router, Request, Response } from 'express';
import { aleoService } from '../services/aleo';
import { HealthStatus } from '../types';

const router = Router();

const VERSION = '0.1.0';

// GET /health - Basic health check
router.get('/', (req: Request, res: Response) => {
  const status: HealthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: VERSION,
  };

  res.json(status);
});

// GET /health/ready - Readiness check (includes Aleo connection)
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const blockHeight = await aleoService.getBlockHeight();

    if (blockHeight > 0) {
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        version: VERSION,
        blockHeight,
        network: process.env.ALEO_NETWORK || 'testnet',
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        version: VERSION,
        error: 'Cannot connect to Aleo network',
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      version: VERSION,
      error: 'Health check failed',
    });
  }
});

// GET /health/live - Liveness check
router.get('/live', (req: Request, res: Response) => {
  res.json({
    status: 'live',
    timestamp: new Date().toISOString(),
  });
});

export default router;
