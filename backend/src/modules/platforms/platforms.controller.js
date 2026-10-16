import { z } from 'zod';
import { pagination, uuid } from '../../shared/validation.js';
import { categoryInput, platformInput, capacityInput } from './platforms.service.js';

export function platformsController(db, service) {
  return {
    async categories(req,res) {
      const { page,pageSize } = pagination.parse(req.query);
      const items = (await db.query('SELECT * FROM platform_categories ORDER BY code LIMIT $1 OFFSET $2',[pageSize,(page-1)*pageSize])).rows;
      const total = Number((await db.query('SELECT count(*) AS total FROM platform_categories')).rows[0].total);
      res.json({items,total,page,pageSize});
    },
    async list(req,res) {
      const { page,pageSize } = pagination.parse(req.query);
      const items = (await db.query('SELECT p.*,c.code AS category_code FROM platforms p JOIN platform_categories c ON c.id=p.category_id ORDER BY p.code LIMIT $1 OFFSET $2',[pageSize,(page-1)*pageSize])).rows;
      const total = Number((await db.query('SELECT count(*) AS total FROM platforms')).rows[0].total);
      res.json({items,total,page,pageSize});
    },
    async category(req,res) { res.status(201).json(await service.createCategory(req.auth.user,categoryInput.parse(req.body))); },
    async create(req,res) { res.status(201).json(await service.createPlatform(req.auth.user,platformInput.parse(req.body))); },
    async configure(req,res) { res.json(await service.configure(req.auth.user,uuid.parse(req.params.id),capacityInput.parse(req.body))); },
    async activate(req,res) { const {revision} = z.object({revision:z.number().int().positive()}).strict().parse(req.body); res.json(await service.activate(req.auth.user,uuid.parse(req.params.id),revision)); },
  };
}
