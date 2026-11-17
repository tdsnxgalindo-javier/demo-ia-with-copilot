const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>\s*(const ESTADOS[\s\S]*?)<\/script>/)[1];

function dashboard(request, opportunities = []) {
  const select = {
    value: '',
    replaceChildren(...options) { this.options = options; }
  };
  const context = vm.createContext({
    URL, Intl, request, testData: opportunities,
    document: { getElementById: () => select },
    localStorage: { getItem: () => null },
    location: { origin: 'http://localhost:3000' },
    Option: class {
      constructor(text, value) { this.text = text; this.value = value; }
    }
  });
  vm.runInContext(script.slice(0, script.indexOf("  $('clientId').value =")), context);
  vm.runInContext('sharePointRequest = request; data = testData;', context);
  return { context, select, run: source => vm.runInContext(source, context) };
}

test('member selector expands the site group and paginated Microsoft 365 members only', async () => {
  const groupId = '12345678-1234-1234-1234-123456789012';
  const app = dashboard(async path => {
    if (path.startsWith('web/AssociatedMemberGroup/Users')) return {
      value: [{ PrincipalType: 4, LoginName: `c:0o.c|federateddirectoryclaimprovider|${groupId}` }]
    };
    if (path.startsWith('SP.Directory.DirectorySession/Group')) return {
      value: [{ displayName: 'Member B', principalName: 'b@example.test' }],
      'odata.nextLink': 'members-page-2'
    };
    assert.equal(path, 'members-page-2');
    return { value: [{ displayName: 'Member A', principalName: 'a@example.test' }] };
  });
  await app.run('fetchSiteMembers()');
  assert.deepEqual(app.select.options.map(option => option.value), ['', 'a@example.test', 'b@example.test']);
  await assert.rejects(app.run("resolveAssignee('outsider@example.test')"), /pertenezca actualmente/);
});

test('unsupported member groups fail explicitly instead of offering all site users', async () => {
  const app = dashboard(async () => ({
    value: [{ PrincipalType: 4, LoginName: 'unsupported-group', Title: 'Unsupported' }]
  }));
  await assert.rejects(app.run('fetchSiteMembers()'), /No se puede enumerar el grupo/);
});

test('document synchronization copies only changed assignments with exact ETags and follows pagination', async () => {
  const writes = [];
  const app = dashboard(async (path, options) => {
    if (options) {
      writes.push({ path, fields: JSON.parse(options.body), etag: options.headers['IF-MATCH'] });
      return null;
    }
    if (path === 'documents-page-2') return { value: [
      { Id: 23, OportunidadId: 2, AsignadoAId: 10, 'odata.etag': '"4"' }
    ] };
    return {
      value: [
        { Id: 21, OportunidadId: 1, AsignadoAId: 9, 'odata.etag': '"2"' },
        { Id: 22, OportunidadId: 1, AsignadoAId: 10, 'odata.etag': '"3"' }
      ],
      'odata.nextLink': 'documents-page-2'
    };
  }, [{ id: 1, asignadoId: 10 }, { id: 2, asignadoId: null }]);
  await app.run('syncDocumentAssignments()');
  assert.deepEqual(writes.map(write => ({ fields: write.fields, etag: write.etag })), [
    { fields: { AsignadoAId: 10 }, etag: '"2"' },
    { fields: { AsignadoAId: null }, etag: '"4"' }
  ]);
  assert.match(writes[0].path, /items\(21\)$/);
  assert.match(writes[1].path, /items\(23\)$/);
});

test('a document conflict reports partial synchronization and retry does not rewrite completed documents', async () => {
  const documents = [
    { Id: 21, OportunidadId: 1, AsignadoAId: null, 'odata.etag': '"2"' },
    { Id: 22, OportunidadId: 1, AsignadoAId: null, 'odata.etag': '"3"' }
  ];
  const writes = [];
  let conflict = true;
  const app = dashboard(async (path, options) => {
    if (!options) return { value: documents };
    const id = Number(path.match(/items\((\d+)\)/)[1]);
    writes.push(id);
    if (id === 22 && conflict) throw new Error('SharePoint (412)');
    documents.find(document => document.Id === id).AsignadoAId = JSON.parse(options.body).AsignadoAId;
  }, [{ id: 1, asignadoId: 10 }]);
  await assert.rejects(app.run('syncDocumentAssignments()'), /1 documentos actualizados;.*#22.*412/);
  conflict = false;
  await app.run('syncDocumentAssignments()');
  assert.deepEqual(writes, [21, 22, 22]);
});

test('uploads read the latest opportunity assignment before creating the document', async () => {
  const writes = [];
  const app = dashboard(async (path, options) => {
    writes.push({ path, options });
    return path.endsWith('/items') ? { Id: 31 } : null;
  }, [{ id: 1, asignadoId: 9 }]);
  await app.run(`
    fetchData = async () => { data = [{ id: 1, asignadoId: 10 }]; };
    uploadOpportunityDocument(1, {
      name: 'sample.txt', size: 1, arrayBuffer: async () => new ArrayBuffer(1)
    })
  `);
  assert.deepEqual(JSON.parse(writes[0].options.body), {
    Title: 'sample.txt', OportunidadId: 1, AsignadoAId: 10, EstadoValidacion: 'Pendiente'
  });
  assert.match(writes[1].path, /AttachmentFiles\/add/);
});
