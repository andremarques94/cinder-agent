// https://developers.cloudflare.com/workers/wrangler/bundling/#including-non-javascript-modules
declare module "*.woff2" {
  const data: ArrayBuffer;
  export default data;
}
