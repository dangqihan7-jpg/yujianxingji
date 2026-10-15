import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const defaultFile = fileURLToPath(new URL('../henan.json', import.meta.url));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const webUrl = value => {
  if (!nonempty(value)) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
};

function sourceProblem(place) {
  if (webUrl(place.photoReference) || webUrl(place.photoSource)) return '';
  if (/^(实拍|自拍|自己实拍|用户实拍)$/u.test(String(place.photoSource ?? '').trim()) &&
      (nonempty(place.photoAuthor) || nonempty(place.credit))) return '';
  return nonempty(place.photoSource)
    ? '只有出处标签，缺少照片原始来源链接；自有实拍应记录摄影者。'
    : '缺少照片出处；普通景区 reference 不视为照片来源。';
}

function takenYear(value) {
  if (!nonempty(value)) return null;
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 1000) return null;
  if (match[2]) {
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    if (match[3]) {
      const day = Number(match[3]);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (day < 1 || day > lastDay) return null;
    }
  }
  return year;
}

function photoYear(place, currentYear) {
  const explicit = place.photoYear !== undefined && place.photoYear !== null &&
    !(typeof place.photoYear === 'string' && !place.photoYear.trim());
  const raw = explicit ? place.photoYear : place.photoTakenAt;
  if (raw === undefined || raw === null || raw === '' || (typeof raw === 'string' && !raw.trim())) {
    return {year: null, reason: '拍摄年份未知，未按上传或核对时间推测。'};
  }
  const validExplicit = (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1000 && raw <= 9999) ||
    (typeof raw === 'string' && /^\d{4}$/.test(raw.trim()));
  const year = explicit ? (validExplicit ? Number(raw) : null) : takenYear(raw);
  if (year === null || year < 1000 || year > 9999) return {year: null, invalid: true, reason: '拍摄年份或原始日期格式无效。'};
  if (year > currentYear) return {year, invalid: true, reason: '拍摄年份晚于审计年份，需要人工核对。'};
  const originalYear = takenYear(place.photoTakenAt);
  if (explicit && originalYear !== null && originalYear !== year) {
    return {year, invalid: true, reason: 'photoYear 与 photoTakenAt 的年份不一致，需要人工核对。'};
  }
  return {year};
}

/** Read-only catalogue audit. A flag means review is needed, not that a photo is unusable. */
export function auditPhotos(data, {year = new Date().getFullYear(), maxAge = 2} = {}) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new TypeError('year 必须为 1000–9999 的整数年份。');
  if (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 9999) throw new TypeError('maxAge 必须为 0–9999 的非负整数。');
  const places = Array.isArray(data) ? data : data?.places;
  if (!Array.isArray(places)) throw new TypeError('输入必须是含 places 数组的 JSON 对象，或地点数组。');
  const report = {
    year, maxAge, oldBeforeYear: year - maxAge,
    summary: {totalPlaces: places.length, withImages: 0, missingImages: 0, missingSources: 0, suspectedOldPhotos: 0, unknownYears: 0, invalidYears: 0},
    missingImages: [], missingSources: [], suspectedOldPhotos: [], unknownYears: [], invalidYears: []
  };
  for (const [index, place] of places.entries()) {
    if (!place || typeof place !== 'object' || Array.isArray(place) ||
        !nonempty(place.id) || !nonempty(place.name) || !nonempty(place.city)) {
      throw new TypeError(`第 ${index + 1} 个地点必须包含非空 id、name 和 city。`);
    }
    const entry = {id: place.id, name: place.name, city: place.city};
    if (!nonempty(place.image)) {
      report.missingImages.push(entry);
      continue;
    }
    report.summary.withImages++;
    const record = {...entry, image: place.image, photoSource: place.photoSource ?? '', photoReference: place.photoReference ?? ''};
    const problem = sourceProblem(place);
    if (problem) report.missingSources.push({...record, reason: problem});
    const date = photoYear(place, year);
    if (date.invalid) report.invalidYears.push({...record, photoYear: date.year, reason: date.reason});
    else if (date.year === null) report.unknownYears.push({...record, photoYear: null, reason: date.reason});
    else if (date.year < report.oldBeforeYear) report.suspectedOldPhotos.push({...record, photoYear: date.year, ageInYears: year - date.year});
  }
  for (const key of ['missingImages', 'missingSources', 'suspectedOldPhotos', 'unknownYears', 'invalidYears']) report.summary[key] = report[key].length;
  return report;
}

export function formatPhotoAudit(report) {
  const lines = [
    `照片审计：${report.year} 年；疑似老照片阈值为超过 ${report.maxAge} 年（拍摄年份 < ${report.oldBeforeYear}）。`,
    `总地点 ${report.summary.totalPlaces}；有图 ${report.summary.withImages}；无图 ${report.summary.missingImages}。`,
    '仅按已知拍摄年份筛选人工复核，不表示照片失效，也不验证地点、文件可用性或使用授权。'
  ];
  const sections = [
    ['无图', 'missingImages'], ['无出处（仅有图地点）', 'missingSources'], ['疑似老照片', 'suspectedOldPhotos'],
    ['附：年份未知（仅有图地点）', 'unknownYears'], ['附：年份异常（仅有图地点）', 'invalidYears']
  ];
  for (const [label, key] of sections) {
    lines.push('', `${label}（${report[key].length}）`);
    for (const place of report[key]) {
      const detail = key === 'suspectedOldPhotos' ? ` | ${place.photoYear} 年（相差 ${place.ageInYears} 年）` :
        place.reason ? ` | ${place.reason}` : '';
      lines.push(`- ${place.id} | ${place.name} | ${place.city}${detail}`);
    }
    if (!report[key].length) lines.push('- 无');
  }
  return lines.join('\n');
}

export function parsePhotoArgs(args) {
  const options = {file: defaultFile, json: false, help: false};
  const flags = new Set();
  for (let index = 0; index < args.length; index++) {
    const equalIndex = args[index].indexOf('=');
    const flag = equalIndex < 0 ? args[index] : args[index].slice(0, equalIndex);
    const inline = equalIndex < 0 ? undefined : args[index].slice(equalIndex + 1);
    if (flags.has(flag)) throw new TypeError(`重复参数：${flag}`);
    flags.add(flag);
    if (flag === '--json' || flag === '--help') {
      if (inline !== undefined) throw new TypeError(`${flag} 不接受参数值。`);
      options[flag.slice(2)] = true;
    } else if (['--file', '--year', '--max-age'].includes(flag)) {
      const value = inline ?? args[++index];
      if (!value || value.startsWith('--')) throw new TypeError(`${flag} 缺少参数值。`);
      if (flag === '--file') options.file = resolve(value);
      else {
        if (!/^\d+$/.test(value)) throw new TypeError(`${flag} 必须为整数。`);
        options[flag === '--year' ? 'year' : 'maxAge'] = Number(value);
      }
    } else throw new TypeError(`未知参数：${args[index]}`);
  }
  return options;
}

export async function runPhotoCheck(args = process.argv.slice(2)) {
  const options = parsePhotoArgs(args);
  if (options.help) return '用法：node scripts/check-photos.mjs [--file 数据.json] [--year 2026] [--max-age 2] [--json]\n默认只读 henan.json；超过 max-age 年的有图地点列为疑似老照片，未知年份单列。';
  const data = JSON.parse(await readFile(options.file, 'utf8'));
  const report = auditPhotos(data, options);
  return options.json ? JSON.stringify(report, null, 2) : formatPhotoAudit(report);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(await runPhotoCheck()); }
  catch (error) { console.error(`照片审计失败：${error.message}`); process.exitCode = 1; }
}
