import {access,bindings,failure,sameOrigin} from '@/lib/server';

export const dynamic = 'force-dynamic';

// Foto do perfil: um objeto por usuário no R2. O ponteiro fica em
// config.profiles[email].photo e só é gravado pela ação `profile`, que também
// passa pela checagem de versão do empreendimento.
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await access();
    const bucket = bindings().BUCKET;
    if (!bucket) throw new Error('O armazenamento de fotos ainda não foi ativado neste ambiente.');
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file || !file.size) throw new Error('Selecione uma imagem para o perfil.');
    if (file.size > MAX_BYTES) throw new Error('A foto deve ter até 3 MB.');
    if (!TYPES.includes(file.type)) throw new Error('Envie uma imagem JPG, PNG ou WebP.');
    const id = crypto.randomUUID();
    await bucket.put('profile/' + id, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type, cacheControl: 'private, max-age=31536000' },
    });
    // A foto anterior é descartada só quando o cliente confirma qual era, o que
    // evita apagar um arquivo que ainda esteja em uso por outra sessão.
    const previous = String(form.get('previous') || '').trim();
    const email = a.user.email.trim().toLowerCase();
    const stored = a.ledger?.config.profiles?.[email]?.photo;
    if (previous && previous === stored && previous !== id) {
      try { await bucket.delete('profile/' + previous); } catch { /* arquivo já removido */ }
    }
    return Response.json({ id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return failure(e);
  }
}

// Só apaga um arquivo que já não esteja apontado por nenhum perfil, para nunca
// derrubar a foto de outra pessoa ou de outra sessão.
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const a = await access();
    const bucket = bindings().BUCKET;
    if (!bucket) return Response.json({ removed: false });
    const id = new URL(req.url).searchParams.get('id') || '';
    const stillUsed = Object.values(a.ledger?.config.profiles || {}).some(profile => profile?.photo === id);
    if (!id || stillUsed) return Response.json({ removed: false }, { headers: { 'Cache-Control': 'no-store' } });
    await bucket.delete('profile/' + id);
    return Response.json({ removed: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return failure(e);
  }
}

export async function GET(req: Request) {
  try {
    const a = await access();
    const bucket = bindings().BUCKET;
    if (!bucket) return new Response('Foto não encontrada', { status: 404 });
    const id = new URL(req.url).searchParams.get('id') || '';
    const referenced = Object.values(a.ledger?.config.profiles || {}).some(profile => profile?.photo === id);
    if (!id || !referenced) return new Response('Foto não encontrada', { status: 404 });
    const object = await bucket.get('profile/' + id);
    if (!object) return new Response('Foto não encontrada', { status: 404 });
    const type = object.httpMetadata?.contentType;
    const mime = type && TYPES.includes(type) ? type : 'application/octet-stream';
    return new Response(object.body, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
