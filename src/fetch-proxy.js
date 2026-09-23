const _fetch = typeof window !== 'undefined' ? window.fetch.bind(window) : undefined;
const _Headers = typeof window !== 'undefined' ? window.Headers : undefined;
const _Request = typeof window !== 'undefined' ? window.Request : undefined;
const _Response = typeof window !== 'undefined' ? window.Response : undefined;

export { _fetch as fetch, _Headers as Headers, _Request as Request, _Response as Response };
export default _fetch;
