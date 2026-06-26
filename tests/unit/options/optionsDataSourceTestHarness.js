export const dataSourceParent = { type: 'data_source_id', data_source_id: 'db-123' };
export const databaseParent = { type: 'database_id', database_id: 'db-456' };
export const workspaceParent = { type: 'workspace', workspace: true };

export function titleProperty(plainText) {
  return { title: [{ plain_text: plainText }] };
}

export function urlProperty(url = undefined) {
  return {
    type: 'url',
    ...(url === undefined ? {} : { url }),
  };
}

export function buildPage({
  id = 'page-1',
  parent = workspaceParent,
  title = 'Test Page',
  properties = { title: titleProperty(title) },
} = {}) {
  return {
    object: 'page',
    id,
    parent,
    properties,
  };
}

export function buildDataSource({
  object = 'data_source',
  id = 'db-1',
  parent = { type: 'workspace' },
  title = 'Regular Database',
  properties = { Title: { type: 'title' } },
} = {}) {
  return {
    object,
    id,
    parent,
    title: [{ plain_text: title }],
    properties,
  };
}

export function mockRuntimeResponse(sendMessageMock, response) {
  sendMessageMock.mockImplementation((_msg, callback) => {
    callback(response);
  });
}
