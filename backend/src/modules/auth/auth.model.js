export const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, status: u.status });

export async function userByEmail(db, email) {
  return (await db.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
}

export async function grants(db, userId) {
  return (await db.query('SELECT permission FROM user_permissions WHERE user_id=$1 ORDER BY permission', [userId])).rows.map(r => r.permission);
}
