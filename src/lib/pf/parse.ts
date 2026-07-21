/* eslint-disable @typescript-eslint/no-explicit-any */

/** Extract the JSON payload of <script id="__NEXT_DATA__"> and return props.pageProps. */
export function extractPageProps(html: string): any {
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error("__NEXT_DATA__ not found in page");
  const from = start + marker.length;
  const end = html.indexOf("</script>", from);
  if (end === -1) throw new Error("__NEXT_DATA__ script tag not closed");
  const json = JSON.parse(html.slice(from, end));
  const pageProps = json?.props?.pageProps;
  if (!pageProps) throw new Error("pageProps missing in __NEXT_DATA__");
  return pageProps;
}
