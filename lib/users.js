import { db } from "./db";
import { hashPassword } from "./passwords";

export async function listUsers() {
  const q = await db();
  return q`SELECT id, username, name, role, active, last_login, created_at FROM users ORDER BY username`;
}

export async function createUser({ username, name, role, password }) {
  const q = await db();
  const u = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(u)) throw new Error("Username: 3–32 letters, numbers, dots or dashes");
  if (u === (process.env.APP_USERNAME || "westfleur").toLowerCase()) throw new Error("That username is the built-in admin");
  if (!["admin", "reader"].includes(role)) throw new Error("Choose a role");
  if (String(password || "").length < 10) throw new Error("Password must be at least 10 characters");
  const [dup] = await q`SELECT 1 AS x FROM users WHERE username = ${u}`;
  if (dup) throw new Error("That username is taken");
  await q`INSERT INTO users (username, name, role, password_hash) VALUES (${u}, ${name || null}, ${role}, ${hashPassword(password)})`;
}

export async function updateUser(id, { role, active, password, name }) {
  const q = await db();
  if (role !== undefined) {
    if (!["admin", "reader"].includes(role)) throw new Error("Choose a role");
    await q`UPDATE users SET role = ${role} WHERE id = ${Number(id)}`;
  }
  if (active !== undefined) await q`UPDATE users SET active = ${!!active} WHERE id = ${Number(id)}`;
  if (name !== undefined) await q`UPDATE users SET name = ${name || null} WHERE id = ${Number(id)}`;
  if (password) {
    if (String(password).length < 10) throw new Error("Password must be at least 10 characters");
    await q`UPDATE users SET password_hash = ${hashPassword(password)} WHERE id = ${Number(id)}`;
  }
}
