import { z } from 'zod';
// Notification polling reads only notifications and the authenticated worker link;
// it must not load/rewrite the entire operational snapshot every two seconds.
export async function notificationFeed(db,auth,args) {
  const [q]=z.tuple([z.object({unreadOnly:z.boolean().optional(),type:z.string().max(100).optional()}).strict()]).parse(args);
  const link=(await db.query('SELECT worker_id FROM operational_accounts WHERE user_id=$1',[auth.user.id])).rows[0];
  const rows=(await db.query(`SELECT data FROM ops_notifications WHERE data->>'type'<>'HANDOVER_REQUIRED'
    AND (data->'recipientRoles') @> $1::jsonb AND (data->>'recipientId' IS NULL OR data->>'recipientId'=$2 OR data->>'recipientId'=$3)
    ORDER BY data->>'createdAt' DESC,id DESC`,[JSON.stringify([auth.user.role]),link?.worker_id??auth.user.id,auth.user.id])).rows;
  const mine=rows.map(r=>({...r.data,recipientId:r.data.recipientId===link?.worker_id?auth.user.id:r.data.recipientId}));
  return {items:mine.filter(n=>(!q.unreadOnly||!n.read)&&(!q.type||n.type===q.type)),unread:mine.filter(n=>!n.read).length};
}
