import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOpenApi } from '../src/docs/openapi.js';

test('OpenAPI annotations cover all implemented business and health routes', async () => {
  const spec = createOpenApi({ NODE_ENV:'test' });
  for (const [file,prefix] of [['../src/routes.js','/api/v1'],['../src/app.js','']]) {
    const source = await readFile(new URL(file,import.meta.url),'utf8');
    for (const match of source.matchAll(/(?:router|app)\.(get|post|put|patch|delete)\('([^']+)'/g)) {
      if (match[2] === '/api-docs.json') continue;
      const path = prefix + match[2].replace(/:([a-zA-Z]+)/g,'{$1}');
      assert.ok(spec.paths[path]?.[match[1]],`Missing ${match[1]} ${path}`);
    }
  }
  // Catch broken schema/body/response references, including newly added annotations.
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert.ok(value.$ref.startsWith('#/'));
      const target = value.$ref.slice(2).split('/').reduce((obj,key) => obj?.[key],spec);
      assert.ok(target,`Unresolved ${value.$ref}`);
    }
    Object.values(value).forEach(visit);
  };
  visit(spec);
});

test('OpenAPI differentiates public, session and CSRF operations and production cookie name', () => {
  const spec = createOpenApi({ NODE_ENV:'production' });
  assert.equal(spec.components.securitySchemes.sessionCookie.name,'__Host-pcd_session');
  assert.deepEqual(spec.paths['/api/v1/auth/login'].post.security,[]);
  assert.deepEqual(spec.paths['/health'].get.security,[]);
  assert.deepEqual(spec.security,[{sessionCookie:[]}]);
  for (const [path,item] of Object.entries(spec.paths)) {
    for (const [method,operation] of Object.entries(item)) {
      if (['post','put','patch','delete'].includes(method) && path !== '/api/v1/auth/login') {
        assert.deepEqual(operation.security,[{sessionCookie:[],csrfToken:[]}],`${method} ${path}`);
      }
    }
  }
});
