import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { text, uuid } from '../../shared/validation.js';
import { transaction } from '../../db/pool.js';
import { audit } from '../audit/audit.model.js';
import { ApiError } from '../../shared/errors.js';

const code = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/).transform(v => v.toUpperCase());
export const categoryInput = z.object({ code, name: text, description: z.string().max(2000).default('') }).strict();
export const platformInput = z.object({ code, name: text, categoryId: uuid, description: z.string().max(2000).default('') }).strict();
export const capacityInput = z.object({ revision: z.number().int().positive(), departments: z.array(z.object({ departmentCode: z.enum(['GS','DP','WD','SAFETY']), seats: z.number().int().min(0).max(10000), morningTarget: z.number().int().min(0), nightTarget: z.number().int().min(0) }).strict().refine(v => v.morningTarget <= v.seats && v.nightTarget <= v.seats, 'Targets cannot exceed seats.')).min(1).max(4) }).strict().refine(v => new Set(v.departments.map(d => d.departmentCode)).size === v.departments.length, 'Departments must be unique.');

export function platformsService(db) {
  return {
    async createCategory(actor, input) {
      return transaction(db, async client => {
        const result = await client.query('INSERT INTO platform_categories(id,code,name,description) VALUES($1,$2,$3,$4) RETURNING *', [randomUUID(),input.code,input.name,input.description]);
        await audit(client,actor.id,'CATEGORY_CREATED','category',result.rows[0].id);
        return result.rows[0];
      });
    },
    async createPlatform(actor, input) {
      return transaction(db, async client => {
        const result = await client.query('INSERT INTO platforms(id,code,name,category_id,description) VALUES($1,$2,$3,$4,$5) RETURNING *', [randomUUID(),input.code,input.name,input.categoryId,input.description]);
        await audit(client,actor.id,'PLATFORM_CREATED','platform',result.rows[0].id);
        return result.rows[0];
      });
    },
    async configure(actor, id, input) {
      return transaction(db, async client => {
        const platform = (await client.query('SELECT * FROM platforms WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!platform) throw new ApiError(404,'NOT_FOUND','Platform not found.');
        if (platform.revision !== input.revision) throw new ApiError(409,'CONFLICT','Platform changed. Reload before editing.');
        // Capacity edits are setup-only until assignment-aware reservation checks are implemented.
        if (platform.lifecycle !== 'SETUP') throw new ApiError(409,'PLATFORM_ACTIVE','Operational capacity changes require assignment-aware checks.');
        for (const d of input.departments) await client.query('INSERT INTO platform_capacities(platform_id,department_code,seats,morning_target,night_target) VALUES($1,$2,$3,$4,$5) ON CONFLICT(platform_id,department_code) DO UPDATE SET seats=excluded.seats,morning_target=excluded.morning_target,night_target=excluded.night_target', [id,d.departmentCode,d.seats,d.morningTarget,d.nightTarget]);
        const result = await client.query('UPDATE platforms SET revision=revision+1 WHERE id=$1 RETURNING *',[id]);
        await audit(client,actor.id,'PLATFORM_CAPACITY_CHANGED','platform',id,{ departments: input.departments });
        return result.rows[0];
      });
    },
    async activate(actor, id, revision) {
      return transaction(db, async client => {
        const platform = (await client.query('SELECT * FROM platforms WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if (!platform) throw new ApiError(404,'NOT_FOUND','Platform not found.');
        if (platform.revision !== revision) throw new ApiError(409,'CONFLICT','Platform changed.');
        const capacity = await client.query('SELECT 1 FROM platform_capacities WHERE platform_id=$1 AND seats>0',[id]);
        if (!capacity.rows.length) throw new ApiError(409,'CAPACITY_REQUIRED','Configure positive seat capacity before activation.');
        const result = await client.query("UPDATE platforms SET lifecycle='OPERATIONAL',status='ACTIVE',revision=revision+1 WHERE id=$1 RETURNING *",[id]);
        await audit(client,actor.id,'PLATFORM_ACTIVATED','platform',id);
        return result.rows[0];
      });
    },
  };
}
