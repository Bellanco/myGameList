// Avatar determinista a partir del nombre: inicial + tono (0-5) estable, sin exponer datos.
// Compartido por el feed y el detalle de actividad para un estilo coherente.
export function avatarInitial(name: string): string {
  const trimmed = String(name || '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

export function avatarTone(name: string): number {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 6;
}
