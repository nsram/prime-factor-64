import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { deck, easyLayouts, sizes } from '../helpers/oracles.mjs';

const read = name => readFile(new URL('../../' + name, import.meta.url));

test('A01 independent fixture matches the published answer table', async () => {
  const history = (await read('prime-factor-64-history.html')).toString();
  const start = history.indexOf('<h2 id="the-64-results-in-the-final-deck">');
  const end = history.indexOf('</table>', start);
  assert.ok(start >= 0 && end > start);
  const rows = [...history.slice(start, end).matchAll(/<td[^>]*>(\d+) = (\d+) × (\d+)<\/td>/g)];
  assert.equal(rows.length, 64, 'published result rows');
  const published = new Map(rows.map(([, product, a, b]) => [Number(product), [[Number(a), Number(b)]]]));
  const extra = history.slice(end).match(/The additional factor pairs are ([^<]+)\./)[1];
  for (const [, a, b, product] of extra.matchAll(/(\d+) × (\d+) for (\d+)/g)) {
    published.get(Number(product)).push([Number(a), Number(b)]);
  }
  for (const [product, pairs] of published) {
    assert.deepEqual(pairs, deck.get(product), 'published product ' + product);
  }
  assert.equal(deck.size, 64);
  assert.equal([...deck.values()].flat().length, 68);
  assert.deepEqual([...deck].filter(([, pairs]) => pairs.length === 2).map(([result]) => result), [108, 112, 126, 144]);
  for (const size of sizes) {
    const results = easyLayouts(size).flatMap(board => board.sections.flatMap(section => section.results));
    assert.deepEqual(results.sort((a, b) => a - b), [...deck.keys()]);
  }
});

const lineCount = text => text.split(/\r?\n/).length - Number(text.endsWith('\n'));
const cells = row => [...row.matchAll(/<td[^>]*>(\d+)<\/td>/g)].map(match => Number(match[1]));

test('H01 latest history line totals and checksums match the shipped sources', async () => {
  for (const game of ['prime-factor-64', 'fog-sweep-64']) {
    const history = (await read(game + '-history.html')).toString();
    const file = await read(game + '.html');
    const html = file.toString();
    const css = lineCount(html.match(/<style>\r?\n([\s\S]*?)<\/style>/)[1]);
    const js = lineCount(html.match(/<script>\r?\n([\s\S]*?)<\/script>/)[1]);
    const total = lineCount(html);
    const rows = [...history.matchAll(/<tr>[\s\S]*?<\/tr>/g)].flatMap(([row]) => {
      const version = row.match(/<br>Update (\d+)<\/t[dh]>/)?.[1];
      return version ? [{ version: Number(version), row }] : [];
    });
    assert.ok(rows.length, game + ' version rows');
    const { version, row } = rows.sort((a, b) => b.version - a.version)[0];
    const counts = game === 'prime-factor-64' ? [total - css - js, css, js, total] : [js, css, total - css - js, total];
    assert.deepEqual(cells(row), counts, game + ' line counts');
    const checksums = [...history.matchAll(/Update (\d+) SHA-256 for <code>([^<]+)<\/code><br><code[^>]*>([a-f0-9]{64})<\/code>/g)]
      .map(([, update, name, digest]) => ({ update: Number(update), name, digest }));
    const recordedGame = checksums.find(entry => entry.name === game + '.html' && entry.update === version);
    const recordedStore = checksums.filter(entry => entry.name === 'practice-progress.js').sort((a, b) => b.update - a.update)[0];
    assert.equal(recordedGame?.digest, createHash('sha256').update(file).digest('hex'), game + ' checksum');
    assert.equal(recordedStore?.digest, createHash('sha256').update(await read('practice-progress.js')).digest('hex'),
      game + ' shared practice checksum');
  }
});
