import assert from 'node:assert/strict';
import {apply,demoLedger,emptyLedger} from '../lib/finance.ts';

const base = emptyLedger(demoLedger().config).config;
const ledger = { config: base, entries: [], moves: [], audit: [] };
const PHOTO = '7f0f0f28-9a41-4f18-9ad4-0a9b7d1f0001';

// Cada pessoa grava apenas o próprio perfil, identificado pelo e-mail do login.
const own = apply(ledger, { id: 'p1', type: 'profile', data: { name: '  Ana Souza  ', title: 'Sócia administradora', photo: PHOTO } }, 'Ana@Obra.com');
const key = 'ana@obra.com';
assert.ok(own.config.profiles, 'perfil criado');
assert.equal(own.config.profiles[key].name, 'Ana Souza', 'nome normalizado e sem espaços nas pontas');
assert.equal(own.config.profiles[key].title, 'Sócia administradora');
assert.equal(own.config.profiles[key].photo, PHOTO);
assert.ok(own.config.profiles[key].updatedAt, 'data de atualização registrada');
assert.equal(own.audit[0].action, 'profile', 'perfil entra no histórico');

// Um perfil não pode escrever no perfil de outra pessoa.
const other = apply(own, { id: 'p2', type: 'profile', data: { name: 'Outro Nome' } }, 'bruno@obra.com');
assert.equal(other.config.profiles[key].name, 'Ana Souza', 'perfil alheio preservado');
assert.equal(other.config.profiles['bruno@obra.com'].name, 'Outro Nome');
assert.equal(Object.keys(other.config.profiles).length, 2);

// Campos não enviados permanecem; remover só o que foi pedido.
const partial = apply(own, { id: 'p3', type: 'profile', data: { title: 'Diretora' } }, 'ana@obra.com');
assert.equal(partial.config.profiles[key].name, 'Ana Souza', 'nome mantido em edição parcial');
assert.equal(partial.config.profiles[key].title, 'Diretora');
assert.equal(partial.config.profiles[key].photo, PHOTO, 'foto mantida em edição parcial');

// Remover a foto apaga apenas o ponteiro.
const withoutPhoto = apply(own, { id: 'p4', type: 'profile', data: { photo: '' } }, 'ana@obra.com');
assert.equal(withoutPhoto.config.profiles[key].photo, undefined);
assert.equal(withoutPhoto.config.profiles[key].name, 'Ana Souza');

// Perfil sem nenhum dado é descartado em vez de ficar vazio.
const cleared = apply(own, { id: 'p5', type: 'profile', data: { name: '', title: '', photo: '' } }, 'ana@obra.com');
assert.equal(cleared.config.profiles[key], undefined, 'entrada vazia removida');

// Limites e formato da foto são validados.
assert.throws(() => apply(ledger, { id: 'p6', type: 'profile', data: { name: 'x'.repeat(81) } }, 'ana@obra.com'), /até 80/);
assert.throws(() => apply(ledger, { id: 'p7', type: 'profile', data: { title: 'x'.repeat(61) } }, 'ana@obra.com'), /até 60/);
assert.throws(() => apply(ledger, { id: 'p8', type: 'profile', data: { photo: '../../etc/passwd' } }, 'ana@obra.com'), /Foto do perfil inválida/);
assert.throws(() => apply(ledger, { id: 'p9', type: 'profile', data: { name: 'Ana' } }, 'sem-email'), /Entre com sua conta/);

// Leitores (sem admin) também mantêm o próprio perfil.
const viewer = apply(own, { id: 'p10', type: 'profile', data: { name: 'Ana S.' } }, 'ana@obra.com', false);
assert.equal(viewer.config.profiles[key].name, 'Ana S.');

// Salvar configurações não apaga as fotos e os nomes já gravados.
const config = apply(own, { id: 'c1', type: 'config', data: { ...own.config } }, 'ana@obra.com');
assert.equal(config.config.profiles[key].photo, PHOTO, 'config preserva perfis');

// Reaplicar a mesma operação é idempotente.
const replay = apply(own, { id: 'p1', type: 'profile', data: { name: 'Outro' } }, 'ana@obra.com');
assert.equal(replay.config.profiles[key].name, 'Ana Souza', 'mesma operação não duplica efeito');
assert.equal(replay.audit.length, own.audit.length);

console.log('perfil ok');
