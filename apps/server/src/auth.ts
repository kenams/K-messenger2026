import type { Socket } from 'socket.io';
import { supabaseAdmin } from './supabase.js';

export async function authenticateSocket(socket: Socket): Promise<string> {
  const token = socket.handshake.auth?.accessToken;
  if (typeof token !== 'string' || token.length < 20) throw new Error('UNAUTHENTICATED');

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error('UNAUTHENTICATED');
  return data.user.id;
}
