/** Simple template renderer for prompt templates.
 *  Replaces {variable} placeholders with values from InputDataPacket.
 */

import type { InputDataPacket } from "./types";

/** Replace {text}, {url}, {title} in a template string. */
export function renderTemplate(template: string, data: InputDataPacket): string {
  const vars: Record<string, string> = {
    text: data.text ?? "",
    url: data.context?.url ?? "",
    title: data.context?.title ?? "",
  };

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    // hasOwnProperty, not `in`: the latter walks the prototype chain, turning
    // literal "{constructor}" or "{toString}" in a template into stringified
    // builtins instead of leaving them untouched.
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}
