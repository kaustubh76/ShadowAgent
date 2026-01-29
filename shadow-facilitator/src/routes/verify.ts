// Verification Routes - Escrow and Reputation Proofs

import { Router, Request, Response } from 'express';
import { aleoService } from '../services/aleo';
import { EscrowProof, ReputationProof } from '../types';

const router = Router();

// POST /verify/escrow - Verify escrow proof
router.post('/escrow', async (req: Request, res: Response) => {
  try {
    const { proof } = req.body;

    if (!proof) {
      res.status(400).json({
        valid: false,
        error: 'Missing required field: proof',
      });
      return;
    }

    const escrowProof: EscrowProof = proof;

    const result = await aleoService.verifyEscrowProof(escrowProof);

    res.json({
      valid: result.valid,
      error: result.error,
      verified_at: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      valid: false,
      error: 'Verification failed',
    });
  }
});

// POST /verify/reputation - Verify reputation proof
router.post('/reputation', async (req: Request, res: Response) => {
  try {
    const { proof, proof_type, threshold } = req.body;

    if (!proof) {
      res.status(400).json({
        valid: false,
        error: 'Missing required field: proof',
      });
      return;
    }

    const reputationProof: ReputationProof = {
      proof_type: proof_type || proof.proof_type,
      threshold: threshold || proof.threshold,
      proof: typeof proof === 'string' ? proof : proof.proof,
    };

    const result = await aleoService.verifyReputationProof(reputationProof);

    res.json({
      valid: result.valid,
      tier: result.tier,
      proof_type: reputationProof.proof_type,
      threshold: reputationProof.threshold,
      verified_at: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      valid: false,
      error: 'Verification failed',
    });
  }
});

// POST /verify/nullifier - Check if nullifier has been used
router.post('/nullifier', async (req: Request, res: Response) => {
  try {
    const { nullifier } = req.body;

    if (!nullifier) {
      res.status(400).json({
        error: 'Missing required field: nullifier',
      });
      return;
    }

    const isUsed = await aleoService.isNullifierUsed(nullifier);

    res.json({
      nullifier,
      is_used: isUsed,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Check failed' });
  }
});

export default router;
