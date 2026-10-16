import { z } from 'zod';
import { pagination, uuid, text } from '../../shared/validation.js';
import { listWorkers } from './workforce.model.js';
import { workerInput } from './workforce.service.js';

export function workforceController(db, service) {
  return {
    async list(req, res) {
      const input = pagination.extend({ workerType: z.enum(['EMPLOYEE','FREELANCER']).optional(), unlinked: z.enum(['true','false']).optional() }).parse(req.query);
      res.json(await listWorkers(db, input, req.auth.user));
    },
    async create(req, res) { res.status(201).json(await service.create(req.auth.user, workerInput.parse(req.body))); },
    async status(req, res) {
      const input = z.object({ status: z.enum(['ACTIVE','ON_LEAVE','SUSPENDED','INACTIVE']), revision: z.number().int().positive(), reason: text }).strict().parse(req.body);
      res.json(await service.changeStatus(req.auth.user, uuid.parse(req.params.id), input));
    },
  };
}
