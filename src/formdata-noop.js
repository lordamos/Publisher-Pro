const _FormData = typeof window !== 'undefined' ? window.FormData : undefined;
export { _FormData as FormData };
export default _FormData;
