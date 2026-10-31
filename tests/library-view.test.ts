import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectProjects } from '../shared/library-view';
import { emptySong } from '../shared/song';

test('library discovery combines filters, searches context and sorts without mutating snapshots', () => {
  const projects = [
    { name: 'first', createdAt: '2026-10-01T00:00:00Z', song: { ...emptySong(), title: 'Take 10', rating: 5, favorite: true, stage: 'finished' as const } },
    { name: 'second', createdAt: '2026-10-03T00:00:00Z', song: { ...emptySong(), title: 'Take 2', rating: 5, kind: 'template' as const, stage: 'draft' as const, referenceNotes: 'Dry piano reference' } },
    { name: 'third', createdAt: '2026-10-02T00:00:00Z', song: { ...emptySong(), title: 'Alpha', rating: 0, stage: 'idea' as const } },
  ];
  const original = JSON.stringify(projects);
  const base = { query: '', filter: 'all', sort: 'newest' as const, minimumRating: 0 };
  const names = (options = {}) => selectProjects(projects, { ...base, ...options }).map(p => p.name);
  assert.deepEqual(names(), ['second', 'third', 'first']);
  assert.deepEqual(names({ sort: 'oldest' }), ['first', 'third', 'second']);
  assert.deepEqual(names({ sort: 'rating' }), ['second', 'first', 'third']);
  assert.deepEqual(names({ sort: 'title' }), ['third', 'second', 'first']);
  assert.deepEqual(names({ query: '  DRY PIANO  ', filter: 'template', minimumRating: 4 }), ['second']);
  assert.deepEqual(names({ filter: 'favorite', minimumRating: 5 }), ['first']);
  assert.deepEqual(names({ filter: 'idea', minimumRating: 1 }), []);
  assert.deepEqual(names({ filter: 'song' }), ['third', 'first']);
  assert.equal(JSON.stringify(projects), original);
});
