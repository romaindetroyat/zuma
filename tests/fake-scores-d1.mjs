/**
 * Fake D1 binding for the shared records database (plan 06.1-02), backed by a real in-memory SQLite database
 * (`node:sqlite`, built into Node 22): the worker's SQL is executed for real, not pattern-matched. Implements the part
 * of the D1 API the worker uses — `prepare(sql)` → statement with `bind(...args)`, `all()`, `run()`, `first()`;
 * `batch(statements)` in one transaction — and records every prepared SQL text. Setting `fail = true` makes every
 * execution reject (D1 outage). Reused by the end-to-end test of plan 06.1-05.
 */
import { DatabaseSync } from 'node:sqlite';
import { SCORES_SCHEMA } from '../tools/recordsapi.mjs';

/** Plain copy of a node:sqlite row (null-prototype object). */
const plain = row => (row ? { ...row } : row);

/**
 * `{ binding, sql, db, fail }`: `binding` goes in `env.SCORES_DB`; `sql` lists every prepared text in order; `db` is
 * the DatabaseSync (for direct inspection); `fail` (mutable) makes every execution throw.
 */
export function fakeScoresD1({ schema = SCORES_SCHEMA, fail = false } = {}) {
  const db = new DatabaseSync(':memory:');
  for (const statement of schema) db.exec(statement);
  const state = { sql: [], db, fail, binding: null };
  const check = () => {
    if (state.fail) throw new Error('D1_ERROR: simulated outage');
  };

  function statement(text, args = []) {
    const exec = kind => {
      check();
      const prepared = db.prepare(text);
      if (kind === 'all') {
        const results = prepared.all(...args).map(plain);
        return { results, success: true, meta: { rows_read: results.length } };
      }
      if (kind === 'first') return plain(prepared.get(...args)) ?? null;
      const info = prepared.run(...args);
      return { results: [], success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
    };
    return {
      sql: text,
      args,
      bind: (...values) => statement(text, values),
      all: async () => exec('all'),
      run: async () => exec('run'),
      first: async () => exec('first'),
      exec,
    };
  }

  state.binding = {
    prepare(text) {
      state.sql.push(text);
      db.prepare(text); // invalid SQL fails here, like a malformed statement would on D1
      return statement(text);
    },
    async batch(statements) {
      check();
      db.exec('BEGIN');
      try {
        const out = statements.map(s => (/^\s*select\b/i.test(s.sql) ? s.exec('all') : s.exec('run')));
        db.exec('COMMIT');
        return out;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return state;
}
