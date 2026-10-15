import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {auditPhotos, formatPhotoAudit, parsePhotoArgs, runPhotoCheck} from './check-photos.mjs';

const place = (id, extra = {}) => ({id, name: `地点 ${id}`, city: '郑州', ...extra});
const photo = (id, extra = {}) => place(id, {image: '/assets/example.jpg', photoReference: 'https://example.org/photo/1', ...extra});
const data = {places: [
  place('missing'), place('empty', {image: '  ', photoSource: 'wikimedia'}),
  photo('boundary', {photoYear: 2024}), photo('old', {photoYear: '2023'}),
  photo('fallback-date', {photoTakenAt: '2020-02'}), photo('unknown'),
  photo('future', {photoYear: 2027}), photo('bad-year', {photoYear: '2024-03'}),
  photo('bad-date', {photoTakenAt: '2024-02-30'}),
  photo('mismatch', {photoYear: 2024, photoTakenAt: '2025-01-02'}),
  photo('zero', {photoYear: 0}), photo('leap-day', {photoTakenAt: '2024-02-29'}),
  photo('generic-reference', {photoReference: '', reference: 'https://example.org/tourism'}),
  photo('platform-only', {photoReference: '', photoSource: 'wikimedia'}),
  photo('self-missing-author', {photoReference: '', photoSource: '实拍'}),
  photo('self', {photoReference: '', photoSource: '实拍', photoAuthor: '摄影者'}),
  photo('source-url', {photoReference: '', photoSource: 'https://example.org/original'}),
  photo('unsafe-url', {photoReference: 'javascript:alert(1)', photoSource: '高德'}),
  photo('empty-year-fallback', {photoYear: '  ', photoTakenAt: '2025-01-01'})
]};
const original = JSON.stringify(data);
const report = auditPhotos(data, {year: 2026, maxAge: 2});
assert.deepEqual(report.missingImages.map(p => p.id), ['missing', 'empty']);
assert.deepEqual(report.missingSources.map(p => p.id), ['generic-reference', 'platform-only', 'self-missing-author', 'unsafe-url']);
assert.deepEqual(report.suspectedOldPhotos.map(p => [p.id, p.photoYear]), [['old', 2023], ['fallback-date', 2020]]);
assert.deepEqual(report.invalidYears.map(p => p.id), ['future', 'bad-year', 'bad-date', 'mismatch', 'zero']);
assert(report.unknownYears.some(p => p.id === 'unknown'));
assert(!report.unknownYears.some(p => p.id === 'missing'));
assert(!report.suspectedOldPhotos.some(p => p.id === 'boundary'));
assert.equal(report.summary.totalPlaces, data.places.length);
assert.equal(report.summary.withImages, data.places.length - 2);
assert.equal(JSON.stringify(data), original, 'Audit must not modify its input.');
assert.equal(auditPhotos([photo('new', {photoYear: 2025})], {year: 2026, maxAge: 0}).suspectedOldPhotos.length, 1);
assert.equal(auditPhotos([photo('new', {photoYear: 2024})], {year: 2026, maxAge: 3}).suspectedOldPhotos.length, 0);
assert.equal(auditPhotos([], {year: 2026}).summary.totalPlaces, 0);
assert.throws(() => auditPhotos({}, {year: 2026}), /places/);
assert.throws(() => auditPhotos([place('')]), /id、name 和 city/);
for (const year of [NaN, '2026', 2026.5, 999, 10000]) assert.throws(() => auditPhotos([], {year}), /year/);
for (const maxAge of [-1, NaN, 1.5, '2', 10000]) assert.throws(() => auditPhotos([], {maxAge}), /maxAge/);
const text = formatPhotoAudit(report);
assert(text.includes('拍摄年份 < 2024'));
assert(text.includes('无出处（仅有图地点）（4）'));
assert(text.includes('附：年份未知'));
assert(text.includes('附：年份异常'));
assert(text.includes('疑似老照片（2）'));
assert(!text.includes('undefined'));
assert.deepEqual(parsePhotoArgs(['--year=2026', '--max-age', '3', '--json']).year, 2026);
assert(parsePhotoArgs(['--file=/tmp/places=fixture.json']).file.endsWith('/places=fixture.json'));
for (const args of [['--unknown'], ['--year'], ['--year', '2026x'], ['--max-age', '1.5'], ['--json=true'], ['--json', '--json']]) {
  assert.throws(() => parsePhotoArgs(args));
}

const script = fileURLToPath(new URL('./check-photos.mjs', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'yujian-photo-audit-'));
try {
  const fixture = join(temp, 'places.json');
  await writeFile(fixture, JSON.stringify(data));
  const cli = (...args) => spawnSync(process.execPath, [script, ...args], {cwd: temp, encoding: 'utf8'});
  const result = cli('--file', fixture, '--year', '2026', '--max-age', '2', '--json');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), report);
  assert.equal(await readFile(fixture, 'utf8'), JSON.stringify(data), 'CLI must not rewrite the catalogue.');
  const standard = cli('--file', fixture, '--year', '2026');
  assert.equal(standard.status, 0, standard.stderr);
  assert.equal(standard.stdout.trim(), text);
  assert((await runPhotoCheck(['--help'])).includes('--max-age'));
  assert.equal(cli('--help').status, 0);
  for (const args of [['--unknown'], ['--year'], ['--year', '2026x'], ['--max-age', '-1'], ['--year', '999'], ['--file', join(temp, 'missing.json')]]) {
    const failed = cli(...args);
    assert.equal(failed.status, 1, args.join(' '));
    assert.equal(failed.stdout, '');
    assert(failed.stderr.startsWith('照片审计失败：'));
  }
  await writeFile(fixture, '{broken json');
  assert.equal(cli('--file', fixture).status, 1);
  await writeFile(fixture, JSON.stringify({places: 'not an array'}));
  assert.equal(cli('--file', fixture).status, 1);
  // The default catalogue resolves beside the script even when invoked from another directory.
  const catalog = JSON.parse(await readFile(new URL('../henan.json', import.meta.url), 'utf8'));
  const defaults = cli('--json', '--year', '2026');
  assert.equal(defaults.status, 0, defaults.stderr);
  assert.deepEqual(JSON.parse(defaults.stdout), auditPhotos(catalog, {year: 2026}));
  for (const p of catalog.places.filter(p => p.image && p.photoYear !== undefined && p.photoTakenAt)) {
    assert.equal(p.photoYear, Number(p.photoTakenAt.slice(0, 4)), p.id);
  }
} finally { await rm(temp, {recursive: true, force: true}); }

console.log('Passed: read-only photo audit, independent missing-image/source lists, known-year boundaries, unknown/future/conflicting dates, source evidence, JSON/text CLI and invalid input.');
