/** Simple template renderer for prompt templates.
 *  Replaces {variable} placeholders with values from InputDataPacket.
 */

import type { InputDataPacket } from "./types";

/** Replace {text}, {html}, {page_text}, {url}, {title} in a template string. */
export function renderTemplate(template: string, data: InputDataPacket): string {
  const vars: Record<string, string> = {
    text: data.text ?? "",
    html: data.html ?? "",
    page_text: data.page_text ?? "",
    url: data.context?.url ?? "",
    title: data.context?.title ?? "",
  };

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in vars ? vars[key] : match;
  });
}
