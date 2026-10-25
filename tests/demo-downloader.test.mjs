import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

void test('offline download recovers after interruption using only missing byte ranges', async () => {
  const entries = new Map(),
    files = new Map(),
    calls = [];
  globalThis.demoDownloadEntries = entries;
  globalThis.demoDownloadFiles = files;
  globalThis.window = new EventTarget();
  Object.defineProperty(globalThis.navigator, 'storage', {
    value: { persist: async () => true, persisted: async () => true },
    configurable: true,
  });
  const db = url(
    `export const getOfflineEpisode=async id=>globalThis.demoDownloadEntries.get(id);export const putOfflineEpisode=async value=>{globalThis.demoDownloadEntries.set(value.id,structuredClone(value));return value;};`,
  );
  const storage = url(
    `export const ensureOfflineStorage=async()=>{};export const cachePoster=async()=>{};export const deleteOfflineFiles=async()=>{};export const storageEstimate=async()=>({quota:1024**3,usage:0});export const offlineFileExists=async(id,name)=>globalThis.demoDownloadFiles.has(id+'/'+name);export const writeResponseFile=async(id,name,response,signal,onBytes)=>{const blob=await response.blob();if(signal.aborted)throw new DOMException('Paused','AbortError');globalThis.demoDownloadFiles.set(id+'/'+name,blob);onBytes(blob.size);return blob.size;};`,
  );
  const hls = url(
    stripTypeScriptTypes(await readFile('lib/offline/hls.ts', 'utf8')),
  );
  const demo = url(
    stripTypeScriptTypes(await readFile('lib/offline/demo.ts', 'utf8')),
  );
  const source = stripTypeScriptTypes(
    await readFile('lib/offline/downloader.ts', 'utf8'),
  )
    .replace("'./db'", JSON.stringify(db))
    .replace("'./storage'", JSON.stringify(storage))
    .replace("'./hls'", JSON.stringify(hls))
    .replace("'./demo'", JSON.stringify(demo))
    .replace(
      "'./delete'",
      JSON.stringify(url('export const deleteOfflineData=async()=>{};')),
    )
    .replace(
      'async function downloadPrepared(',
      'export async function downloadPrepared(',
    );
  const downloader = await import(url(source));
  const size = 8 * 1024 * 1024 + 123;
  let interrupted = true;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const [, from, to] = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
    const start = Number(from),
      end = Number(to);
    calls.push(start);
    if (start > 0 && interrupted) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new Error('Network interrupted');
    }
    return new Response(new Uint8Array(end - start + 1).fill(7), {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${start}-${end}/${size}`,
      },
    });
  };
  const prepared = {
    provider: 'demo',
    mediaUrl: '/demo-media/ep-1/anistar.mp4',
    mediaSize: size,
    downloadId: 'demo-1-anistar-720',
    offlineAccessUntil: Date.UTC(2100, 0, 1),
  };
  const episode = {
    id: 'demo-1-anistar-720',
    provider: 'demo',
    animePoster: '',
    status: 'queued',
    downloadedBytes: 0,
    size: 0,
  };
  try {
    await assert.rejects(
      downloader.downloadPrepared(episode, prepared),
      /Network interrupted/,
    );
    assert.equal(episode.status, 'failed');
    assert.equal(episode.manifestData.segments[0].downloaded, true);
    interrupted = false;
    await downloader.downloadPrepared(episode, prepared);
    assert.equal(episode.status, 'completed');
    assert.equal(episode.size, size);
    assert.equal(episode.downloadedBytes, size);
    assert.equal(calls.filter((start) => start === 0).length, 1);
    assert.equal(calls.filter((start) => start > 0).length, 2);
    assert.equal(new Blob([...files.values()]).size, size);
  } finally {
    globalThis.fetch = original;
    delete globalThis.demoDownloadEntries;
    delete globalThis.demoDownloadFiles;
    delete globalThis.window;
  }
});
